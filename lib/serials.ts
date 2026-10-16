import { kv } from './db';
import {
  buildSerialIndex, diffCounts, copyId, parseCopyId, countEntries, entryOf, escrowOwner, isEscrow, newestFirst, sameCollection, withEvent,
  UID_BASE, type Copy, type CopyEvent, type Origin, type SerialIndex, type SerialPool,
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
//   copies:uid:seq        hash  n -> how many unique numbers were handed out, game-wide (the next unique number is UID_BASE + that + 1)
//   copies:uid:idx        hash  unique number -> "<collection>|<copy id>" (find any copy from its number, live or retired)

const key = {
  owner: (c: string, o: string) => `copies:${c}:o:${o}`,
  idx: (c: string) => `copies:${c}:idx`,
  n: (c: string) => `copies:${c}:n`,
  ret: (c: string) => `copies:${c}:ret`,
  init: (c: string) => `copies:${c}:init`,
  uidSeq: 'copies:uid:seq',
  uidIdx: 'copies:uid:idx',
};

/** A move that keeps a copy's identity: `to` / `from` is a viewer or an escrow owner. */
export interface Move {
  from: string; to: string; entry: number; count: number;
  /** Move exactly these copies (by id) instead of the newest `count`. Used by admin transfers. */
  ids?: string[];
  /** Added to each moved copy's history event (e.g. "admin transfer"). */
  note?: string;
}
export interface SyncContext {
  /** Where newly added copies came from (default 'other'). */
  origin?: Origin;
  /** Copies that change hands in this save (trades, escrow, refunds). */
  moves?: Move[];
  /** Retire exactly these copies of `owner` (an admin removing one specific copy), in place of retiring the newest. */
  retire?: { owner: string; ids: string[]; who: string; note?: string };
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

/** The serials everyone holds, for scoring. null while the collection's copies are not numbered yet (then no serial bonus applies). */
export async function loadSerialIndex(c: string): Promise<SerialIndex | null> {
  try {
    if (!(await isTracking(c))) return null;
    const [idx, minted] = await Promise.all([kv.hgetall(key.idx(c)), mintedCounts(c)]);
    return buildSerialIndex((idx ?? {}) as Record<string, string>, minted);
  } catch { return null; }
}

/** The serials one owner (a viewer or an escrow) holds right now, by entry, lowest first. Empty while the collection is not tracked. */
export async function serialPool(c: string, owner: string): Promise<SerialPool> {
  if (!(await isTracking(c))) return {};
  const pool: SerialPool = {};
  for (const x of await readOwner(c, owner)) (pool[entryOf(x)] ??= []).push(x.n);
  for (const list of Object.values(pool)) list.sort((a, b) => a - b);
  return pool;
}

export interface CopyPage { made: number; copies: Copy[] }

/**
 * One page of the copies of a card in one version, by serial number (they are numbered 1..made with none skipped, so a page is just
 * a range of ids). Live and retired copies both come back; `owner` is '' for a retired one. Newest first unless `oldestFirst`.
 */
export async function pageCopies(c: string, card: number, variant: Variant, page: number, size: number, oldestFirst = false): Promise<CopyPage> {
  const made = (await mintedCounts(c)).get(entryOf({ card, variant })) ?? 0;
  const from = Math.max(0, page) * size;
  const ns = Array.from({ length: Math.max(0, Math.min(size, made - from)) }, (_, i) => (oldestFirst ? from + i + 1 : made - from - i));
  const copies = (await Promise.all(ns.map(n => getCopy(c, copyId(card, variant, n))))).filter((x): x is Copy => !!x);
  return { made, copies };
}

/** How many live copies (in collections or offers) exist of each card + version, by entry. */
export async function liveCounts(c: string): Promise<Map<number, number>> {
  const idx = (await kv.hgetall(key.idx(c)).catch(() => null)) as Record<string, string> | null;
  const out = new Map<number, number>();
  for (const id of Object.keys(idx ?? {})) {
    const p = parseCopyId(id);
    if (!p) continue;
    const e = encodeEntry(p.card, p.variant);
    out.set(e, (out.get(e) ?? 0) + 1);
  }
  return out;
}

/** The serial number the most recently made copy of this card + version got (null while the collection is not numbered). Read under the collection lock, it is the copy just made. */
export async function lastSerial(c: string, entry: number): Promise<number | null> {
  try {
    if (!(await isTracking(c))) return null;
    const n = Number(await kv.hget(key.n(c), String(entry)));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch { return null; }
}

/** The copy most recently made of this card + version (id, unique number, serial), or nulls while the collection is not numbered. Read under the collection lock, it is the copy just made. */
export async function lastCopy(c: string, entry: number): Promise<{ serial: number | null; copyId: string | null; uid: number | null }> {
  const serial = await lastSerial(c, entry);
  if (!serial) return { serial: null, copyId: null, uid: null };
  const { cardNumber, variant } = decodeEntry(entry);
  const id = copyId(cardNumber, variant, serial);
  const copy = await getCopy(c, id).catch(() => null);
  return { serial, copyId: id, uid: copy?.uid ?? null };
}

/** Every live copy of one card + version (all owners, escrow included), for "who holds the other numbers". */
export async function liveCopiesOfEntry(c: string, entry: number): Promise<{ id: string; owner: string }[]> {
  const idx = (await kv.hgetall(key.idx(c)).catch(() => null)) as Record<string, string> | null;
  const { cardNumber, variant } = decodeEntry(entry);
  const prefix = `${cardNumber}.${['regular', 'reverse', 'full', 'shiny'].indexOf(variant)}.`;
  return Object.entries(idx ?? {}).filter(([id]) => id.startsWith(prefix)).map(([id, owner]) => ({ id, owner }));
}

/** Hands out `count` unique numbers (consecutive); returns the first, or 0 when the counter could not be reached (the copies are then made without one). */
async function nextUids(count: number): Promise<number> {
  try { return UID_BASE + Number(await kv.hincrby(key.uidSeq, 'n', count)) - count + 1; } catch { return 0; }
}

async function registerUids(c: string, copies: Copy[]): Promise<void> {
  const entries = copies.filter(x => x.uid).map(x => [String(x.uid), `${c}|${x.id}`] as const);
  if (entries.length) await kv.hset(key.uidIdx, Object.fromEntries(entries)).catch(() => {});
}

async function mint(c: string, owner: string, entry: number, count: number, origin: Origin, opts: { est?: boolean; madeFrom?: string[]; who?: string; noUid?: boolean } = {}): Promise<Copy[]> {
  if (count <= 0) return [];
  const { cardNumber, variant } = decodeEntry(entry);
  const top = Number(await kv.hincrby(key.n(c), String(entry), count));
  const uid0 = opts.noUid ? 0 : await nextUids(count);
  const now = Date.now();
  const made: Copy[] = [];
  for (let i = 0; i < count; i++) {
    const n = top - count + 1 + i;
    made.push({
      id: copyId(cardNumber, variant, n), ...(uid0 ? { uid: uid0 + i } : {}), card: cardNumber, variant, n, owner, at: now, origin, ...(opts.est ? { est: true } : {}), ...(opts.madeFrom ? { madeFrom: opts.madeFrom } : {}),
      ev: [{ t: now, type: 'minted', who: opts.who ?? owner }],
    });
  }
  await kv.hset(key.owner(c, owner), Object.fromEntries(made.map(m => [m.id, m])));
  await kv.hset(key.idx(c), Object.fromEntries(made.map(m => [m.id, owner])));
  await registerUids(c, made);
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
  const picked = m.ids ? mine.filter(x => m.ids!.includes(x.id)) : newestFirst(mine, m.count);
  if (picked.length === 0) return 0;
  const now = Date.now();
  const moved = picked.map(x => {
    if (isEscrow(m.to)) return withEvent({ ...x, owner: m.to }, { t: now, type: 'escrowed', who: m.from });
    // Out of escrow: back to whoever put it there is a refund, to anyone else it is a trade from them.
    const putBy = isEscrow(m.from) ? [...x.ev].reverse().find(e => e.type === 'escrowed')?.who : undefined;
    return putBy === m.to
      ? withEvent({ ...x, owner: m.to }, { t: now, type: 'returned', who: m.to })
      : withEvent({ ...x, owner: m.to }, { t: now, type: 'traded', who: putBy ?? m.from, to: m.to, ...(m.note ? { note: m.note } : {}) });
  });
  await kv.hset(key.owner(c, m.to), Object.fromEntries(moved.map(x => [x.id, x])));
  await kv.hset(key.idx(c), Object.fromEntries(moved.map(x => [x.id, m.to])));
  await kv.hdel(key.owner(c, m.from), ...picked.map(x => x.id));
  return picked.length;
}

/** Makes the ledger match one viewer's collection: mint what they have that it lacks, retire what it holds that they no longer have. */
async function reconcileUser(c: string, user: string, owned: number[], origin: Origin, est = false, noUid = false): Promise<void> {
  const have = await readOwner(c, user);
  const byEntry = new Map<number, Copy[]>();
  for (const x of have) { const e = entryOf(x); byEntry.set(e, [...(byEntry.get(e) ?? []), x]); }
  const { mint: toMint, retire: toRetire } = diffCounts(new Map([...byEntry].map(([e, l]) => [e, l.length])), countEntries(owned));
  for (const [e, k] of toRetire) await retire(c, user, newestFirst(byEntry.get(e) ?? [], k), { type: 'removed', who: user });
  for (const [e, k] of toMint) await mint(c, user, e, k, origin, { est, noUid });
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

    if (ctx.retire) {
      const { owner, ids, who, note } = ctx.retire;
      const doomed = (await readOwner(c, owner)).filter(x => ids.includes(x.id));
      await retire(c, owner, doomed, { type: 'removed', who, ...(note ? { note } : {}) });
      touched.add(owner);
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

export interface BackfillResult { users: number; copies: number; /** Copies that were given a unique number in this run. */ numbered: number }

/**
 * Numbers every copy that exists now (once per collection). The order is a best guess: viewers in the order the collection stores
 * them, each viewer's copies in the order they were added, so numbers within a version are estimates (marked `est`). New copies
 * are exact from this point on. Safe to run again: it only fills gaps.
 */
export async function backfillSerials(c: string, data: Record<string, number[]>): Promise<BackfillResult> {
  let copies = 0;
  for (const [user, owned] of Object.entries(data)) {
    const before = (await readOwner(c, user)).length;
    await reconcileUser(c, user, owned, 'estimated', true, true);
    copies += Math.max(0, owned.length - before);
  }
  await kv.set(key.init(c), Date.now());
  // Unique numbers last, oldest copy first, so older copies get the lower numbers.
  const numbered = await assignMissingUids(c);
  return { users: Object.keys(data).length, copies, numbered };
}

/**
 * Gives a unique number to every copy of this collection that has none (live and retired), oldest first (by when it was made, then by
 * card, version and edition number, which is the best order we have for copies numbered after the fact). Safe to run again.
 */
export async function assignMissingUids(c: string): Promise<number> {
  const idx = ((await kv.hgetall(key.idx(c)).catch(() => null)) ?? {}) as Record<string, string>;
  const owners = [...new Set(Object.values(idx))];
  const live = (await Promise.all(owners.map(async o => ({ o, copies: await readOwner(c, o) })))).filter(x => x.copies.length > 0);
  const retHash = ((await kv.hgetall(key.ret(c)).catch(() => null)) ?? {}) as Record<string, unknown>;
  const retired = Object.values(retHash).map(parse).filter((x): x is Copy => !!x);

  const missing = [...live.flatMap(x => x.copies), ...retired].filter(x => !x.uid);
  if (missing.length === 0) return 0;
  missing.sort((a, b) => a.at - b.at || a.card - b.card || ['regular', 'reverse', 'full', 'shiny'].indexOf(a.variant) - ['regular', 'reverse', 'full', 'shiny'].indexOf(b.variant) || a.n - b.n);
  const first = await nextUids(missing.length);
  if (!first) return 0;
  missing.forEach((x, i) => { x.uid = first + i; });

  const done = new Set(missing.map(x => x.id));
  for (const { o, copies } of live) {
    const changed = copies.filter(x => done.has(x.id));
    if (changed.length) await kv.hset(key.owner(c, o), Object.fromEntries(changed.map(x => [x.id, x])));
  }
  const changedRet = retired.filter(x => done.has(x.id));
  if (changedRet.length) await kv.hset(key.ret(c), Object.fromEntries(changedRet.map(x => [x.id, x])));
  await registerUids(c, missing);
  return missing.length;
}

/** Finds a copy from its unique number, in any season: which collection it belongs to and its copy id. */
export async function findByUid(uid: number): Promise<{ collection: string; copyId: string } | null> {
  try {
    const v = await kv.hget<string>(key.uidIdx, String(uid));
    if (!v) return null;
    const cut = v.indexOf('|');
    return cut > 0 ? { collection: v.slice(0, cut), copyId: v.slice(cut + 1) } : null;
  } catch { return null; }
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

/** The first of these copies that is not held by `owners` right now (null when all are). `holder` says where it is instead: another viewer, an offer's escrow, or '' when it no longer exists. */
export async function firstNotHeld(c: string, owners: string[], ids: string[]): Promise<{ id: string; holder: string } | null> {
  for (const id of ids) {
    const holder = (await kv.hget<string>(key.idx(c), id).catch(() => null)) ?? '';
    if (!owners.includes(holder)) return { id, holder };
  }
  return null;
}

/** "Print #1023381" for a copy id (the edition when the copy has no unique number yet). */
export async function printLabel(c: string, id: string): Promise<string> {
  const copy = await getCopy(c, id);
  if (copy?.uid) return `Print #${copy.uid}`;
  const p = parseCopyId(id);
  return p ? `Edition #${p.n}` : 'that print';
}
