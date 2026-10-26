import type { Card, Pack, Season, Variant } from './types';
import { getCollection, getPackCards, getPacksForSeason } from './kv';
import { VARIANTS, decodeEntry, effectiveWeights, emptyCounts, encodeEntry, type VariantCounts } from './variants';
import { DEFAULT_SCORING, getScoringSettings, type ScoringSettings } from './scoring';
import { serialMultiplier } from './scoring-core';
import { loadSerialIndex } from './serials';
import { getScoreBonuses } from './score-bonus';
import type { SerialIndex } from './serials-core';
import { currentSandboxId, kv } from './db';
import { createTtlCache } from './ttl-cache';

/** The set of hidden viewers (KV `users:hidden:admin`, plus the older `users:hidden` array, kept by lib/user-admin.ts); read here directly to avoid a circular import. */
async function getHiddenUsersSafe(): Promise<Set<string>> {
  try {
    const [old, admin, self] = await Promise.all([kv.get<string[]>('users:hidden'), kv.smembers('users:hidden:admin'), kv.smembers('users:hidden:self').catch(() => [] as string[])]);
    return new Set([...(Array.isArray(old) ? old : []), ...(admin as string[]).map(String),...(self as string[])]);
  } catch { return new Set(); }
}
import type { CardMaths } from './card-maths';

// Every tunable number (base score, serial bonus, upgrade margin, bonus sizes, ...) lives in ScoringSettings
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
  /** Points per copy, by variant, before any serial bonus (a copy with a low serial is worth more: see copyPoints). */
  values: Record<Variant, number>;
  /** The working behind `values`, for the card details' Advanced information panel. */
  maths: CardMaths;
}

