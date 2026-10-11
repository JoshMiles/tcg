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
  scarcityMin: number;
  scarcityMax: number;
  scarcitySmoothing: number;
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

  /** Season-wide: average copies per card of each version, this card's copies of it, and the factor that gives. */
  avgCopies: Record<Variant, number>;
  copies: VariantCounts;
  /** (avg + k) / (copies + k) before clamping. */
  scarcityRaw: Record<Variant, number>;
  scarcity: Record<Variant, number>;

  /** base × rarity × scarcity × multiplier before rounding, and the points after (rounded, at least 1). */
  raw: Record<Variant, number>;
  values: Record<Variant, number>;

  /** What one Regular copy of every card is worth right now: the yardstick for the collection bonuses. */
  setValue: number;
  totalCopies: number;
}
