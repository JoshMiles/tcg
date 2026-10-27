import type { Variant } from './types';
import { VARIANTS, VARIANT_LABELS, encodeEntry, removeEntries } from './variants';
import { parseCopyId } from './serials-core';

// The pure part of trading: types, validation of what a viewer sends, and the settlement maths. No database, so it is safe to
// import in client components and easy to test (scripts/check-trades.mts). The rules that need data (limits, expiry, locks)
// live in lib/trades.ts.
//
// ESCROW: when an offer is made, the copies the offerer gives are REMOVED from their collection and held by the trade. They go
// to the other side on accept and come back to the offerer on cancel / decline / counter / expiry. So an open offer can never
// be double-spent, and the offerer's side can never go stale. Copies are conserved exactly: collection + escrow is constant.

/** A stack of identical copies: one card in one variant. */
export interface TradeItem {
  cardNumber: number;
  variant: Variant;
  count: number;
  /**
   * The exact prints (copy ids `<card>.<variant index>.<n>`) when the viewer chose them, `ids.length === count`, all distinct and all of
   * this card + version. Absent = any print: the newest move first (what trades always did).
   */
  ids?: string[];
}

export type TradeStatus = 'open' | 'accepted' | 'declined' | 'cancelled' | 'expired' | 'countered' | 'failed';

export interface Trade {
  id: string;
  seasonId: string;
  /** 'direct': offered to one viewer. 'listing': on the open board, anyone can take it. */
  kind: 'direct' | 'listing';
  /** The viewer who made the offer (lowercase login). */
  from: string;
  /** Who a direct offer is for. Absent on listings. */
  to?: string;
  /** What `from` hands over. While the trade is open these copies are held in escrow (not in anyone's collection). */
  give: TradeItem[];
  /** True while `give` is physically held by the trade. Refunds and settlement only happen when this is true, so they can't repeat. */
  escrowed: boolean;
  /** What `from` wants back, i.e. what the person who accepts hands over. */
  get: TradeItem[];
  note?: string;
  status: TradeStatus;
  createdAt: number;
  expiresAt: number;
  resolvedAt?: number;
  /** Who accepted / declined / cancelled it ('admin' for an admin cancel). */
  resolvedBy?: string;
  /** Why it ended, for failed / admin-cancelled trades. */
  reason?: string;
  /** The staff member (Twitch login) who cancelled it, when resolvedBy is 'admin'. */
  staff?: string;
  /** Set on a counter-offer: the trade it answers. */
  counterOf?: string;
  /** The exact prints that changed hands when it was accepted (`give`: offerer to taker, `get`: taker to offerer). Absent on older trades and in seasons whose prints are not numbered. */
  moved?: { give: string[]; get: string[] };
  /** Set when staff reversed the completed trade: every print went back where it started. The status stays 'accepted'. */
  reversedAt?: number;
  reversedBy?: string;
  reverseReason?: string;
}

/**
 * May this viewer see what is in the trade? A board listing is public; a direct offer only to the two people in it (the viewer is a
 * lowercase login, or none when signed out). Used by the trade page; staff look at offers in the admin and mod panels instead.
 */
export function tradeVisibleTo(trade: Pick<Trade, 'kind' | 'from' | 'to'>, viewer: string | null | undefined): boolean {
  if (trade.kind === 'listing') return true;
  const v = viewer?.toLowerCase();
  return !!v && (v === trade.from || v === trade.to);
}

export interface TradeSettings {
  /** Master switch: off freezes trading (existing offers stay but can't be accepted). */
  enabled: boolean;
  /** Hours an offer stays open. */
  expiryHours: number;
  /** Open offers one viewer can have at once (direct + listings together). */
  maxOpenPerUser: number;
  /** Seconds a viewer must wait between creating offers. */
  cooldownSeconds: number;
  /** Different card/variant stacks allowed on each side of an offer. */
  maxStacksPerSide: number;
  /** Hours a viewer's profile must have existed before they can offer or accept (0 = no limit). */
  minAccountHours: number;
}

export const DEFAULT_TRADE_SETTINGS: TradeSettings = {
  enabled: true,
  expiryHours: 48,
  maxOpenPerUser: 5,
  cooldownSeconds: 20,
  maxStacksPerSide: 8,
  minAccountHours: 0,
};

