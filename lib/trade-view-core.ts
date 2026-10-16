import type { Variant } from './types';
import { VARIANTS } from './variants';
import type { TradeItem } from './trade-core';
import { serialMultiplier } from './scoring-core';
import { encodeEntry } from './variants';
import { parseCopyId, type SerialPool } from './serials-core';

// Client-safe helpers for the trade screens (no database access). The data loader that builds these lives in lib/trade-view.ts.

/** What the trade screens need to know about a card. Plain data, so it can be passed to client components. */
export interface TradeCardInfo {
  number: number;
  name: string;
  imageUrl: string;
  fullArtImageUrl?: string;
  stars: number;
  packName: string;
  /** The variants this card can be wanted in (Regular only where the pack has upgrades off). */
  variants: Variant[];
  /** Points per copy, aligned with VARIANTS (before any serial bonus). */
  values: number[];
  /** The same before rounding, so a copy with a low serial number can be priced exactly. */
  raw: number[];
  /** The serial bonus rule (see ScoringSettings). */
  bonus: { max: number; cutoff: number };
}

/** One copy's points given its serial number (undefined = no bonus). */
export function copyValue(card: TradeCardInfo | undefined, variant: Variant, serial?: number): number {
  if (!card) return 0;
  const i = VARIANTS.indexOf(variant);
  const mult = serialMultiplier(serial, { serialBonusMax: card.bonus.max, serialBonusCutoff: card.bonus.cutoff });
  return mult === 1 ? card.values[i] ?? 0 : Math.max(1, Math.round((card.raw[i] ?? 0) * mult));
}

/** One print a viewer holds, for the print pickers: its copy id, edition number and unique print number. */
export interface PrintInfo { id: string; n: number; uid?: number }
/** A holder's prints by collection entry (card + version), lowest edition first. Empty where the season's prints are not numbered. */
export type PrintPool = Record<number, PrintInfo[]>;

/** Groups copies into a print pool. */
export function printPoolOf(copies: { id: string; n: number; uid?: number; card: number; variant: Variant }[]): PrintPool {
  const pool: PrintPool = {};
  for (const c of copies) (pool[encodeEntry(c.card, c.variant)] ??= []).push({ id: c.id, n: c.n, ...(c.uid ? { uid: c.uid } : {}) });
  for (const list of Object.values(pool)) list.sort((a, b) => a.n - b.n);
  return pool;
}

/** What the accept flow needs to let the taker choose prints: where to look them up and the stacks the offer asks for. */
export interface PickProps { seasonId: string; username: string; items: TradeItem[]; cards: Record<number, TradeCardInfo> }

/** The accept flow's picker data for an offer the viewer could take (undefined when signed out or the offer asks for nothing choosable). */
export function pickPropsFor(trade: { seasonId: string; get: TradeItem[] }, viewer: string | null | undefined, cards: Record<number, TradeCardInfo>): PickProps | undefined {
  const items = trade.get.filter(i => !i.ids);
  if (!viewer || items.length === 0) return undefined;
  return { seasonId: trade.seasonId, username: viewer, items, cards: Object.fromEntries(items.flatMap(i => (cards[i.cardNumber] ? [[i.cardNumber, cards[i.cardNumber]]] : []))) };
}

/** The newest `count` prints of an entry (what an unpicked trade moves), as ids. */
export const newestIds = (prints: PrintInfo[] | undefined, count: number): string[] => [...(prints ?? [])].sort((a, b) => b.n - a.n).slice(0, count).map(p => p.id);

/** Serial numbers for pricing offers: each open offer's escrowed copies, and (for a viewer) the copies they hold. */
export interface TradePools {
  viewer: string | null;
  /** Serials in each offer's escrow (its give side), by trade id. */
  give: Record<string, SerialPool>;
  /** What the viewer holds: the pool their side of an offer is taken from. */
  mine: SerialPool;
  /** Unique print numbers of the exact prints named by open trades (copy id -> uid), so a picked print can be shown as "Print #1023381". */
  uids?: Record<string, number>;
}

/** The pools to price an offer with: its escrow for what it gives, the viewer's copies for what it asks (unless it is their own offer). */
export function poolsFor(trade: { id: string; from: string }, pools?: TradePools): { give?: SerialPool; get?: SerialPool } {
  if (!pools) return {};
  return { give: pools.give[trade.id], get: pools.viewer && pools.viewer !== trade.from ? pools.mine : undefined };
}

/**
 * Total points of a list of stacks at today's values. With a `pool` (the serials the copies would come from) each stack is priced
 * with its real serial bonuses: trades move the NEWEST copies first, so a stack of k takes the k highest serials in the pool.
 * Stacks the pool does not cover are priced without a bonus. A stack with chosen prints (`ids`) is priced from those prints, whatever the pool says.
 */
export function stackPoints(items: TradeItem[], cards: Record<number, TradeCardInfo>, pool?: SerialPool): number {
  return items.reduce((n, i) => {
    const card = cards[i.cardNumber];
    const serials = i.ids ? i.ids.map(id => parseCopyId(id)?.n ?? 0).filter(n => n > 0).sort((a, b) => a - b) : (pool?.[encodeEntry(i.cardNumber, i.variant)] ?? []).slice(-i.count);
    let pts = 0;
    for (let k = 0; k < i.count; k++) pts += copyValue(card, i.variant, k < serials.length ? serials[serials.length - 1 - k] : undefined);
    return n + pts;
  }, 0);
}

/** "in 31h", "in 12m", "ended" for an offer's expiry. */
export function timeLeft(expiresAt: number, now = Date.now()): string {
  const ms = expiresAt - now;
  if (ms <= 0) return 'ended';
  const m = Math.ceil(ms / 60_000);
  if (m < 60) return `in ${m}m`;
  const h = Math.floor(m / 60);
  return h < 48 ? `in ${h}h` : `in ${Math.floor(h / 24)}d`;
}
