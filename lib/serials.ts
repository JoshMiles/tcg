import { kv } from './db';
import {
  diffCounts, copyId, countEntries, entryOf, escrowOwner, isEscrow, newestFirst, sameCollection, withEvent,
  type Copy, type CopyEvent, type Origin,
} from './serials-core';
import { decodeEntry, encodeEntry } from './variants';
import type { Variant } from './types';

// The copy ledger (server). Collections stay exactly as they were (an array of entries per viewer); the ledger sits beside them and
// gives each copy an identity. Every write to a collection goes through saveCollection (lib/kv.ts), which calls syncAfterSave here, so
// the ledger can't drift: it mints for what was added, retires what was removed, and follows copies that a trade or upgrade moves.
//
// KV layout, per collection name:
//   copies:<c>:o:<owner>  hash  copy id -> Copy      (the owner is a viewer, or "escrow:<tradeId>" while an offer is open)
//   copies:<c>:idx        hash  copy id -> owner      (find any live copy)
//   copies:<c>:n          hash  entry   -> count      (how many were ever made of each card + version: the next serial)
//   copies:<c>:ret        hash  copy id -> Copy       (retired copies keep their history)
//   copies:<c>:init       flag  set once existing copies have been numbered; until then nothing is tracked

const key = {
  owner: (c: string, o: string) => `copies:${c}:o:${o}`,
  idx: (c: string) => `copies:${c}:idx`,
  n: (c: string) => `copies:${c}:n`,
  ret: (c: string) => `copies:${c}:ret`,
  init: (c: string) => `copies:${c}:init`,
};

/** A move that keeps a copy's identity: `to` / `from` is a viewer or an escrow owner. */
export interface Move { from: string; to: string; entry: number; count: number }
export interface SyncContext {
  /** Where newly added copies came from (default 'other'). */
  origin?: Origin;
  /** Copies that change hands in this save (trades, escrow, refunds). */
  moves?: Move[];
  /** Copies spent and the one made from them. */
  upgrade?: { user: string; spent: number; count: number; made: number };
}

const parse = (v: unknown): Copy | null => {
  try { return (typeof v === 'string' ? JSON.parse(v) : v) as Copy; } catch { return null; }
};

async function readOwner(c: string, owner: string): Promise<Copy[]> {
  const h = (await kv.hgetall(key.owner(c, owner)).catch(() => null)) as Record<string, unknown> | null;
  return h ? Object.values(h).map(parse).filter((x): x is Copy => !!x) : [];
}

export async function isTracking(c: string): Promise<boolean> {
  try { return !!(await kv.get(key.init(c))); } catch { return false; }
}

export const getOwnerCopies = (c: string, owner: string) => readOwner(c, owner);

/** One copy by id (live or retired). */
export async function getCopy(c: string, id: string): Promise<Copy | null> {
  const owner = (await kv.hget<string>(key.idx(c), id).catch(() => null)) ?? null;
  if (owner) {
    const v = await kv.hget(key.owner(c, owner), id).catch(() => null);
    const copy = parse(v);
    if (copy) return copy;
  }
  return parse(await kv.hget(key.ret(c), id).catch(() => null));
}

/** How many of each card + version were ever made (the serial counter), keyed by entry. */
export async function mintedCounts(c: string): Promise<Map<number, number>> {
  const h = (await kv.hgetall(key.n(c)).catch(() => null)) as Record<string, unknown> | null;
  return new Map(Object.entries(h ?? {}).map(([e, n]) => [Number(e), Number(n)]));
}

/** Every live copy of one card + version (all owners, escrow included), for "who holds the other numbers". */
export async function liveCopiesOfEntry(c: string, entry: number): Promise<{ id: string; owner: string }[]> {
  const idx = (await kv.hgetall(key.idx(c)).catch(() => null)) as Record<string, string> | null;
  const { cardNumber, variant } = decodeEntry(entry);
  const prefix = `${cardNumber}.${['regular', 'reverse', 'full', 'shiny'].indexOf(variant)}.`;
  return Object.entries(idx ?? {}).filter(([id]) => id.startsWith(prefix)).map(([id, owner]) => ({ id, owner }));
}

async function mint(c: string, owner: string, entry: number, count: number, origin: Origin, opts: { est?: boolean; madeFrom?: string[]; who?: string } = {}): Promise<Copy[]> {
  if (count <= 0) return [];
  const { cardNumber, variant } = decodeEntry(entry);
  const top = Number(await kv.hincrby(key.n(c), String(entry), count));
  const now = Date.now();
  const made: Copy[] = [];
  for (let i = 0; i < count; i++) {
    const n = top - count + 1 + i;
    made.push({
      id: copyId(cardNumber, variant, n), card: cardNumber, variant, n, owner, at: now, origin, ...(opts.est ? { est: true } : {}), ...(opts.madeFrom ? { madeFrom: opts.madeFrom } : {}),
      ev: [{ t: now, type: 'minted', who: opts.who ?? owner }],
    });
  }
  await kv.hset(key.owner(c, owner), Object.fromEntries(made.map(m => [m.id, m])));
  await kv.hset(key.idx(c), Object.fromEntries(made.map(m => [m.id, owner])));
  return made;
}

async function retire(c: string, owner: string, copies: Copy[], ev: Omit<CopyEvent, 't'>): Promise<void> {
  if (copies.length === 0) return;
  const now = Date.now();
  await kv.hset(key.ret(c), Object.fromEntries(copies.map(x => [x.id, withEvent({ ...x, owner: '' }, { t: now, ...ev })])));
  await kv.hdel(key.owner(c, owner), ...copies.map(x => x.id));
  await kv.hdel(key.idx(c), ...copies.map(x => x.id));
}

