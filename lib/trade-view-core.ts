import type { Variant } from './types';
import { VARIANTS } from './variants';
import type { TradeItem } from './trade-core';
import { serialMultiplier } from './scoring-core';
import { encodeEntry } from './variants';
import type { SerialPool } from './serials-core';

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

/** Serial numbers for pricing offers: each open offer's escrowed copies, and (for a viewer) the copies they hold. */
export interface TradePools {
  viewer: string | null;
  /** Serials in each offer's escrow (its give side), by trade id. */
  give: Record<string, SerialPool>;
  /** What the viewer holds: the pool their side of an offer is taken from. */
  mine: SerialPool;
}

/** The pools to price an offer with: its escrow for what it gives, the viewer's copies for what it asks (unless it is their own offer). */
export function poolsFor(trade: { id: string; from: string }, pools?: TradePools): { give?: SerialPool; get?: SerialPool } {
  if (!pools) return {};
  return { give: pools.give[trade.id], get: pools.viewer && pools.viewer !== trade.from ? pools.mine : undefined };
}

/**
 * Total points of a list of stacks at today's values. With a `pool` (the serials the copies would come from) each stack is priced
 * with its real serial bonuses: trades move the NEWEST copies first, so a stack of k takes the k highest serials in the pool.
 * Stacks the pool does not cover are priced without a bonus.
 */
export function stackPoints(items: TradeItem[], cards: Record<number, TradeCardInfo>, pool?: SerialPool): number {
  return items.reduce((n, i) => {
    const card = cards[i.cardNumber];
    const serials = (pool?.[encodeEntry(i.cardNumber, i.variant)] ?? []).slice(-i.count);
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
