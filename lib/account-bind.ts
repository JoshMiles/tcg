// Sign-in bookkeeping for player accounts (the player-side twin of `staff:ids`, see lib/staff.ts). The Twitch account ID is the proof of who
// is signing in, because a login can be freed and taken by a different person:
//   `acct:ids`       hash, Twitch ID -> login, written once (hsetnx) and repointed by a move (lib/account-move.ts).
//   `acct:conflicts` hash, login -> { storedId, newId, seen, count }: a different Twitch account signed in on a login whose profile holds
//                    another ID and the old profile could not be moved aside. The profile is left as it was; Data health lists these.
// What a sign-in does (non-sandbox), in order:
//   1. finish a move of this login that was left half done;
//   2. another account's profile sits on this login (a conflict): move it aside (`<login>~<n>`), this account starts fresh;
//   3. this ID already owns a profile under another login: a Twitch rename moves it here when this login is blank; a moved-aside
//      account is only ever restored by its owner, on /account;
//   4. make sure the login has a profile holding the ID.
// Nothing here can block a sign-in: every failure is logged and swallowed.

import { inSandbox, kv } from './db';
import { ensureUserProfile, getUserProfile, saveUserProfile } from './kv';
import { classifySignIn, IDS, type SignInKind } from './account-id';
import { cardsOf, finishMove, moveAccount, moveAside } from './account-move';
import { isTwitchId } from './staff-core';

const CONFLICTS = 'acct:conflicts';

export interface AccountConflict { login: string; storedId: string; newId: string; seen: number; count: number }

async function recordConflict(name: string, storedId: string, id: string): Promise<void> {
  const prev = await kv.hget<{ count?: unknown }>(CONFLICTS, name);
  // shortcut: read-then-write, so two simultaneous sign-ins can lose one count; it is a diagnostic, upgrade if it ever gates anything.
  await kv.hset(CONFLICTS, { [name]: { storedId, newId: id, seen: Date.now(), count: (typeof prev?.count === 'number' ? prev.count : 0) + 1 } });
}

/**
 * Replaces the bare `ensureUserProfile(login, id)` at the two sign-in sites (the panel calls it before saving its opaque link, because a move
 * removes the links to the login it moves). Creates the profile if missing, fills in the ID on a profile that has none, remembers ID -> login,
 * moves another account's profile aside, and follows a Twitch rename. A sandbox sign-in (fake IDs) keeps the old behaviour and records nothing.
 * Returns what the sign-in was (`conflict` even when the other profile was moved aside), or null if it failed.
 */
export async function bindAccount(login: string, id: string): Promise<SignInKind | null> {
  const name = login.toLowerCase();
  try {
    if (await inSandbox()) { await ensureUserProfile(name, id); return classifySignIn(await getUserProfile(name), undefined); }
    await finishMove(name); // a move of this login that stopped part way (no journal: a harmless refusal)
    let profile = await getUserProfile(name);
    const kind = classifySignIn(profile, id);
    if (kind === 'conflict') {
      const storedId = String(profile!.twitchId);
      console.warn(`[account] ${name} signed in with Twitch ID ${id}, but the profile belongs to ID ${storedId}: moving it aside`);
      const res = await moveAside(name, `A different Twitch account signed in as ${name}`);
      if (!res.ok) { // the old profile stays; the session check (lib/session.ts) keeps this account out of it
        console.error(`[account] could not move ${name} aside: ${res.error}`);
        await recordConflict(name, storedId, id);
        return kind;
      }
      profile = null;
    }
    const owner = isTwitchId(id) ? await kv.hget<string>(IDS, id) : null;
    if (owner && owner !== name && !owner.includes('~')) {
      // The same Twitch account under another login: a Twitch rename. Move the profile here unless this login already has cards (then /account says so).
      const old = await getUserProfile(owner);
      if (old?.twitchId === id && (await cardsOf(name)) === 0) {
        const res = await moveAccount(owner, name, { mode: 'rename', replaceBlank: true, reason: 'Twitch name changed' });
        if (!res.ok) console.error(`[account] could not move ${owner} to ${name}: ${res.error}`);
        profile = await getUserProfile(name);
      }
    }
    // A `~` owner is a moved-aside account: only its owner restoring it from /account moves it back.
    const next = classifySignIn(profile, id);
    if (next === 'new') await ensureUserProfile(name, isTwitchId(id) ? id : undefined);
    else if (next === 'claim') await saveUserProfile({ ...profile!, twitchId: id });
    if (isTwitchId(id)) await kv.hsetnx(IDS, id, name);
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
