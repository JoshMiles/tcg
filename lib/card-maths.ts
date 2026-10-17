import type { Variant } from './types';
import type { VariantCounts } from './variants';

/**
 * Every input and intermediate number behind one card's points, so the "Advanced information" panel can show the working.
 * Built in computeSeasonValues (lib/leaderboard.ts) from the SAME numbers the values use, so it can't drift from them.
 * Plain data (no database access), so client components can import it.
 */
export interface CardMaths {
  /** The scoring settings that applied. */
  baseScore: number;
  rarityExponent: number;
  serialBonusMax: number;
  serialBonusCutoff: number;
  upgradeMargin: number;
  completionBonusPct: number;
  completeSetBonusPct: number;

  /** Pull chance = (packWeight / totalPackWeight) × (cardProbability / totalProbability). */
  packWeight: number;
  totalPackWeight: number;
  cardProbability: number;
  totalProbability: number;
  pullRate: number;
  /** Cards in the season. */
  totalCards: number;
  /** 1 / (pullRate × totalCards): how many times rarer than an average card, before the exponent. */
  rarityBase: number;
  /** rarityBase ^ rarityExponent. */
  rarity: number;

  /** Whether this card's pack has variants at all (otherwise every multiplier is 1). */
  upgradesEnabled: boolean;
  /** Effective variant roll weights (switched-off variants are 0). */
  weights: Record<Variant, number>;
  /** Copies needed for each upgrade step in a row (Regular→Reverse, Reverse→Full, Full→Shiny). */
  costs: { reverse: number; full: number; shiny: number };
  /** Variant multiplier workings: byOdds = regular weight ÷ this weight, byCost = previous multiplier × cost × margin. */
  byOdds: Record<Variant, number>;
  byCost: Record<Variant, number>;
  multiplier: Record<Variant, number>;

  /** Season-wide: how many copies of this card exist in each version. */
  copies: VariantCounts;

  /** base × rarity × multiplier before rounding (a copy's serial bonus comes on top), and the points after (rounded, at least 1). */
  raw: Record<Variant, number>;
  values: Record<Variant, number>;

  /** What one Regular copy of every card is worth right now: the yardstick for the collection bonuses. */
  setValue: number;
  totalCopies: number;
}

// ── A card's chance within its pack, from the weights typed (saved or not) ──
// One place for the arithmetic, so the pack workspace's list, grid, card panel and Odds view always agree.

/** The sum of the weights that can be drawn (negative and non-numbers count as 0). */
export const totalWeight = (weights: number[]) => weights.reduce((s, w) => s + (w > 0 ? w : 0), 0);

/** A weight's share of the pack (0 to 1; 0 when it cannot be drawn). */
export const shareOf = (weight: number, total: number) => (weight > 0 && total > 0 ? weight / total : 0);

/** "1 in 40", or "-" when the card can never be drawn. */
export function oneInLabel(weight: number, total: number): string {
  const s = shareOf(weight, total);
  return s > 0 ? `1 in ${Math.round(1 / s).toLocaleString('en-GB')}` : '-';
}
