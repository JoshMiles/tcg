// Sign-in bookkeeping for player accounts (the player-side twin of `staff:ids`, see lib/staff.ts). Records, never refuses:
//   `acct:ids`       hash, Twitch ID -> login, written once (hsetnx), so a later change can tell which login an ID first played as.
//   `acct:conflicts` hash, login -> { storedId, newId, seen, count }: a different Twitch account signed in on a login whose profile
//                    holds another ID. The profile is left exactly as it was; the Data health panel lists these.
// Nothing here can block a sign-in: every failure is logged and swallowed.

import { inSandbox, kv } from './db';
import { ensureUserProfile, getUserProfile, saveUserProfile } from './kv';
import { classifySignIn, type SignInKind } from './account-id';
import { isTwitchId } from './staff-core';

const IDS = 'acct:ids';
const CONFLICTS = 'acct:conflicts';

export interface AccountConflict { login: string; storedId: string; newId: string; seen: number; count: number }

/**
 * Replaces the bare `ensureUserProfile(login, id)` at the two sign-in sites. Creates the profile if missing, fills in the ID on a
 * profile that has none, remembers ID -> login, and records (without changing anything) when another account signs in on the login.
 * A sandbox sign-in (fake IDs) keeps the old behaviour and records nothing. Returns what the sign-in was, or null if it failed.
 */
export async function bindAccount(login: string, id: string): Promise<SignInKind | null> {
  const name = login.toLowerCase();
  try {
    if (await inSandbox()) { await ensureUserProfile(name, id); return classifySignIn(await getUserProfile(name), undefined); }
    const profile = await getUserProfile(name);
    const kind = classifySignIn(profile, id);
    if (kind === 'new') await ensureUserProfile(name, isTwitchId(id) ? id : undefined);
    else if (kind === 'claim') await saveUserProfile({ ...profile!, twitchId: id });
    else if (kind === 'conflict') {
      const storedId = String(profile!.twitchId);
      console.warn(`[account] ${name} signed in with Twitch ID ${id}, but the profile belongs to ID ${storedId}`);
      const prev = await kv.hget<{ count?: unknown }>(CONFLICTS, name);
      // shortcut: read-then-write, so two simultaneous sign-ins can lose one count; it is a diagnostic, upgrade if it ever gates anything.
      await kv.hset(CONFLICTS, { [name]: { storedId, newId: id, seen: Date.now(), count: (typeof prev?.count === 'number' ? prev.count : 0) + 1 } });
    }
    if (kind !== 'conflict' && isTwitchId(id)) await kv.hsetnx(IDS, id, name);
    return kind;
  } catch (e) {
    console.error('[account] could not record the sign-in:', e instanceof Error ? e.message : e);
    return null;
  }
}

/** The recorded conflicts, newest first. Never throws. */
export async function listAccountConflicts(): Promise<AccountConflict[]> {
  try {
    const all = await kv.hgetall<Record<string, Partial<AccountConflict>>>(CONFLICTS);
    return Object.entries(all ?? {})
      .map(([login, c]) => ({ login, storedId: String(c.storedId ?? ''), newId: String(c.newId ?? ''), seen: Number(c.seen) || 0, count: Number(c.count) || 0 }))
      .sort((a, b) => b.seen - a.seen);
  } catch { return []; }
}
