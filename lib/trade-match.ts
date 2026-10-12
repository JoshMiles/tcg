import { encodeEntry } from './variants';
import { firstMissing, type Trade, type TradeItem } from './trade-core';
import { stackPoints, type TradeCardInfo } from './trade-view-core';

// Which open listings on the board suit a viewer (pure, client-safe): ones that give a card they are looking for or do not own yet,
// and ones that only ask for spare copies. The server still decides whether a trade is allowed; this only ranks and explains.

export interface MatchViewer {
  /** Copies owned per exact card + version (a collection entry, see lib/variants.ts). */
  copies: Map<number, number>;
  /** Cards on their Looking for list. */
  wanted: Set<number>;
}

export interface MatchInfo {
  trade: Trade;
  canTake: boolean;
  /** Cards offered that are on the viewer's Looking for list. */
  offersWanted: TradeItem[];
  /** Cards offered that the viewer owns no copy of (in any version). */
  offersNew: TradeItem[];
  /** Everything asked for is a spare: the viewer would still keep at least one copy of each. */
  asksOnlySpares: boolean;
  /** Points the viewer would gain (negative = give up more than they get), at today's values. */
  gain: number;
  score: number;
  reasons: string[];
}

const ownsAny = (copies: Map<number, number>, card: number) => [0, 1, 2, 3].some(v => (copies.get(card + 1_000_000 * v) ?? 0) > 0);

export function matchTrade(trade: Trade, viewer: MatchViewer, cards: Record<number, TradeCardInfo>): MatchInfo {
  // ownedList for firstMissing: expand counts back into an entry list (small: only the asked-for stacks matter).
  const owned: number[] = [];
  for (const i of trade.get) owned.push(...Array<number>(viewer.copies.get(encodeEntry(i.cardNumber, i.variant)) ?? 0).fill(encodeEntry(i.cardNumber, i.variant)));
  const canTake = !firstMissing(owned, trade.get);
  const offersWanted = trade.give.filter(i => viewer.wanted.has(i.cardNumber));
  const offersNew = trade.give.filter(i => !ownsAny(viewer.copies, i.cardNumber));
  const asksOnlySpares = canTake && trade.get.every(i => (viewer.copies.get(encodeEntry(i.cardNumber, i.variant)) ?? 0) > i.count);
  const gain = Math.round(stackPoints(trade.give, cards) - stackPoints(trade.get, cards));

  const reasons: string[] = [];
  if (offersWanted.length > 0) reasons.push('Offers a card you are looking for');
  if (offersNew.length > 0) reasons.push('Offers a card you do not have yet');
  if (asksOnlySpares) reasons.push('Asks only for your spare copies');
  if (gain > 0) reasons.push(`You gain about ${gain.toLocaleString()} points`);

  const score = offersWanted.length * 100 + offersNew.length * 30 + (asksOnlySpares ? 25 : 0) + (canTake ? 20 : -50) + Math.max(-20, Math.min(20, gain / 10));
  return { trade, canTake, offersWanted, offersNew, asksOnlySpares, gain, score, reasons };
}

/** Listings worth showing as "matches": something you want or lack, or a fair trade of spares, that you can actually take. Best first. */
export function bestMatches(trades: Trade[], viewer: MatchViewer, cards: Record<number, TradeCardInfo>, limit = 5): MatchInfo[] {
  return trades
    .map(t => matchTrade(t, viewer, cards))
    .filter(m => m.canTake && (m.offersWanted.length > 0 || m.offersNew.length > 0 || (m.asksOnlySpares && m.gain >= 0)))
    .sort((a, b) => b.score - a.score || b.trade.createdAt - a.trade.createdAt)
    .slice(0, limit);
}

/** A short verdict on how even an offer is, from the points each side gives: "Even", "Generous", "Lopsided" (you give a lot more). */
export function fairness(givePts: number, getPts: number): { label: 'Even' | 'Slightly in their favour' | 'Slightly in your favour' | 'Lopsided against you' | 'Generous to them' | 'Empty'; warn: boolean } {
  if (givePts <= 0 && getPts <= 0) return { label: 'Empty', warn: false };
  const hi = Math.max(givePts, getPts), lo = Math.min(givePts, getPts);
  const ratio = lo > 0 ? hi / lo : Infinity;
  if (ratio <= 1.15) return { label: 'Even', warn: false };
  if (givePts > getPts) return ratio >= 2 && hi - lo >= 50 ? { label: 'Lopsided against you', warn: true } : { label: 'Slightly in their favour', warn: false };
  return ratio >= 2 && hi - lo >= 50 ? { label: 'Generous to them', warn: false } : { label: 'Slightly in your favour', warn: false };
}
