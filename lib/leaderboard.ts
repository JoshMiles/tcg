import type { Card, Pack, Season, Variant } from './types';
import { getCollection, getPackCards, getPacksForSeason } from './kv';
import { VARIANTS, decodeEntry, effectiveWeights, emptyCounts, encodeEntry, type VariantCounts } from './variants';
import { DEFAULT_SCORING, getScoringSettings, type ScoringSettings } from './scoring';
import type { CardMaths } from './card-maths';

// Every tunable number (base score, scarcity range, upgrade margin, bonus sizes, ...) lives in ScoringSettings
// (lib/scoring.ts), edited in Admin -> Settings -> Scoring. Functions here take them as a parameter and default to the
// built-in defaults, so they stay pure and testable.

export interface CardValue {
  number: number;
  /** Chance that one pull of the season is this card, before the variant roll. */
  pullRate: number;
  /** How many copies of this card exist across everyone's collections this season (all variants). */
  copies: number;
  /** The same, split by variant. */
  variantCopies: VariantCounts;
  /**
   * Per variant: >1 when that version of this card is scarcer than the average card's copies of that version,
   * <1 when it's more common. A Shiny is compared with other Shinies, a Regular with other Regulars.
   */
  scarcity: Record<Variant, number>;
  /** Points per copy, by variant. */
  values: Record<Variant, number>;
  /** The working behind `values`, for the card details' Advanced information panel. */
  maths: CardMaths;
}

export interface LeaderboardRow {
  username: string;
  /** Total: card points + completion bonus + complete-collection bonus. */
  score: number;
  /** Value of every copy owned. */
  cardPoints: number;
  completionBonus: number;
  setBonus: number;
  /** Owns at least one of every card in the season. */
  complete: boolean;
  uniqueCards: number;
  copies: number;
  variants: VariantCounts;
}

export interface SeasonValues {
  cards: Map<number, CardValue>;
  totalCards: number;
  totalCopies: number;
  /** What one Regular copy of every card is worth right now: the yardstick for the collection bonuses. */
  setValue: number;
  /** The scoring settings these values were computed with. */
  settings: ScoringSettings;
}

export interface Bonuses {
  completion: number;
  set: number;
  /** Fraction of the season's cards owned (0-1). */
  fraction: number;
  complete: boolean;
}

/** The two collection bonuses for someone who owns `uniqueCards` distinct cards of the season. */
export function collectionBonuses(values: Pick<SeasonValues, 'totalCards' | 'setValue' | 'settings'>, uniqueCards: number): Bonuses {
  const total = values.totalCards;
  const fraction = total > 0 ? Math.min(1, uniqueCards / total) : 0;
  const complete = total > 0 && uniqueCards >= total;
  return {
    completion: Math.round(values.setValue * (values.settings.completionBonusPct / 100) * fraction),
    set: complete ? Math.round(values.setValue * (values.settings.completeSetBonusPct / 100)) : 0,
    fraction,
    complete,
  };
}

/**
 * How much a copy at each variant is worth relative to Regular. Starts from the variant odds (a 1-in-100
 * shiny is worth ~100 regulars), but never less than the cost of crafting it plus a margin — otherwise
 * upgrading could lower a viewer's score.
 */
export function variantMultiplierDetail(
  pack: Pick<Pack, 'upgradesEnabled' | 'variantWeights' | 'upgradeCosts' | 'disabledVariants'>,
  settings: ScoringSettings = DEFAULT_SCORING,
): { multiplier: Record<Variant, number>; byOdds: Record<Variant, number>; byCost: Record<Variant, number> } {
  const m: Record<Variant, number> = { regular: 1, reverse: 1, full: 1, shiny: 1 };
  const byOddsAll: Record<Variant, number> = { regular: 1, reverse: 1, full: 1, shiny: 1 };
  const byCostAll: Record<Variant, number> = { regular: 1, reverse: 1, full: 1, shiny: 1 };
  if (!pack.upgradesEnabled) return { multiplier: m, byOdds: byOddsAll, byCost: byCostAll };
  const w = effectiveWeights(pack); // switched-off variants have no odds, so only the crafting cost sets their value
  for (let i = 1; i < VARIANTS.length; i++) {
    const v = VARIANTS[i];
    const byOdds = w[v] > 0 ? w.regular / w[v] : 0;
    const byCost = m[VARIANTS[i - 1]] * pack.upgradeCosts[v as Exclude<Variant, 'regular'>] * settings.upgradeMargin;
    byOddsAll[v] = byOdds;
    byCostAll[v] = byCost;
    m[v] = Math.max(byOdds, byCost);
  }
  return { multiplier: m, byOdds: byOddsAll, byCost: byCostAll };
}

