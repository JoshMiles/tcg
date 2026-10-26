// Moving an account to a new login ("Move aside", ROADMAP 47.8): everything a viewer owns goes to `<login>~<n>`, so the login is free
// for a different Twitch account. KV has no transactions, so the move is a journalled list of steps, each safe to run twice:
//   `acct:moves`  hash, login -> { to, id, reason, startedAt, done }  written first, cleared last; a leftover one is an unfinished move
//   `acct:aside`  hash, `~` login -> { id, login, movedAt, reason }   what was moved, and from which login (the Data health panel)
// A failed move leaves its journal; `finishMove` (Data health, "Finish move") or another `moveAccount` carries on from the first step
// that is not marked done, with the same target. Never half-applied for long, and never silently half-applied.
// The new empty account for the freed login, and the sign-in check that sends the old owner to their `~` account, are PR 3.

import { inSandbox, isPreview, kv } from './db';
import { getCollection, getUserProfile, listSeasons, saveUserProfile, deleteUserProfile, withCollectionLock, withLock } from './kv';
import { IDS as ACCT_IDS } from './account-bind';
import { removeOpaqueLinks } from './account-deletion';
import { deleteTesterRecord } from './access';
import { moveDiscordLink } from './discord-user';
import { renameFeedbackOf } from './feedback';
import { moveScoreBonus } from './score-bonus';
import { isTracking, renameOwner } from './serials';
import { pinStaffId } from './staff';
import { isTwitchId } from './staff-core';
import { cancelOpenTrades, renameInTradeHistory } from './trades';
import { moveUserSettings } from './user-settings-store';
import { moveUserSnapshots, setHidden, takeUserSnapshot } from './user-admin';
import { recordAudit } from './audit';

const MOVES = 'acct:moves';
const ASIDE = 'acct:aside';

export interface MoveJournal { to: string; /** The profile's Twitch ID, or '' when it had none. */ id: string; reason: string; startedAt: number; done: string[] }
export interface UnfinishedMove extends MoveJournal { from: string }
export interface AsideAccount { to: string; id: string; login: string; movedAt: number; reason: string }
export type MoveResult = { ok: true; to: string; cards: number } | { ok: false; error: string };

const lower = (s: string) => s.trim().toLowerCase();
const fail = (error: string): MoveResult => ({ ok: false, error });
const asObj = <T>(v: unknown): T | null => {
  try { const o = typeof v === 'string' ? JSON.parse(v) : v; return o && typeof o === 'object' ? (o as T) : null; } catch { return null; }
};

async function journals(): Promise<Record<string, MoveJournal>> {
  const h = ((await kv.hgetall(MOVES).catch(() => null)) as Record<string, unknown> | null) ?? {};
  const out: Record<string, MoveJournal> = {};
  for (const [from, v] of Object.entries(h)) { const j = asObj<MoveJournal>(v); if (j?.to) out[from] = { ...j, done: Array.isArray(j.done) ? j.done : [] }; }
  return out;
}

/** The unfinished moves (a journal that was never cleared), oldest first. */
export async function listUnfinishedMoves(): Promise<UnfinishedMove[]> {
  return Object.entries(await journals()).map(([from, j]) => ({ from, ...j })).sort((a, b) => a.startedAt - b.startedAt);
}

/** The accounts that were moved aside, newest first. */
export async function listAsideAccounts(): Promise<AsideAccount[]> {
  const h = ((await kv.hgetall(ASIDE).catch(() => null)) as Record<string, unknown> | null) ?? {};
  const out: AsideAccount[] = [];
  for (const [to, v] of Object.entries(h)) { const r = asObj<Omit<AsideAccount, 'to'>>(v); if (r) out.push({ to, id: r.id ?? '', login: r.login ?? '', movedAt: r.movedAt ?? 0, reason: r.reason ?? '' }); }
  return out.sort((a, b) => b.movedAt - a.movedAt);
}

async function cardCount(login: string, seasons: { collectionName: string }[]): Promise<number> {
  let n = 0;
  for (const s of seasons) n += (await getCollection(s.collectionName))[login]?.length ?? 0;
  return n;
}

