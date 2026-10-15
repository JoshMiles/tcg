import { VARIANTS, decodeEntry, encodeEntry } from './variants';
import type { Variant } from './types';

// Card serials (client-safe, pure). Every copy of a card has an identity: the card, its version and a number that counts up per
// card AND version ("Shiny Gouda Goat #3" is the third Shiny of that card ever made). The ledger that stores copies is in
// lib/serials.ts; the decisions (which copy to mint, move or retire) are made here so they can be checked without a database.

export type Origin = 'pull' | 'grant' | 'upgrade' | 'estimated' | 'other';

export type CopyEventType = 'minted' | 'escrowed' | 'returned' | 'traded' | 'upgraded' | 'removed';
export interface CopyEvent { t: number; type: CopyEventType; who?: string; to?: string; note?: string }

export interface Copy {
  /** "<card>.<variant index>.<n>", safe in URLs. */
  id: string;
  /** The copy's unique number across every season ("#1023381"): how it is referred to, searched and linked (`/c/<uid>`). Absent on copies made before unique numbers existed until the next "Number existing copies" run. The edition number `n` below is what earns the points bonus. */
  uid?: number;
  card: number;
  variant: Variant;
  /** Which copy of this card in this version it was (1 = the first ever made). */
  n: number;
  owner: string;
  at: number;
  origin: Origin;
  /** Numbered after the fact (copies that existed before serials): the order within a version is a best guess. */
  est?: boolean;
  /** For an upgrade: the copies that were spent to make this one. */
  madeFrom?: string[];
  ev: CopyEvent[];
}

export const EVENT_CAP = 40;

export const copyId = (card: number, variant: Variant, n: number) => `${card}.${VARIANTS.indexOf(variant)}.${n}`;

export function parseCopyId(id: string): { card: number; variant: Variant; n: number } | null {
  const m = /^(\d{1,6})\.([0-3])\.(\d{1,9})$/.exec(id);
  if (!m) return null;
  return { card: Number(m[1]), variant: VARIANTS[Number(m[2])], n: Number(m[3]) };
}

export const ESCROW_PREFIX = 'escrow:';
export const escrowOwner = (tradeId: string) => `${ESCROW_PREFIX}${tradeId}`;
export const isEscrow = (owner: string) => owner.startsWith(ESCROW_PREFIX);

/** An entry's card + version as a collection entry (see lib/variants.ts). */
export const entryOf = (c: { card: number; variant: Variant }) => encodeEntry(c.card, c.variant);

/** How many of each entry a collection array holds. */
export function countEntries(owned: number[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const e of owned) m.set(e, (m.get(e) ?? 0) + 1);
  return m;
}

/** Entries whose count differs between two arrays (the users a save really changed). */
export function sameCollection(a: number[] | undefined, b: number[] | undefined): boolean {
  const x = a ?? [], y = b ?? [];
  if (x.length !== y.length) return false;
  const cx = countEntries(x), cy = countEntries(y);
  for (const [k, n] of cx) if (cy.get(k) !== n) return false;
  return true;
}

/** The newest `k` copies (highest number first). Trades and removals take these, so a collector keeps their low numbers. */
export function newestFirst(copies: Copy[], k: number): Copy[] {
  return [...copies].sort((a, b) => b.n - a.n || b.at - a.at).slice(0, Math.max(0, k));
}

export interface Reconcile { mint: Map<number, number>; retire: Map<number, number> }

/** What it takes to make the ledger's copies match what a collection array really holds. */
export function diffCounts(have: Map<number, number>, want: Map<number, number>): Reconcile {
  const mint = new Map<number, number>(), retire = new Map<number, number>();
  for (const [e, w] of want) { const h = have.get(e) ?? 0; if (w > h) mint.set(e, w - h); }
  for (const [e, h] of have) { const w = want.get(e) ?? 0; if (h > w) retire.set(e, h - w); }
  return { mint, retire };
}