export function variantMultipliers(
  pack: Pick<Pack, 'upgradesEnabled' | 'variantWeights' | 'upgradeCosts' | 'disabledVariants'>,
  settings: ScoringSettings = DEFAULT_SCORING,
): Record<Variant, number> {
  return variantMultiplierDetail(pack, settings).multiplier;
}

/**
 * Per-card values for a season:
 *   value = SCORE_BASE × rarity × scarcity × variantMultiplier
 * - rarity: how much rarer than an average card it is to roll (1 = average; from card probability and pack weight)
 * - scarcity: season-wide and **per variant** — how many copies of this exact version exist vs the average card's copies of
 *   that version; bounded 0.5×–2× so one hot week can't swamp the board. Spending copies in an upgrade therefore makes
 *   the version you spent scarcer (its remaining copies are worth more) and adds to the next version's count
 * - variantMultiplier: see variantMultipliers
 */
export function computeSeasonValues(
  packs: { pack: Pack; cards: Card[] }[],
  collection: Record<string, number[]>,
  settings: ScoringSettings = DEFAULT_SCORING,
): SeasonValues {
  const active = packs.filter(p => p.cards.length > 0);
  const totalPackWeight = active.reduce((s, p) => s + (p.pack.weight || 1), 0);
  const totalCards = active.reduce((s, p) => s + p.cards.length, 0);

  const copiesByCard = new Map<number, VariantCounts>();
  const totalByVariant = emptyCounts();
  let totalCopies = 0;
  for (const entries of Object.values(collection)) {
    for (const entry of entries) {
      const { cardNumber, variant } = decodeEntry(entry);
      const counts = copiesByCard.get(cardNumber) ?? emptyCounts();
      counts[variant]++;
      copiesByCard.set(cardNumber, counts);
      totalByVariant[variant]++;
      totalCopies++;
    }
  }
  // Average copies of each version per card in the season.
  const avgByVariant = emptyCounts();
  for (const v of VARIANTS) avgByVariant[v] = totalCards > 0 ? totalByVariant[v] / totalCards : 0;

  const cards = new Map<number, CardValue>();
  for (const { pack, cards: packCards } of active) {
    const totalProb = packCards.reduce((s, c) => s + c.probability, 0);
    const detail = variantMultiplierDetail(pack, settings);
    const mult = detail.multiplier;
    const packWeights = effectiveWeights(pack);
    for (const card of packCards) {
      const pullRate = totalProb > 0 && totalPackWeight > 0
        ? ((pack.weight || 1) / totalPackWeight) * (card.probability / totalProb)
        : 1 / Math.max(1, totalCards);
      const rarity = pullRate > 0 ? Math.pow(1 / (pullRate * totalCards), settings.rarityExponent) : 1;
      const variantCopies = copiesByCard.get(card.number) ?? emptyCounts();
      const copies = VARIANTS.reduce((s, v) => s + variantCopies[v], 0);
      const scarcity = {} as Record<Variant, number>;
      const values = {} as Record<Variant, number>;
      const scarcityRaw = {} as Record<Variant, number>;
      const raw = {} as Record<Variant, number>;
      for (const v of VARIANTS) {
        // Smoothing keeps early-season values (when counts are tiny) from lurching around.
        const k = settings.scarcitySmoothing;
        scarcityRaw[v] = (avgByVariant[v] + k) / (variantCopies[v] + k);
        scarcity[v] = Math.min(settings.scarcityMax, Math.max(settings.scarcityMin, scarcityRaw[v]));
        raw[v] = settings.baseScore * rarity * scarcity[v] * mult[v];
        values[v] = Math.max(1, Math.round(raw[v]));
      }
      const maths: CardMaths = {
        baseScore: settings.baseScore, rarityExponent: settings.rarityExponent,
        scarcityMin: settings.scarcityMin, scarcityMax: settings.scarcityMax, scarcitySmoothing: settings.scarcitySmoothing,
        upgradeMargin: settings.upgradeMargin, completionBonusPct: settings.completionBonusPct, completeSetBonusPct: settings.completeSetBonusPct,
        packWeight: pack.weight || 1, totalPackWeight, cardProbability: card.probability, totalProbability: totalProb, pullRate,
        totalCards, rarityBase: pullRate > 0 ? 1 / (pullRate * totalCards) : 1, rarity,
        upgradesEnabled: !!pack.upgradesEnabled, weights: packWeights, costs: pack.upgradeCosts,
        byOdds: detail.byOdds, byCost: detail.byCost, multiplier: mult,
        avgCopies: avgByVariant, copies: variantCopies, scarcityRaw, scarcity, raw, values,
        setValue: 0, totalCopies,
      };
      cards.set(card.number, { number: card.number, pullRate, copies, variantCopies, scarcity, values, maths });
    }
  }
  let setValue = 0;
  for (const cv of cards.values()) setValue += cv.values.regular;
  for (const cv of cards.values()) cv.maths.setValue = setValue;
  return { cards, totalCards, totalCopies, setValue, settings };
}

