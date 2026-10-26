// Nightly Twitch check (ROADMAP 47.8): overlay and bot pulls carry only a login, so between sign-ins a renamed player's pulls land on a new
// ID-less profile, and a newcomer who takes an old login is credited to the old owner. This asks Twitch which login each known Twitch ID
// has now and, for a rename into a login with no cards, follows it the way a sign-in does (lib/account-bind.ts). Anything else is left for staff.
// Known IDs: every profile reachable from `acct:ids` or the collections that holds a numeric twitchId; missing `acct:ids` entries are filled in.
// The last run is saved in `acct:helixcheck` (replaced each run) and shown on Data health.

import { inSandbox, kv } from './db';
import { getAllCollectionUsers, getUserProfile, getUserProfiles } from './kv';
import { IDS } from './account-id';
import { cardsOf, moveAccount } from './account-move';
import { isTwitchId } from './staff-core';
import { fetchTwitchLoginsById } from './twitch-helix';

const KEY = 'acct:helixcheck';
/** Renames followed per run; the rest wait for the next night (each move takes the global move lock). */
export const MAX_MOVES = 25;
const LIST_MAX = 50;
const BATCH = 25;

export interface AccountCheck {
  at: number;
  /** Twitch IDs looked up. */
  checked: number;
  /** IDs Twitch did not return (deleted or banned accounts); left alone. */
  missing: number;
  renamed: { from: string; to: string }[];
  needsStaff: { login: string; id: string; twitchLogin: string; why: string }[];
  error?: string;
}

/** The last nightly check, or null. Never throws. */
export async function getAccountCheck(): Promise<AccountCheck | null> {
  try { return (await kv.get<AccountCheck>(KEY)) ?? null; } catch { return null; }
}

export interface CheckOpts { lookup?: (ids: string[]) => Promise<Record<string, string>>; maxMoves?: number }

/** Refuses outside production and inside a sandbox (it writes real accounts and calls Twitch). `opts` is for the check only. */
export async function runAccountCheck(opts: CheckOpts = {}, now = Date.now()): Promise<AccountCheck> {
  if (process.env.VERCEL_ENV !== 'production') throw new Error('The account check only runs on the production deployment.');
  if (await inSandbox()) throw new Error('The account check never runs inside a sandbox.');
  const lookup = opts.lookup ?? fetchTwitchLoginsById;
  const maxMoves = opts.maxMoves ?? MAX_MOVES;
  const out: AccountCheck = { at: now, checked: 0, missing: 0, renamed: [], needsStaff: [] };

  try {
    const reg = ((await kv.hgetall(IDS).catch(() => null)) as Record<string, string> | null) ?? {};
    const logins = [...new Set([...Object.values(reg), ...(await getAllCollectionUsers()).map(u => u.username)].map(l => String(l).toLowerCase()))].filter(l => !l.includes('~'));
    const byId = new Map<string, string>(); // Twitch ID -> the login holding its profile (the registry wins if two profiles claim one ID)
    for (let i = 0; i < logins.length; i += BATCH) {
      const part = logins.slice(i, i + BATCH);
      const profiles = await getUserProfiles(part);
      for (const l of part) { const p = profiles.get(l); if (p && isTwitchId(p.twitchId) && (!byId.has(p.twitchId) || reg[p.twitchId] === l)) byId.set(p.twitchId, l); }
    }
    for (const [id, login] of byId) if (!(id in reg)) await kv.hsetnx(IDS, id, login); // profiles from before the registry existed
    out.checked = byId.size;

    const current = byId.size > 0 ? await lookup([...byId.keys()]) : {};
    let moves = 0;
    for (const [id, login] of byId) {
      const twitch = current[id];
      if (!twitch) { out.missing++; continue; }
      if (twitch === login) continue;
      const staff = (why: string) => out.needsStaff.push({ login, id, twitchLogin: twitch, why });
      const target = await getUserProfile(twitch);
      if (isTwitchId(target?.twitchId) && target!.twitchId !== id) { staff('The new login holds a profile of a different Twitch account.'); continue; }
      if ((await cardsOf(twitch)) > 0) { staff('The new login already has cards.'); continue; }
      if (moves >= maxMoves) continue;
      moves++;
      const res = await moveAccount(login, twitch, { mode: 'rename', replaceBlank: true, reason: 'Twitch name changed (nightly check)' });
      if (res.ok) out.renamed.push({ from: login, to: twitch }); else staff(res.error);
    }
  } catch (e) {
    out.error = e instanceof Error ? e.message : 'The account check failed.';
  }
  out.renamed = out.renamed.slice(0, LIST_MAX);
  out.needsStaff = out.needsStaff.slice(0, LIST_MAX);
  await kv.set(KEY, out);
  return out;
}
