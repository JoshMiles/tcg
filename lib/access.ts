// Closed alpha / beta, the server side (pure parts in access-core.ts, the cookie in access-token.ts). Settings are the KV key
// `access:settings`, testers the hash `access:testers` (login -> record), changes are logged in `access:log`.
//
// Like the staff list, this is real account data, so it lives in the PRODUCTION namespace (`prodKv`) even inside a sandbox, and a
// preview deployment (fenced from writing it) cannot change it.

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { isPreview, kv, prodKv, runInSandbox } from './db';
import { notifyAdminLog } from './discord';
import { recordAudit } from './audit';
import { getSession, type Session } from './session';
import { getStaffRecord } from './staff';
import { getStaff } from './staff-guard';
import { resolveRole, cleanLogin } from './staff-core';
import {
  MAX_TESTERS, MODE_LABELS, SPECIAL_SEASON_ID, SPECIAL_SEASON_NAME, TESTER_ACHIEVEMENTS, bestTier, canEnterTier, isApiPath, isExemptPath, normalizeAccess,
  sanitizeTester, type AccessMode, type AccessLabel, type AccessSettings, type AccessTier, type TesterRecord, type TesterTier,
} from './access-core';

const SETTINGS = 'access:settings';
const TESTERS = 'access:testers';
const LOG = 'access:log';
const LOG_CAP = 100;

export interface AccessResult { ok: boolean; message: string }
export interface AccessLogEntry { at: number; by: string; what: string }
const PREVIEW_REFUSAL: AccessResult = { ok: false, message: 'Access cannot be changed on a preview deployment. Do it on the live site.' };

export async function getAccessSettings(): Promise<AccessSettings> {
  try { return normalizeAccess(await prodKv.get(SETTINGS)); } catch { return normalizeAccess(null); }
}

async function logChange(by: string, what: string) {
  try { await prodKv.lpush(LOG, { at: Date.now(), by, what }); await prodKv.ltrim(LOG, 0, LOG_CAP - 1); } catch { /* best effort */ }
}
export async function getAccessLog(limit = 20): Promise<AccessLogEntry[]> {
  try { return (await prodKv.lrange<AccessLogEntry>(LOG, 0, limit - 1)) ?? []; } catch { return []; }
}

/** Saves the mode, label and closed-page message. `v` goes up on every change, which sends every signed cookie back for a re-check. */
export async function saveAccessSettings(by: string, input: { mode: AccessMode; label: AccessLabel; message?: string }): Promise<AccessResult> {
  if (isPreview()) return PREVIEW_REFUSAL;
  const before = await getAccessSettings();
  const next = normalizeAccess({ mode: input.mode, label: input.label, message: input.message, v: before.v + 1 });
  await prodKv.set(SETTINGS, next);
  const parts: string[] = [];
  if (before.mode !== next.mode) parts.push(`mode ${MODE_LABELS[before.mode]} to ${MODE_LABELS[next.mode]}`);
  if (before.label !== next.label) parts.push(`banner ${before.label} to ${next.label}`);
  if ((before.message ?? '') !== (next.message ?? '')) parts.push('message changed');
  const what = parts.join(', ') || 'saved, nothing changed';
  await logChange(by, what);
  void notifyAdminLog({ action: 'Site access changed', subject: MODE_LABELS[next.mode], detail: what, by });
  return { ok: true, message: next.mode === 'open' ? 'Saved. The site is open to everyone.' : `Saved. The site is now ${MODE_LABELS[next.mode].toLowerCase()}.` };
}

// ── Testers ──
export async function getTester(login: string): Promise<TesterRecord | null> {
  const l = cleanLogin(login);
  if (!l) return null;
  try { return sanitizeTester(await prodKv.hget(TESTERS, l)); } catch { return null; }
}

export async function listTesters(): Promise<TesterRecord[]> {
  try {
    const all = (await prodKv.hgetall(TESTERS)) ?? {};
    return Object.values(all).map(sanitizeTester).filter((r): r is TesterRecord => !!r)
      .sort((a, b) => (a.tier === b.tier ? a.login.localeCompare(b.login) : a.tier === 'alpha' ? -1 : 1));
  } catch { return []; }
}

/** The achievement is written straight into the viewer's earned list and never taken back (even if they are removed, or move up a tier). */
async function awardTesterAchievement(login: string, tier: TesterTier): Promise<void> {
  const a = TESTER_ACHIEVEMENTS[tier];
  try {
    await runInSandbox(null, async () => {
      const key = `user:${login}:ach`;
      const have = await kv.hget(key, a.id);
      if (have) return;
      await kv.hset(key, { [a.id]: { id: a.id, seasonId: SPECIAL_SEASON_ID, seasonName: SPECIAL_SEASON_NAME, title: a.title, detail: a.detail, icon: a.icon, have: 1, need: 1, earned: true, earnedAt: Date.now() } });
    });
  } catch { /* best effort: setting the tier again awards it */ }
}