export interface LeaderboardRow {
  username: string;
  /** Total: card points + progress bonus + full set bonus + bonus points. */
  score: number;
  /** Value of every copy owned, serial bonuses included. */
  cardPoints: number;
  /** The part of `cardPoints` that came from low serial numbers. */
  serialPoints: number;
  completionBonus: number;
  setBonus: number;
  /** Flat points from score-bonus buffs (lib/score-bonus.ts). */
  bonusPoints: number;
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
  /** Who holds which serial numbers. Absent (or a viewer missing from it) = no serial bonus. */
  serials?: SerialIndex | null;
  /** Flat points per viewer from score-bonus buffs; absent = none. */
  bonus?: Record<string, number>;
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

/** One copy's points: the card's value for that version, times the bonus its serial number earns (no serial = no bonus). */
export function copyPoints(cv: CardValue, variant: Variant, serial: number | undefined, settings: ScoringSettings): number {
  const mult = serialMultiplier(serial, settings);
  return mult === 1 ? cv.values[variant] : Math.max(1, Math.round(cv.maths.raw[variant] * mult));
}

export interface HeldPoints {
  /** Points of every copy, serial bonuses included. */
  points: number;
  /** The part of `points` that came from serial bonuses. */
  serialPoints: number;
  unique: Set<number>;
  variants: VariantCounts;
  copies: number;
}

/** What a viewer's copies are worth: each entry takes its serial numbers (lowest first) when the ledger knows them. */
export function pointsFor(values: Pick<SeasonValues, 'cards' | 'settings' | 'serials'>, entries: number[], username?: string): HeldPoints {
  const held = username !== undefined ? values.serials?.held.get(username) : undefined;
  const seen = new Map<number, number>();
  const out: HeldPoints = { points: 0, serialPoints: 0, unique: new Set(), variants: emptyCounts(), copies: 0 };
  for (const entry of entries) {
    const { cardNumber, variant } = decodeEntry(entry);
    const cv = values.cards.get(cardNumber);
    if (!cv) continue; // card since deleted from the season
    const k = seen.get(entry) ?? 0;
    seen.set(entry, k + 1);
    const pts = copyPoints(cv, variant, held?.get(entry)?.[k], values.settings);
    out.points += pts;
    out.serialPoints += pts - cv.values[variant];
    out.unique.add(cardNumber);
    out.variants[variant]++;
    out.copies++;
  }
  return out;
}

/**
 * How much a copy at each variant is worth relative to Regular. Starts from the variant odds (a 1-in-100
 * shiny is worth ~100 regulars), but never less than the cost of crafting it plus a margin, otherwise
 * upgrading could lower a viewer's score.
 */
export function variantMultiplierDetail(
  pack: Pick<Pack, 'upgradesEnabled' | 'variantWeights' | 'upgradeCosts' | 'disabledVariants'>,
  settings: ScoringSettings = DEFAULT_SCORING,
): { multiplier: Record<Variant, number>; byOdds: Record<Variant, number>; byCost: Record<Variant, number> } {
  const m: Record<Variant, number> = { regular: 1, reverse: 1, full: 1, shiny: 1, golden: 1 };
  const byOddsAll: Record<Variant, number> = { regular: 1, reverse: 1, full: 1, shiny: 1, golden: 1 };
  const byCostAll: Record<Variant, number> = { regular: 1, reverse: 1, full: 1, shiny: 1, golden: 1 };
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
 *   value = SCORE_BASE × rarity × variantMultiplier
 * - rarity: how much rarer than an average card it is to roll (1 = average; from card probability and pack weight)
 * - variantMultiplier: see variantMultipliers
 * A copy's own points then get its serial bonus on top (copyPoints): the earliest copies ever made are worth more.
 */
export function computeSeasonValues(
  packs: { pack: Pack; cards: Card[] }[],
  collection: Record<string, number[]>,
  settings: ScoringSettings = DEFAULT_SCORING,
  serials: SerialIndex | null = null,
): SeasonValues {
  const active = packs.filter(p => p.cards.length > 0);
  const totalPackWeight = active.reduce((s, p) => s + (p.pack.weight || 1), 0);
  const totalCards = active.reduce((s, p) => s + p.cards.length, 0);

  const copiesByCard = new Map<number, VariantCounts>();
  let totalCopies = 0;
  for (const entries of Object.values(collection)) {
    for (const entry of entries) {
      const { cardNumber, variant } = decodeEntry(entry);
      const counts = copiesByCard.get(cardNumber) ?? emptyCounts();
      counts[variant]++;
      copiesByCard.set(cardNumber, counts);
      totalCopies++;
    }
  }
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
      const values = {} as Record<Variant, number>;
      const raw = {} as Record<Variant, number>;
      for (const v of VARIANTS) {
        raw[v] = settings.baseScore * rarity * mult[v];
        values[v] = Math.max(1, Math.round(raw[v]));
      }
      const maths: CardMaths = {
        baseScore: settings.baseScore, rarityExponent: settings.rarityExponent,
        serialBonusMax: settings.serialBonusMax, serialBonusCutoff: settings.serialBonusCutoff,
        upgradeMargin: settings.upgradeMargin, completionBonusPct: settings.completionBonusPct, completeSetBonusPct: settings.completeSetBonusPct,
        packWeight: pack.weight || 1, totalPackWeight, cardProbability: card.probability, totalProbability: totalProb, pullRate,
        totalCards, rarityBase: pullRate > 0 ? 1 / (pullRate * totalCards) : 1, rarity,
        upgradesEnabled: !!pack.upgradesEnabled, weights: packWeights, costs: pack.upgradeCosts,
        byOdds: detail.byOdds, byCost: detail.byCost, multiplier: mult,
        copies: variantCopies, raw, values,
        setValue: 0, totalCopies,
      };
      cards.set(card.number, { number: card.number, pullRate, copies, variantCopies, values, maths });
    }
  }
  let setValue = 0;
  for (const cv of cards.values()) setValue += cv.values.regular;
  for (const cv of cards.values()) cv.maths.setValue = setValue;
  return { cards, totalCards, totalCopies, setValue, settings, serials };
}

/** One viewer's total score: the value of every copy they hold, plus the collection bonuses. */
export function scoreFor(values: SeasonValues, entries: number[], username?: string): number {
  const held = pointsFor(values, entries, username);
  const b = collectionBonuses(values, held.unique.size);
  return held.points + b.completion + b.set + (username !== undefined ? values.bonus?.[username] ?? 0 : 0);
}

/**
 * What an upgrade would really do to a viewer's score: `cost` copies of `from` go (the newest serials, as the ledger does) and one
 * `to` copy arrives with the next free serial of that version. Nobody else's copies matter to a value any more, so this is just the
 * viewer's own score before and after. Can be negative when the serial bonuses spent outweigh what the new version adds.
 */