/** Appends an event, keeping the history short (the first event, "minted", always stays). */
export function withEvent(c: Copy, e: CopyEvent): Copy {
  const ev = [...c.ev, e];
  return { ...c, ev: ev.length > EVENT_CAP ? [ev[0], ...ev.slice(ev.length - (EVENT_CAP - 1))] : ev };
}

export const ORIGIN_LABELS: Record<Origin, string> = {
  pull: 'Pulled live on stream', grant: 'Given as a gift', upgrade: 'Forged in an upgrade', estimated: 'Existed before serials (numbered later)', other: 'Added to the collection',
};

/** "pulled by", "given to", ...: how to say who a copy first belonged to, by how it came to exist (a numbered-later copy was not necessarily pulled). */
export const ORIGIN_BY: Record<Origin, string> = { pull: 'pulled by', grant: 'given to', upgrade: 'forged by', estimated: 'first held by', other: 'added to' };

/** The one-word label for when a copy came into being, by how it did ("Pulled", not "Created": a copy is pulled, given or forged). */
export const ORIGIN_VERB: Record<Origin, string> = { pull: 'Pulled', grant: 'Given', upgrade: 'Forged', estimated: 'First recorded', other: 'Added' };

export const EVENT_LABELS: Record<CopyEventType, string> = {
  minted: 'Created', escrowed: 'Put up in a trade offer', returned: 'Came back from a trade offer', traded: 'Traded', upgraded: 'Spent in an upgrade', removed: 'Removed from the collection',
};

/** "Shiny Full Art #3" without the card name, for chips. */
export const serialLabel = (c: { variant: Variant; n: number }, labels: Record<Variant, string>) => `${c.variant === 'regular' ? '' : `${labels[c.variant]} `}#${c.n}`;

/**
 * The serial numbers each viewer holds right now, for scoring: owner -> entry (card + version) -> serials, lowest first. Copies in an
 * open trade offer (escrow) are left out, like they are everywhere in the score. `minted` is how many of each entry were ever made,
 * so the next copy of it will be `minted + 1`.
 */
export interface SerialIndex {
  held: Map<string, Map<number, number[]>>;
  /** Copies held by open trade offers: trade id -> entry -> serials. They score nothing while there, but price the offer's give side. */
  escrow: Map<string, Map<number, number[]>>;
  minted: Map<number, number>;
}

/** Serials by collection entry (card + version), lowest first: what one holder or one offer's escrow has. */
export type SerialPool = Record<number, number[]>;
export const poolOf = (m: Map<number, number[]> | undefined): SerialPool => Object.fromEntries(m ?? []);

/** Builds the scoring view from the ledger's id -> owner index and its minted counters. */
export function buildSerialIndex(idx: Record<string, string>, minted: Map<number, number>): SerialIndex {
  const held = new Map<string, Map<number, number[]>>();
  const escrow = new Map<string, Map<number, number[]>>();
  for (const [id, owner] of Object.entries(idx)) {
    const inEscrow = isEscrow(owner);
    const p = parseCopyId(id);
    if (!p) continue;
    const [bucket, who] = inEscrow ? [escrow, owner.slice(ESCROW_PREFIX.length)] : [held, owner];
    const byEntry = bucket.get(who) ?? new Map<number, number[]>();
    const e = encodeEntry(p.card, p.variant);
    byEntry.set(e, [...(byEntry.get(e) ?? []), p.n]);
    bucket.set(who, byEntry);
  }
  for (const bucket of [held, escrow]) for (const byEntry of bucket.values()) for (const list of byEntry.values()) list.sort((a, b) => a - b);
  return { held, escrow, minted };
}

export { decodeEntry };

/** Unique copy numbers start here, so they are all the same length ("#1000001"). */
export const UID_BASE = 1_000_000;

/** "#1023381", or '' for a copy without one. */
export const uidLabel = (uid?: number) => (uid ? `#${uid}` : '');

/** A typed query as a unique copy number ("#1023381", "1023381"), or null. Only 7-9 digit numbers qualify, so card numbers and short digits never match. */
export function parseUid(raw: string): number | null {
  const m = /^#?\s*(\d{7,9})$/.exec(raw.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return n > UID_BASE ? n : null;
}