/** Adds someone to the list (or moves them to another tier) and awards the tester achievement. */
export async function setTester(by: string, loginInput: unknown, tier: unknown, noteInput?: unknown): Promise<AccessResult> {
  if (isPreview()) return PREVIEW_REFUSAL;
  const login = cleanLogin(loginInput);
  if (!login) return { ok: false, message: 'Enter a Twitch username (3 to 25 letters, numbers or underscores).' };
  if (tier !== 'alpha' && tier !== 'beta') return { ok: false, message: 'Pick alpha or beta.' };
  const existing = await getTester(login);
  if (!existing && Object.keys((await prodKv.hgetall(TESTERS)) ?? {}).length >= MAX_TESTERS) return { ok: false, message: `The list is full (${MAX_TESTERS} testers).` };
  const note = typeof noteInput === 'string' ? noteInput.trim().slice(0, 120) : existing?.note;
  const record: TesterRecord = { login, tier, addedBy: existing?.addedBy || by, addedAt: existing?.addedAt || Date.now(), ...(note ? { note } : {}) };
  await prodKv.hset(TESTERS, { [login]: record });
  await awardTesterAchievement(login, tier);
  await recordAudit(login, existing ? 'Tester tier changed' : 'Tester added', `${existing ? `${existing.tier} to ` : 'as '}${tier}`);
  await logChange(by, `${login} ${existing ? `${existing.tier} to ${tier}` : `added as ${tier}`}`);
  return { ok: true, message: existing ? `${login} is now a${tier === 'alpha' ? 'n alpha' : ' beta'} tester.` : `${login} added as a${tier === 'alpha' ? 'n alpha' : ' beta'} tester.` };
}

export async function removeTester(by: string, loginInput: unknown): Promise<AccessResult> {
  if (isPreview()) return PREVIEW_REFUSAL;
  const login = cleanLogin(loginInput);
  const rec = login ? await getTester(login) : null;
  if (!login || !rec) return { ok: false, message: 'That person isn\'t on the tester list.' };
  await prodKv.hdel(TESTERS, login);
  await recordAudit(login, 'Tester removed', `was ${rec.tier}`);
  await logChange(by, `${login} removed (was ${rec.tier})`);
  return { ok: true, message: `${login} is no longer a tester. They keep the achievement, and lose access within the hour.` };
}

/** Removes the tester record on account deletion (the achievement goes with the rest of their data). */
export async function deleteTesterRecord(login: string): Promise<void> {
  try { await prodKv.hdel(TESTERS, login.toLowerCase()); } catch { /* best effort */ }
}

// ── Who may enter ──
/** The access tier for a signed-in viewer, from the live staff and tester lists. */
export async function tierFor(session: Pick<Session, 'username' | 'twitchId' | 'sandbox'> | null): Promise<AccessTier | null> {
  if (!session || session.sandbox) return null;
  const staff = resolveRole({ login: session.username, twitchId: session.twitchId }, await getStaffRecord(session.username));
  const tester = staff ? null : (await getTester(session.username))?.tier ?? null;
  return bestTier(!!staff, tester);
}

/** True when this request may use the site now: the site is open, or the signed-in viewer is a tester the mode includes, or staff. */
export async function hasSiteAccess(): Promise<boolean> {
  const settings = await getAccessSettings();
  if (settings.mode === 'open') return true;
  const tier = await tierFor(await getSession());
  if (tier && canEnterTier(settings.mode, tier)) return true;
  return !!(await getStaff()); // the owner's emergency password login and any staff cookie
}

/** The authoritative check for the public layouts: redirects to /closed. The paths the gate leaves alone (FAQ, privacy, terms) pass. */
export async function requireSiteAccess(): Promise<void> {
  try {
    const path = (await headers()).get('x-tcg-path');
    if (path && isExemptPath(path)) return;
  } catch { /* no request headers: check anyway */ }
  let allowed = true;
  try { allowed = await hasSiteAccess(); } catch { allowed = true; } // a KV blip must not lock the site while live
  if (!allowed) redirect('/closed');
}

/** For the signed-in public APIs: a 403 answer when the site is closed to this caller, else null. */
export async function siteClosedResponse(): Promise<NextResponse | null> {
  try {
    if (await hasSiteAccess()) return null;
  } catch { return null; }
  return NextResponse.json({ ok: false, error: 'closed' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
}