export const TRADE_LIMITS = {
  expiryHours: { min: 1, max: 24 * 14 },
  maxOpenPerUser: { min: 1, max: 50 },
  cooldownSeconds: { min: 0, max: 3600 },
  maxStacksPerSide: { min: 1, max: 30 },
  minAccountHours: { min: 0, max: 24 * 30 },
  copiesPerStack: 99,
  noteLength: 140,
} as const;

const clampInt = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/** Coerces stored / posted settings into valid ones. */
export interface TradeItemLike { variant: string; count: number }

// TRIAL (ROADMAP 51.7, two weeks): a reversal of a "big" trade is logged as one that would need a second approval; nothing is blocked.
// Big = any Golden print, or this many prints or more across both sides. shortcut: no card values or serial editions (the action has no
// season cards in hand), upgrade to a value threshold if the trial shows this misses the trades staff worry about.
export const BIG_TRADE_PRINTS = 6;
export const SECOND_APPROVAL_NOTE = 'would need a second approval';

export function isBigReversal(trade: { give: TradeItemLike[]; get: TradeItemLike[] }): boolean {
  const items = [...trade.give, ...trade.get];
  return items.some(i => i.variant === 'golden') || items.reduce((n, i) => n + i.count, 0) >= BIG_TRADE_PRINTS;
}
export function sanitizeTradeSettings(input: unknown): TradeSettings {
  const i = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const d = DEFAULT_TRADE_SETTINGS;
  return {
    enabled: i.enabled === undefined ? d.enabled : i.enabled === true || i.enabled === 'on' || i.enabled === 'true',
    expiryHours: clampInt(i.expiryHours, TRADE_LIMITS.expiryHours.min, TRADE_LIMITS.expiryHours.max, d.expiryHours),
    maxOpenPerUser: clampInt(i.maxOpenPerUser, TRADE_LIMITS.maxOpenPerUser.min, TRADE_LIMITS.maxOpenPerUser.max, d.maxOpenPerUser),
    cooldownSeconds: clampInt(i.cooldownSeconds, TRADE_LIMITS.cooldownSeconds.min, TRADE_LIMITS.cooldownSeconds.max, d.cooldownSeconds),
    maxStacksPerSide: clampInt(i.maxStacksPerSide, TRADE_LIMITS.maxStacksPerSide.min, TRADE_LIMITS.maxStacksPerSide.max, d.maxStacksPerSide),
    minAccountHours: clampInt(i.minAccountHours, TRADE_LIMITS.minAccountHours.min, TRADE_LIMITS.minAccountHours.max, d.minAccountHours),
  };
}

/**
 * Cleans a list of stacks sent by a client: drops junk, merges the same card+variant, and clamps counts. Returns null if
 * anything is unusable (a viewer should be told, not silently trimmed) or it is empty / too long.
 */
export function cleanItems(input: unknown, maxStacks: number): TradeItem[] | null {
  if (!Array.isArray(input) || input.length === 0) return null;
  const merged = new Map<string, TradeItem>();
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    const cardNumber = Number(r.cardNumber);
    const count = Math.floor(Number(r.count));
    const variant = String(r.variant) as Variant;
    if (!Number.isInteger(cardNumber) || cardNumber < 1 || cardNumber >= 1_000_000 || !VARIANTS.includes(variant) || !Number.isFinite(count) || count < 1) return null;
    let ids: string[] | undefined;
    if (r.ids !== undefined && r.ids !== null) {
      ids = cleanIds(r.ids, cardNumber, variant, count) ?? undefined;
      if (!ids) return null;
    }
    const key = `${cardNumber}:${variant}`;
    const prev = merged.get(key);
    const total = (prev?.count ?? 0) + count;
    if (total > TRADE_LIMITS.copiesPerStack) return null;
    // Two lines for one card + version merge; picked prints only survive when both lines picked them (and never the same one twice).
    if (prev && (!!prev.ids !== !!ids || (ids && prev.ids!.some(id => ids!.includes(id))))) return null;
    merged.set(key, { cardNumber, variant, count: total, ...(ids ? { ids: [...(prev?.ids ?? []), ...ids] } : {}) });
  }
  const list = [...merged.values()];
  return list.length > maxStacks ? null : list;
}

