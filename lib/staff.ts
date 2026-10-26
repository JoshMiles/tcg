// The staff list (server side). Stored in KV as the hash `staff:members` (login -> record) with a capped change log `staff:log`.
// Sign-in bookkeeping is kept apart so a sign-in never rewrites a record: `staff:seen` (login -> last sign-in time and display
// name) and `staff:ids` (login -> the Twitch ID bound on first sign-in, written once). Both only fill in what the record lacks.
//
// Staff are real accounts, not test data, so they live in the PRODUCTION namespace even while an admin is inside a sandbox
// (`prodKv`, not the sandbox-aware `kv`). Otherwise entering a sandbox would make every staff member look like a stranger.

import { notifyAdminLog } from './discord';
import { isPreview, prodKv, runInSandbox } from './db';
import { getUserProfile } from './kv';
import {
  SUPER_ADMINS, canManage, canModerate, cleanLogin, isSuperAdmin, isTwitchId, sanitizeStaffRecord,
  type AssignableRole, type ModAction, type ModActor, type ModTarget, type ModVerdict, type StaffRecord, type StaffRole,
} from './staff-core';

const MEMBERS = 'staff:members';
const LOG = 'staff:log';
const SEEN = 'staff:seen';
const IDS = 'staff:ids';
const LOG_CAP = 200;

export interface StaffActor { login: string; role: StaffRole }
export interface StaffResult { ok: boolean; message: string }

/** The staff list is real account data shared with production, so preview deployments (which are fenced from writing it) can't change it. */
const PREVIEW_REFUSAL: StaffResult = { ok: false, message: 'Staff cannot be changed on a preview deployment. Do it on the live site.' };
export interface StaffLogEntry { at: number; by: string; action: 'added' | 'role' | 'removed'; login: string; detail: string }

export async function getStaffRecord(login: string): Promise<StaffRecord | null> {
  const l = cleanLogin(login);
  if (!l) return null;
  try {
    const rec = sanitizeStaffRecord(await prodKv.hget(MEMBERS, l));
    if (!rec || rec.twitchId) return rec;
    const bound = await prodKv.hget<{ id?: unknown }>(IDS, l);
    return isTwitchId(bound?.id) ? { ...rec, twitchId: bound.id } : rec;
  } catch { return null; }
}

/** The staff role a login holds right now: a super admin from the code, else the staff list, else null. `asActor` reads "password" as the emergency login (it is only ever recorded as `flags.by`, never a viewer). */
async function roleOfLogin(login: string, asActor = false): Promise<StaffRole | null> {
  const l = login.toLowerCase();
  if ((asActor && l === 'password') || SUPER_ADMINS.some(s => s.login === l)) return 'super';
  return (await getStaffRecord(l))?.role ?? null;
}

/** Looks up what `canModerate` needs to know about a viewer: their staff role and who set the restrictions they carry. */
export async function moderationTarget(login: string): Promise<ModTarget> {
  const name = login.toLowerCase().replace(/^@/, '');
  const by = (await getUserProfile(name))?.flags?.by;
  return { login: name, role: await roleOfLogin(name), flagsByRole: by ? await roleOfLogin(by, true) : null };
}

/** The moderation rule for real people: looks each target up and returns the first refusal, or ok. Call before acting. */
export async function checkModerate(actor: ModActor, logins: string[], action: ModAction): Promise<ModVerdict> {
  for (const login of new Set(logins.filter(Boolean))) {
    const v = canModerate(actor, await moderationTarget(login), action);
    if (!v.ok) return v;
  }
  return { ok: true };
}

/** Everyone on the staff list (not the super admin, who comes from the code), admins first, then by name. */
export async function listStaff(): Promise<StaffRecord[]> {
  try {
    const [all, ids, seen] = await Promise.all([
      prodKv.hgetall(MEMBERS), prodKv.hgetall<Record<string, { id?: unknown }>>(IDS), prodKv.hgetall<Record<string, { lastLogin?: unknown; displayName?: unknown }>>(SEEN),
    ]);
    return Object.values(all ?? {}).map(sanitizeStaffRecord).filter((r): r is StaffRecord => !!r)
      .map(r => {
        const id = ids?.[r.login]?.id, s = seen?.[r.login];
        const name = typeof s?.displayName === 'string' && s.displayName ? s.displayName.slice(0, 40) : undefined;
        return {
          ...r,
          ...(!r.twitchId && isTwitchId(id) ? { twitchId: id } : {}),
          ...(name ? { displayName: name } : {}),
          ...(typeof s?.lastLogin === 'number' ? { lastLogin: s.lastLogin } : {}),
        };
      })
      .sort((a, b) => (a.role === b.role ? a.login.localeCompare(b.login) : a.role === 'admin' ? -1 : 1));
  } catch { return []; }
}

export async function getStaffLog(limit = 40): Promise<StaffLogEntry[]> {
  try { return (await prodKv.lrange<StaffLogEntry>(LOG, 0, limit - 1)) ?? []; } catch { return []; }
}

async function log(entry: Omit<StaffLogEntry, 'at'>) {
  void notifyAdminLog({ action: `Staff ${entry.action}`, subject: entry.login, detail: entry.detail, by: entry.by });
  try { await prodKv.lpush(LOG, { at: Date.now(), ...entry }); await prodKv.ltrim(LOG, 0, LOG_CAP - 1); } catch { /* best effort */ }
}