export function projectUpgradeGain(
  values: SeasonValues,
  owned: number[],
  username: string,
  cardNumber: number,
  from: Variant,
  to: Variant,
  cost: number,
): number | null {
  const fromEntry = encodeEntry(cardNumber, from);
  const toEntry = encodeEntry(cardNumber, to);
  const after: number[] = [];
  let toRemove = cost;
  for (let i = owned.length - 1; i >= 0; i--) {
    if (owned[i] === fromEntry && toRemove > 0) toRemove--;
    else after.push(owned[i]);
  }
  if (toRemove > 0) return null; // doesn't have enough copies
  after.push(toEntry);

  const idx = values.serials;
  const held = idx?.held.get(username);
  let afterValues = values;
  if (idx && held) {
    // The same serials after the upgrade: the `cost` highest of the spent version go, the next free one of the new version arrives.
    const spent = held.get(fromEntry) ?? [];
    const next = new Map(held);
    next.set(fromEntry, spent.slice(0, Math.max(0, spent.length - cost)));
    next.set(toEntry, [...(held.get(toEntry) ?? []), (idx.minted.get(toEntry) ?? 0) + 1].sort((a, b) => a - b));
    afterValues = { ...values, serials: { ...idx, held: new Map(idx.held).set(username, next) } };
  }
  return scoreFor(afterValues, after, username) - scoreFor(values, owned, username);
}

export function buildLeaderboard(values: SeasonValues, collection: Record<string, number[]>): LeaderboardRow[] {
  const rows: LeaderboardRow[] = [];
  for (const [username, entries] of Object.entries(collection)) {
    const held = pointsFor(values, entries, username);
    if (held.copies > 0) {
      const b = collectionBonuses(values, held.unique.size);
      const bonusPoints = values.bonus?.[username.toLowerCase()] ?? 0;
      rows.push({
        username: username.toLowerCase(),
        score: held.points + b.completion + b.set + bonusPoints,
        bonusPoints,
        cardPoints: held.points,
        serialPoints: held.serialPoints,
        completionBonus: b.completion,
        setBonus: b.set,
        complete: b.complete,
        uniqueCards: held.unique.size,
        copies: held.copies,
        variants: held.variants,
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
  collection: Record<string, number[]>;
}> {
  const [packList, collection, settings, serials] = await Promise.all([
    getPacksForSeason(season),
    getCollection(season.collectionName),
    getScoringSettings(),
    loadSerialIndex(season.collectionName),
  ]);
  // A draft pack attached to a published season is never drawn, so nobody can own its cards: counting them would dilute every
  // card's rarity and make a complete collection impossible. (An inactive published pack still counts: its cards can be held.)
  const packs = await Promise.all(packList.filter(p => p.status !== 'draft').map(async pack => ({ pack, cards: await getPackCards(pack.id) })));
  const values = { ...computeSeasonValues(packs, collection, settings, serials), bonus: await getScoreBonuses(season.collectionName) };
  // Viewers an admin has hidden from public rankings are left out of the rows (their cards still count in the season's copy totals).
  const hidden = await getHiddenUsersSafe();
  const rows = buildLeaderboard(values, collection).filter(r => !hidden.has(r.username));
  return { rows, values, packs, collection };
}

type Board = Awaited<ReturnType<typeof getSeasonLeaderboard>>;
const boardCache = createTtlCache<Board>(20_000);

/**
 * The same board, shared for ~20 seconds between everyone looking at the PUBLIC pages (home, leaderboard, stats, card dex), so a
 * burst of visitors costs one computation. Never use it where a viewer has just changed their own cards (their collection, My Stats,
 * upgrades, trades) or in the admin: those call getSeasonLeaderboard directly. The result is shared: treat it as read-only.
 */
export async function getSeasonLeaderboardCached(season: Season): Promise<Board> {
  const box = await currentSandboxId().catch(() => null);
  return boardCache.get(`${box ?? 'prod'}:${season.id}:${season.collectionName}`, () => getSeasonLeaderboard(season));
}

/**
 * The collection the cached board loaded (same entry, same ~20 s), so display-only public pages (home, stats, card dex) do not
 * read the whole blob again. Read-only, and up to 20 s behind a fresh pull. Anything that validates or writes keeps getCollection.
 */
export async function getCollectionCached(season: Season): Promise<Record<string, number[]>> {
  return (await getSeasonLeaderboardCached(season)).collection;
}