/** Exact print ids for one stack: `count` distinct ids that all belong to this card + version. Null if anything is off. */
export function cleanIds(input: unknown, cardNumber: number, variant: Variant, count: number): string[] | null {
  if (!Array.isArray(input) || input.length !== count) return null;
  const ids: string[] = [];
  for (const id of input) {
    if (typeof id !== 'string') return null;
    const p = parseCopyId(id);
    if (!p || p.card !== cardNumber || p.variant !== variant || p.n < 1 || ids.includes(id)) return null;
    ids.push(id);
  }
  return ids;
}

/** Does any stack name exact prints? */
export const hasPickedPrints = (items: TradeItem[]) => items.some(i => i.ids?.length);

/** The ledger move for one stack: exact prints when chosen, otherwise the newest `count` (the ledger's default). */
export const moveOf = (i: TradeItem) => ({ entry: encodeEntry(i.cardNumber, i.variant), count: i.count, ...(i.ids ? { ids: i.ids } : {}) });

/** The stacks of a trade with the taker's own choices filled in (`chosen` by collection entry); stacks the offerer already pinned stay as they are. Null if a choice is malformed. */
export function withChosenPrints(items: TradeItem[], chosen: Record<string, string[]> | undefined): TradeItem[] | null {
  if (!chosen) return items;
  const out: TradeItem[] = [];
  for (const i of items) {
    const picked = chosen[String(encodeEntry(i.cardNumber, i.variant))];
    if (i.ids || picked === undefined) { out.push(i); continue; }
    const ids = cleanIds(picked, i.cardNumber, i.variant, i.count);
    if (!ids) return null;
    out.push({ ...i, ids });
  }
  return out;
}

/** The collection entries a list of stacks stands for, one per copy. */
export function itemEntries(items: TradeItem[]): number[] {
  return items.flatMap(i => Array<number>(i.count).fill(encodeEntry(i.cardNumber, i.variant)));
}

export const itemCopies = (items: TradeItem[]) => items.reduce((n, i) => n + i.count, 0);

/** How many copies of an exact card+variant a collection holds. */
export function ownedCopies(owned: number[], cardNumber: number, variant: Variant): number {
  const entry = encodeEntry(cardNumber, variant);
  let n = 0;
  for (const e of owned) if (e === entry) n++;
  return n;
}

/** The first stack the collection can't cover (null = it owns everything listed). */
export function firstMissing(owned: number[], items: TradeItem[]): TradeItem | null {
  return items.find(i => ownedCopies(owned, i.cardNumber, i.variant) < i.count) ?? null;
}

/**
 * Settles an accepted trade. `give` is already held in escrow, so only two collections change: the taker hands over `get` to
 * the offerer and receives `give`. Returns both new collections, or the stack the taker lacks. Every copy that leaves one place
 * arrives in the other: nothing is created or destroyed.
 */
export function settleTrade(
  offererOwned: number[],
  takerOwned: number[],
  give: TradeItem[],
  get: TradeItem[],
): { ok: true; offerer: number[]; taker: number[] } | { ok: false; missing: TradeItem } {
  const lacking = firstMissing(takerOwned, get);
  if (lacking) return { ok: false, missing: lacking };
  let taker: number[] | null = takerOwned;
  for (const item of get) taker = removeEntries(taker!, encodeEntry(item.cardNumber, item.variant), item.count);
  if (!taker) throw new Error('settlement invariant broken'); // unreachable: ownership was checked above
  return { ok: true, offerer: [...offererOwned, ...itemEntries(get)], taker: [...taker, ...itemEntries(give)] };
}

/**
 * Takes `items` out of a collection for escrow. Returns the remainder, or the stack the viewer doesn't have.
 */
export function takeForEscrow(owned: number[], items: TradeItem[]): { ok: true; rest: number[] } | { ok: false; missing: TradeItem } {
  const lacking = firstMissing(owned, items);
  if (lacking) return { ok: false, missing: lacking };
  let rest: number[] | null = owned;
  for (const item of items) rest = removeEntries(rest!, encodeEntry(item.cardNumber, item.variant), item.count);
  if (!rest) throw new Error('escrow invariant broken'); // unreachable
  return { ok: true, rest };
}

/** "2Ã— Regular #5, Shiny Full Art #12" for logs and messages (names are looked up by the caller where it has them). */
export function describeItems(items: TradeItem[], nameOf?: (cardNumber: number) => string | undefined): string {
  return items
    .map(i => `${i.count > 1 ? `${i.count}Ã— ` : ''}${nameOf?.(i.cardNumber) ?? `#${i.cardNumber}`} (${VARIANT_LABELS[i.variant]})`)
    .join(', ');
}
