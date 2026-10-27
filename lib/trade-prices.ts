import type { Trade, TradeItem } from './trade-core';

/** One finished trade that moved a card, seen from the card's side. No usernames: the guide is public. */
export interface RecentTrade {
  id: string;
  at: number;
  /** The card's own stacks in the trade (its side). */
  card: TradeItem[];
  /** What the other side handed over for it. */
  other: TradeItem[];
}

/**
 * What a card went for lately: the newest accepted, not reversed trades of this season in which one side was only copies of this card.
 * Trades are barter, so the price is the other side. A side that mixes in other cards is skipped (it would not be this card's price).
 * `history` is `trades:history`, newest first.
 */
export function recentTradesFor(history: Trade[], seasonId: string, cardNumber: number, limit = 5): RecentTrade[] {
  const out: RecentTrade[] = [];
  for (const t of history) {
    if (out.length >= limit) break;
    if (t.status !== 'accepted' || t.reversedAt || t.seasonId !== seasonId) continue;
    const side = [t.give, t.get].find(s => s.length > 0 && s.every(i => i.cardNumber === cardNumber));
    if (!side) continue;
    const other = side === t.give ? t.get : t.give;
    if (other.length === 0) continue;
    out.push({ id: t.id, at: t.resolvedAt ?? t.createdAt, card: side, other });
  }
  return out;
}
