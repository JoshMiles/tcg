import type { Card, Pack, Season, Variant } from './types';
import { getCollection, getPackCards, getPacksForSeason } from './kv';
import { VARIANTS, decodeEntry, emptyCounts, type VariantCounts } from './variants';

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
  /** >1 when the card is scarcer than average this season, <1 when it's more common. */
  scarcity: number;
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
 * - scarcity: season-wide, from how many copies exist vs the average card; bounded 0.5×–2× so one hot week can't swamp the board
 * - variantMultiplier: see variantMultipliers
 */
export function computeSeasonValues(
  packs: { pack: Pack; cards: Card[] }[],
  collection: Record<string, number[]>,
): SeasonValues {
  const active = packs.filter(p => p.cards.length > 0);
  const totalPackWeight = active.reduce((s, p) => s + (p.pack.weight || 1), 0);
  const totalCards = active.reduce((s, p) => s + p.cards.length, 0);

  const copiesByCard = new Map<number, number>();
  let totalCopies = 0;
  for (const entries of Object.values(collection)) {
    for (const entry of entries) {
      const { cardNumber } = decodeEntry(entry);
      copiesByCard.set(cardNumber, (copiesByCard.get(cardNumber) ?? 0) + 1);
      totalCopies++;
    }
  }
  const avgCopies = totalCards > 0 ? totalCopies / totalCards : 0;

  const cards = new Map<number, CardValue>();
  for (const { pack, cards: packCards } of active) {
    const totalProb = packCards.reduce((s, c) => s + c.probability, 0);
    const mult = variantMultipliers(pack);
    for (const card of packCards) {
      const pullRate = totalProb > 0 && totalPackWeight > 0
        ? ((pack.weight || 1) / totalPackWeight) * (card.probability / totalProb)
        : 1 / Math.max(1, totalCards);
      const rarity = pullRate > 0 ? 1 / (pullRate * totalCards) : 1;
      const copies = copiesByCard.get(card.number) ?? 0;
      const scarcity = Math.min(2, Math.max(0.5, (avgCopies + 1) / (copies + 1)));
      const values = {} as Record<Variant, number>;
      for (const v of VARIANTS) values[v] = Math.max(1, Math.round(SCORE_BASE * rarity * scarcity * mult[v]));
      cards.set(card.number, { number: card.number, pullRate, copies, scarcity, values });
    }
  }
  return { cards, totalCards, totalCopies };
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