/** The fixed super admins, for display (from the code, and any extra IDs in the environment). */
export function listSuperAdmins(): { login: string; twitchId: string }[] {
  const extra = (process.env.SUPER_ADMIN_TWITCH_IDS ?? '').split(',').map(s => s.trim()).filter(isTwitchId)
    .filter(id => !SUPER_ADMINS.some(s => s.twitchId === id)).map(id => ({ login: `Twitch ID ${id}`, twitchId: id }));
  return [...SUPER_ADMINS, ...extra];
}

/** A viewer's Twitch ID from their profile, if they have played (so a new staff member is bound to the account, not just the name). */
async function knownTwitchId(login: string): Promise<{ id?: string; displayName?: string }> {
  try {
    const p = await runInSandbox(null, () => getUserProfile(login));
    return { id: isTwitchId(p?.twitchId) ? p!.twitchId : undefined, displayName: p?.displayName };
  } catch { return {}; }
}

export async function addStaff(actor: StaffActor, loginInput: unknown, role: AssignableRole): Promise<StaffResult> {
  if (isPreview()) return PREVIEW_REFUSAL;
  const login = cleanLogin(loginInput);
  if (!login) return { ok: false, message: 'Enter a Twitch username (3 to 25 letters, numbers or underscores).' };
  if (role !== 'admin' && role !== 'mod') return { ok: false, message: 'Pick a role.' };
  if (!canManage(actor.role, role)) return { ok: false, message: role === 'admin' ? 'Only the super admin can add admins.' : 'You can\'t add mods.' };
  if (SUPER_ADMINS.some(s => s.login === login)) return { ok: false, message: `${login} is the super admin already.` };
  if (await getStaffRecord(login)) return { ok: false, message: `${login} is already staff. Change their role instead.` };
  const known = await knownTwitchId(login);
  if (known.id && isSuperAdmin({ twitchId: known.id })) return { ok: false, message: `${login} is the super admin already.` };
  const record: StaffRecord = {
    login, role, addedBy: actor.login, addedAt: Date.now(),
    ...(known.id ? { twitchId: known.id } : {}), ...(known.displayName ? { displayName: known.displayName } : {}),
  };
  await Promise.all([prodKv.hdel(IDS, login), prodKv.hdel(SEEN, login)]); // a re-added login starts fresh, whatever an earlier stint left behind
  await prodKv.hset(MEMBERS, { [login]: record });
  await log({ by: actor.login, action: 'added', login, detail: `as ${role}` });
  return { ok: true, message: `${known.displayName ?? login} is now ${role === 'admin' ? 'an admin' : 'a mod'}.${known.id ? '' : ' They have not played yet, so the name is matched until they first sign in.'}` };
}

export async function setStaffRole(actor: StaffActor, loginInput: unknown, role: AssignableRole): Promise<StaffResult> {
  if (isPreview()) return PREVIEW_REFUSAL;
  const login = cleanLogin(loginInput);
  const rec = login ? await getStaffRecord(login) : null;
  if (!login || !rec) return { ok: false, message: 'That person isn\'t on the staff list.' };
  if (role !== 'admin' && role !== 'mod') return { ok: false, message: 'Pick a role.' };
  // Both the role they have and the role they would get must be one the actor may manage (so an admin can't promote a mod to admin).
  // Checked before anything else, so a caller with no rights never gets a success message.
  if (!canManage(actor.role, rec.role) || !canManage(actor.role, role)) return { ok: false, message: actor.role === 'mod' ? 'You can\'t change staff.' : 'Only the super admin can change admins or make someone an admin.' };
  if (rec.role === role) return { ok: true, message: `${login} is already ${role === 'admin' ? 'an admin' : 'a mod'}.` };
  await prodKv.hset(MEMBERS, { [login]: { ...rec, role } });
  await log({ by: actor.login, action: 'role', login, detail: `${rec.role} to ${role}` });
  return { ok: true, message: `${login} is now ${role === 'admin' ? 'an admin' : 'a mod'}.` };
}

export async function removeStaff(actor: StaffActor, loginInput: unknown): Promise<StaffResult> {
  if (isPreview()) return PREVIEW_REFUSAL;
  const login = cleanLogin(loginInput);
  const rec = login ? await getStaffRecord(login) : null;
  if (!login || !rec) return { ok: false, message: 'That person isn\'t on the staff list.' };
  if (!canManage(actor.role, rec.role)) return { ok: false, message: 'Only the super admin can remove admins.' };
  await prodKv.hdel(MEMBERS, login);
  await log({ by: actor.login, action: 'removed', login, detail: `was ${rec.role}` });
  return { ok: true, message: `${login} is no longer staff.` };
}

/** Notes a sign-in: stamps the time in `staff:seen`, and binds the account's Twitch ID the first time with a write-once field (never rebinds). Never touches the staff record. */
export async function touchStaffLogin(login: string, twitchId: string, displayName: string): Promise<void> {
  if (isPreview()) return; // best effort, and a preview must not write the shared staff list
  try {
    const rec = await getStaffRecord(login);
    if (!rec) return;
    await prodKv.hset(SEEN, { [rec.login]: { lastLogin: Date.now(), displayName } });
    if (!rec.twitchId && isTwitchId(twitchId)) await prodKv.hsetnx(IDS, rec.login, { id: twitchId });
  } catch { /* best effort */ }
}