/** Hands copies from one owner to another, keeping their identity. Returns how many actually moved (the ledger may hold fewer). */
async function move(c: string, m: Move): Promise<number> {
  const mine = (await readOwner(c, m.from)).filter(x => entryOf(x) === m.entry);
  const picked = newestFirst(mine, m.count);
  if (picked.length === 0) return 0;
  const now = Date.now();
  const moved = picked.map(x => {
    if (isEscrow(m.to)) return withEvent({ ...x, owner: m.to }, { t: now, type: 'escrowed', who: m.from });
    // Out of escrow: back to whoever put it there is a refund, to anyone else it is a trade from them.
    const putBy = isEscrow(m.from) ? [...x.ev].reverse().find(e => e.type === 'escrowed')?.who : undefined;
    return putBy === m.to
      ? withEvent({ ...x, owner: m.to }, { t: now, type: 'returned', who: m.to })
      : withEvent({ ...x, owner: m.to }, { t: now, type: 'traded', who: putBy ?? m.from, to: m.to });
  });
  await kv.hset(key.owner(c, m.to), Object.fromEntries(moved.map(x => [x.id, x])));
  await kv.hset(key.idx(c), Object.fromEntries(moved.map(x => [x.id, m.to])));
  await kv.hdel(key.owner(c, m.from), ...picked.map(x => x.id));
  return picked.length;
}

/** Makes the ledger match one viewer's collection: mint what they have that it lacks, retire what it holds that they no longer have. */
async function reconcileUser(c: string, user: string, owned: number[], origin: Origin, est = false): Promise<void> {
  const have = await readOwner(c, user);
  const byEntry = new Map<number, Copy[]>();
  for (const x of have) { const e = entryOf(x); byEntry.set(e, [...(byEntry.get(e) ?? []), x]); }
  const { mint: toMint, retire: toRetire } = diffCounts(new Map([...byEntry].map(([e, l]) => [e, l.length])), countEntries(owned));
  for (const [e, k] of toRetire) await retire(c, user, newestFirst(byEntry.get(e) ?? [], k), { type: 'removed', who: user });
  for (const [e, k] of toMint) await mint(c, user, e, k, origin, { est });
}

/**
 * Called by saveCollection after it wrote `after`. Does nothing until the collection's existing copies have been numbered
 * (backfillSerials), because new serials would otherwise jump the queue. Never throws: a ledger problem must not fail a pull.
 */
export async function syncAfterSave(c: string, before: Record<string, number[]>, after: Record<string, number[]>, ctx: SyncContext = {}): Promise<void> {
  try {
    if (!(await isTracking(c))) return;
    const touched = new Set<string>();
    for (const u of new Set([...Object.keys(before), ...Object.keys(after)])) if (!sameCollection(before[u], after[u])) touched.add(u);

    for (const m of ctx.moves ?? []) {
      await move(c, m);
      for (const side of [m.from, m.to]) if (!isEscrow(side)) touched.add(side);
    }

    if (ctx.upgrade) {
      const { user, spent, count, made } = ctx.upgrade;
      const mine = (await readOwner(c, user)).filter(x => entryOf(x) === spent);
      const used = newestFirst(mine, count);
      const [fresh] = await mint(c, user, made, 1, 'upgrade', { madeFrom: used.map(x => x.id) });
      await retire(c, user, used, { type: 'upgraded', who: user, ...(fresh ? { note: fresh.id } : {}) });
      touched.add(user);
    }

    for (const u of touched) await reconcileUser(c, u, after[u] ?? [], ctx.origin ?? 'other');
  } catch (e) {
    console.error('serial sync failed', e);
  }
}

export interface BackfillResult { users: number; copies: number }

/**
 * Numbers every copy that exists now (once per collection). The order is a best guess: viewers in the order the collection stores
 * them, each viewer's copies in the order they were added, so numbers within a version are estimates (marked `est`). New copies
 * are exact from this point on. Safe to run again: it only fills gaps.
 */
export async function backfillSerials(c: string, data: Record<string, number[]>): Promise<BackfillResult> {
  let copies = 0;
  for (const [user, owned] of Object.entries(data)) {
    const before = (await readOwner(c, user)).length;
    await reconcileUser(c, user, owned, 'estimated', true);
    copies += Math.max(0, owned.length - before);
  }
  await kv.set(key.init(c), Date.now());
  return { users: Object.keys(data).length, copies };
}

/** Quick facts for the admin panel. */
export async function serialStats(c: string): Promise<{ tracking: boolean; minted: number; live: number; retired: number }> {
  const [tracking, n, idx, ret] = await Promise.all([isTracking(c), mintedCounts(c), kv.hlen(key.idx(c)).catch(() => 0), kv.hlen(key.ret(c)).catch(() => 0)]);
  return { tracking, minted: [...n.values()].reduce((s, v) => s + v, 0), live: Number(idx) || 0, retired: Number(ret) || 0 };
}

/** Deleting a collection (or a whole season's data) clears its ledger too. */
export async function dropLedger(c: string, users: string[]): Promise<void> {
  try {
    await kv.del(key.idx(c), key.n(c), key.ret(c), key.init(c), ...users.map(u => key.owner(c, u)));
  } catch { /* best effort */ }
}

export { escrowOwner, encodeEntry };
export type { Variant };