/** One viewer's total score: the value of every copy they hold, plus the collection bonuses. */
export function scoreFor(values: SeasonValues, entries: number[]): number {
  let score = 0;
  const unique = new Set<number>();
  for (const entry of entries) {
    const { cardNumber, variant } = decodeEntry(entry);
    const cv = values.cards.get(cardNumber);
    if (!cv) continue; // card since deleted from the season
    score += cv.values[variant];
    unique.add(cardNumber);
  }
  const b = collectionBonuses(values, unique.size);
  return score + b.completion + b.set;
}

/**
 * What an upgrade would really do to a viewer's score: recompute every value with `cost` copies of `from` removed
 * and one `to` added (so scarcity moves too), and compare. Can be negative if scarcity shifts more than the variant gains.
 */
export function projectUpgradeGain(
  packs: { pack: Pack; cards: Card[] }[],
  collection: Record<string, number[]>,
  username: string,
  cardNumber: number,
  from: Variant,
  to: Variant,
  cost: number,
  settings: ScoringSettings = DEFAULT_SCORING,
): number | null {
  const owned = collection[username];
  if (!owned) return null;
  const fromEntry = encodeEntry(cardNumber, from);
  const after: number[] = [];
  let toRemove = cost;
  for (const e of owned) {
    if (e === fromEntry && toRemove > 0) toRemove--;
    else after.push(e);
  }
  if (toRemove > 0) return null; // doesn't have enough copies
  after.push(encodeEntry(cardNumber, to));

  const before = scoreFor(computeSeasonValues(packs, collection, settings), owned);
  const next = scoreFor(computeSeasonValues(packs, { ...collection, [username]: after }, settings), after);
  return next - before;
}

export function buildLeaderboard(values: SeasonValues, collection: Record<string, number[]>): LeaderboardRow[] {
  const rows: LeaderboardRow[] = [];
  for (const [username, entries] of Object.entries(collection)) {
    const variants = emptyCounts();
    const unique = new Set<number>();
    let score = 0;
    let copies = 0;
    for (const entry of entries) {
      const { cardNumber, variant } = decodeEntry(entry);
      const cv = values.cards.get(cardNumber);
      if (!cv) continue; // card since deleted from the season
      score += cv.values[variant];
      variants[variant]++;
      unique.add(cardNumber);
      copies++;
    }
    if (copies > 0) {
      const b = collectionBonuses(values, unique.size);
      rows.push({
        username: username.toLowerCase(),
        score: score + b.completion + b.set,
        cardPoints: score,
        completionBonus: b.completion,
        setBonus: b.set,
        complete: b.complete,
        uniqueCards: unique.size,
        copies,
        variants,
      });
    }
  }
  return rows.sort((a, b) => b.score - a.score || b.uniqueCards - a.uniqueCards || a.username.localeCompare(b.username));
}

/** Loads everything needed and returns the season's value table plus ranked rows. */
export async function getSeasonLeaderboard(season: Season): Promise<{
  rows: LeaderboardRow[];
  values: SeasonValues;
  packs: { pack: Pack; cards: Card[] }[];
}> {
  const [packList, collection, settings] = await Promise.all([
    getPacksForSeason(season),
    getCollection(season.collectionName),
    getScoringSettings(),
  ]);
  const packs = await Promise.all(packList.map(async pack => ({ pack, cards: await getPackCards(pack.id) })));
  const values = computeSeasonValues(packs, collection, settings);
  return { rows: buildLeaderboard(values, collection), values, packs };
}
