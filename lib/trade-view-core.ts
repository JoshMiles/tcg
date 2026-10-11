import type { Variant } from './types';
import { VARIANTS } from './variants';
import type { TradeItem } from './trade-core';

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
  /** Points per copy, aligned with VARIANTS. */
  values: number[];
}

/** Total points of a list of stacks at today's values. */
export function stackPoints(items: TradeItem[], cards: Record<number, TradeCardInfo>): number {
  return items.reduce((n, i) => n + (cards[i.cardNumber]?.values[VARIANTS.indexOf(i.variant)] ?? 0) * i.count, 0);
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