/** A login nobody uses and nothing points at: no profile, no cards in any season, no move journal naming it, not a past `~` account. */
async function isFree(login: string, seasons: { collectionName: string }[], open: Record<string, MoveJournal>): Promise<boolean> {
  if (await getUserProfile(login)) return false;
  if ((await cardCount(login, seasons)) > 0) return false;
  if (Object.entries(open).some(([from, j]) => from === login || j.to === login)) return false;
  return !(await kv.hget(ASIDE, login));
}

interface Ctx { from: string; to: string; j: MoveJournal; seasons: Awaited<ReturnType<typeof listSeasons>>; hook: (name: string) => void }

// Copy-if-present, then delete the source: a repeat finds nothing left to copy. Lists keep their order (rpush onto an emptied target).
async function moveValue(a: string, b: string): Promise<void> {
  const v = await kv.get(a);
  if (v !== null && v !== undefined) await kv.set(b, v);
  await kv.del(a);
}
async function moveHash(a: string, b: string): Promise<void> {
  const h = (await kv.hgetall(a).catch(() => null)) as Record<string, unknown> | null;
  if (h && Object.keys(h).length > 0) await kv.hset(b, h);
  await kv.del(a);
}
async function moveList(a: string, b: string): Promise<void> {
  const items = (await kv.lrange(a, 0, -1)) ?? [];
  if (items.length > 0) { await kv.del(b); await kv.rpush(b, ...items); }
  await kv.del(a);
}

const STEPS: { name: string; run: (c: Ctx) => Promise<void> }[] = [
  // Open offers first: escrowed prints are back in the collection (and refunded to the other side) before anything is copied.
  { name: 'trades', run: async c => { await cancelOpenTrades({ username: c.from }, 'The account moved to a new owner'); } },
  { name: 'snapshot', run: async c => { await takeUserSnapshot(c.from, 'Before moving aside'); } },
  // The staff record stays on the login; pinning its Twitch ID now means whoever takes the login next cannot inherit the role.
  { name: 'staff', run: async c => { if (c.j.id) await pinStaffId(c.from, c.j.id); } },
  // Each season: the collection blob (written directly, saveCollection would retire and re-mint every print) and the copy ledger, under one lock.
  {
    name: 'collections',
    run: async c => {
      for (const s of c.seasons) {
        await withCollectionLock(s.collectionName, async () => {
          const data = await getCollection(s.collectionName);
          if (c.from in data) {
            data[c.to] = data[c.from];
            delete data[c.from];
            await kv.set(`tcg_${s.collectionName}`, data);
            c.hook('collections:blob');
          }
          if (await isTracking(s.collectionName)) await renameOwner(s.collectionName, c.from, c.to);
        });
      }
    },
  },
  { name: 'history', run: async c => { await renameInTradeHistory(c.from, c.to); await kv.del(`trade:cd:${c.from}`); } },
  {
    name: 'user',
    run: async c => {
      const { from, to } = c;
      const p = await getUserProfile(from);
      if (p) {
        const had = await getUserProfile(to);
        if (!had) await saveUserProfile({ ...p, username: to });
        if (!had || had.twitchId === p.twitchId) await deleteUserProfile(from); // else a new sign-in made this profile since: leave it
      }
      await moveUserSettings(from, to);
      await moveHash(`user:${from}:ach`, `user:${to}:ach`);
      await moveValue(`user:${from}:pulllimit`, `user:${to}:pulllimit`);
      await moveValue(`user:${from}:buffs`, `user:${to}:buffs`);
      await moveHash(`push:${from}`, `push:${to}`);
      await moveValue(`notif:${from}:seen`, `notif:${to}:seen`);
      await moveValue(`notif:${from}:v`, `notif:${to}:v`);
      await moveList(`notif:${from}`, `notif:${to}`);
      await moveList(`audit:user:${from}`, `audit:user:${to}`);
      await moveDiscordLink(from, to);
      await moveUserSnapshots(from, to);
      const seen = await kv.hget('stats:last', from);
      if (seen !== null && seen !== undefined) { await kv.hset('stats:last', { [to]: seen }); await kv.hdel('stats:last', from); }
      await renameFeedbackOf(from, to);
      for (const s of c.seasons) {
        await moveList(`user:${from}:scorehist:${s.id}`, `user:${to}:scorehist:${s.id}`);
        await moveScoreBonus(s.collectionName, from, to);
        const ranks = await kv.get<Record<string, unknown>>(`digest:ranks:${s.id}`);
        if (ranks && from in ranks) { ranks[to] = ranks[from]; delete ranks[from]; await kv.set(`digest:ranks:${s.id}`, ranks); }
      }
      // Caches and cooldowns belong to the login, not the person: the next owner starts clean.
      await kv.del(`showoff:cd:${from}`, `pronouns:${from}`);
      await kv.hdel('twitch:avatars', from);
    },
  },
  {
    name: 'shared',
    run: async c => {
      await setHidden(c.to, true); // the moved account stays out of the rankings until staff look at it, whatever the old one was
      await setHidden(c.from, false);
      if (!isPreview() && !(await inSandbox())) await deleteTesterRecord(c.from); // the next owner of the login must not inherit early access
      await removeOpaqueLinks(c.from);
    },
  },
  {
    name: 'registry',
    run: async c => {
      if (c.j.id) await kv.hset(ACCT_IDS, { [c.j.id]: c.to }); // this Twitch account's id now names its `~` login
      await kv.hset(ASIDE, { [c.to]: { id: c.j.id, login: c.from, movedAt: c.j.startedAt, reason: c.j.reason } });
      await recordAudit(c.from, 'Moved aside', `to ${c.to}: ${c.j.reason}`.slice(0, 300));
      await recordAudit(c.to, 'Moved here', `from ${c.from}: ${c.j.reason}`.slice(0, 300));
    },
  },
];

