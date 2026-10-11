import type { Card, Pack, Season, Variant } from './types';
import { getCollection, getPackCards, getPacksForSeason } from './kv';
import { VARIANTS, decodeEntry, emptyCounts, encodeEntry, type VariantCounts } from './variants';

/** Points an average card (equal pull chance to every other card) at Regular is worth. */
export const SCORE_BASE = 10;
/** Each upgrade must be worth at least this much more than the copies it consumes. */
const UPGRADE_MARGIN = 1.2;

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
}

export interface LeaderboardRow {
  username: string;
  score: number;
  uniqueCards: number;
  copies: number;
  variants: VariantCounts;
}

export interface SeasonValues {
  cards: Map<number, CardValue>;
  totalCards: number;
  totalCopies: number;
}

/**
 * How much a copy at each variant is worth relative to Regular. Starts from the variant odds (a 1-in-100
 * shiny is worth ~100 regulars), but never less than the cost of crafting it plus a margin — otherwise
 * upgrading could lower a viewer's score.
 */
export function variantMultipliers(pack: Pick<Pack, 'upgradesEnabled' | 'variantWeights' | 'upgradeCosts'>): Record<Variant, number> {
  const m: Record<Variant, number> = { regular: 1, reverse: 1, full: 1, shiny: 1 };
  if (!pack.upgradesEnabled) return m;
  const w = pack.variantWeights;
  for (let i = 1; i < VARIANTS.length; i++) {
    const v = VARIANTS[i];
    const byOdds = w[v] > 0 ? w.regular / w[v] : 0;
    const byCost = m[VARIANTS[i - 1]] * pack.upgradeCosts[v as Exclude<Variant, 'regular'>] * UPGRADE_MARGIN;
    m[v] = Math.max(byOdds, byCost);
  }
  return m;
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
    const mult = variantMultipliers(pack);
    for (const card of packCards) {
      const pullRate = totalProb > 0 && totalPackWeight > 0
        ? ((pack.weight || 1) / totalPackWeight) * (card.probability / totalProb)
        : 1 / Math.max(1, totalCards);
      const rarity = pullRate > 0 ? 1 / (pullRate * totalCards) : 1;
      const variantCopies = copiesByCard.get(card.number) ?? emptyCounts();
      const copies = VARIANTS.reduce((s, v) => s + variantCopies[v], 0);
      const scarcity = {} as Record<Variant, number>;
      const values = {} as Record<Variant, number>;
      for (const v of VARIANTS) {
        // +1 smoothing keeps early-season values (when counts are tiny) from lurching around.
        scarcity[v] = Math.min(2, Math.max(0.5, (avgByVariant[v] + 1) / (variantCopies[v] + 1)));
        values[v] = Math.max(1, Math.round(SCORE_BASE * rarity * scarcity[v] * mult[v]));
      }
      cards.set(card.number, { number: card.number, pullRate, copies, variantCopies, scarcity, values });
    }
  }
  return { cards, totalCards, totalCopies };
}

/** One viewer's score: the value of every copy they hold. */
export function scoreFor(values: SeasonValues, entries: number[]): number {
  let score = 0;
  for (const entry of entries) {
    const { cardNumber, variant } = decodeEntry(entry);
    score += values.cards.get(cardNumber)?.values[variant] ?? 0;
  }
  return score;
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

  const before = scoreFor(computeSeasonValues(packs, collection), owned);
  const next = scoreFor(computeSeasonValues(packs, { ...collection, [username]: after }), after);
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
    if (copies > 0) rows.push({ username: username.toLowerCase(), score, uniqueCards: unique.size, copies, variants });
  }
  return rows.sort((a, b) => b.score - a.score || b.uniqueCards - a.uniqueCards || a.username.localeCompare(b.username));
}

/** Loads everything needed and returns the season's value table plus ranked rows. */
export async function getSeasonLeaderboard(season: Season): Promise<{
  rows: LeaderboardRow[];
  values: SeasonValues;
  packs: { pack: Pack; cards: Card[] }[];
}> {
  const [packList, collection] = await Promise.all([getPacksForSeason(season), getCollection(season.collectionName)]);
  const packs = await Promise.all(packList.map(async pack => ({ pack, cards: await getPackCards(pack.id) })));
  const values = computeSeasonValues(packs, collection);
  return { rows: buildLeaderboard(values, collection), values, packs };
}