async function run(from: string, toWanted: string, opts: { reason: string; failAfter?: string }): Promise<MoveResult> {
  const seasons = await listSeasons();
  let j = (await journals())[from];
  if (!j) {
    const to = lower(toWanted);
    if (!from || from.includes('~')) return fail('That login is already a moved-aside account.');
    if (!to || to === from) return fail('Pick a different login to move to.');
    const profile = await getUserProfile(from);
    if (!profile && (await cardCount(from, seasons)) === 0) return fail('There is nothing under that login to move.');
    if ((await getUserProfile(to)) || (await cardCount(to, seasons)) > 0) return fail(`${to} already has an account, nothing was moved.`);
    j = { to, id: isTwitchId(profile?.twitchId) ? profile!.twitchId! : '', reason: opts.reason.slice(0, 200), startedAt: Date.now(), done: [] };
    await kv.hset(MOVES, { [from]: j });
  }
  const hook = (name: string) => { if (opts.failAfter === name) throw new Error(`injected failure after ${name}`); };
  const ctx: Ctx = { from, to: j.to, j, seasons, hook };
  for (const step of STEPS) {
    if (j.done.includes(step.name)) continue;
    await step.run(ctx);
    j.done.push(step.name);
    await kv.hset(MOVES, { [from]: j });
    hook(step.name);
  }
  await kv.hdel(MOVES, from);
  return { ok: true, to: j.to, cards: await cardCount(j.to, seasons) };
}

/**
 * Moves everything under `from` to the login `to`. An unfinished move of `from` is carried on with its own target (`to` is then ignored).
 * Refuses a `~` source, an empty source and a target that already holds an account. `failAfter` (a step name) is for the check only.
 * shortcut: one outer lock with a 10 s expiry, a very large account can outlast it; the journal makes a second run safe, upgrade if moves get that big.
 */
export async function moveAccount(from: string, to: string, opts: { reason: string; failAfter?: string }): Promise<MoveResult> {
  try {
    return await withLock('acct-move', () => run(lower(from), to, opts));
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'The move failed, try Finish move on the Data health panel.');
  }
}

/** Moves `login` to the first free `<login>~<n>`. */
export async function moveAside(login: string, reason: string): Promise<MoveResult> {
  const from = lower(login);
  if (!from || from.includes('~')) return fail('That login is already a moved-aside account.');
  const open = await journals();
  if (open[from]) return moveAccount(from, open[from].to, { reason });
  const seasons = await listSeasons();
  for (let n = 1; n < 1000; n++) {
    const to = `${from}~${n}`;
    if (await isFree(to, seasons, open)) return moveAccount(from, to, { reason });
  }
  return fail('No free name to move to.');
}

/** Carries on an unfinished move from where it stopped. */
export async function finishMove(from: string): Promise<MoveResult> {
  const j = (await journals())[lower(from)];
  if (!j) return fail('There is no unfinished move for that login.');
  return moveAccount(from, j.to, { reason: j.reason });
}
