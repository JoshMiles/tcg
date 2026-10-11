import type { Variant } from './types';
import { RARITIES } from './rarity';
import { VARIANTS, VARIANT_LABELS, countVariants, emptyCounts, upgradeStep, type VariantCounts } from './variants';
import type { SeasonCard, SeasonOverview } from './site-data';
import { projectUpgradeGain, collectionBonuses } from './leaderboard';

export interface UpgradeOption {
  card: SeasonCard;
  from: Variant;
  to: Variant;
  have: number;
  cost: number;
  /** Projected change to the viewer's score if they did this upgrade now (recomputed with scarcity, so it can be negative). */
  gain: number;
}

export interface UserStats {
  rank: number | null;
  players: number;
  /** Total: card points + the two collection bonuses. */
  score: number;
  cardPoints: number;
  completionBonus: number;
  setBonus: number;
  complete: boolean;
  /** What the bonuses are worth at 100% / when complete, right now (to show what's still on offer). */
  maxCompletionBonus: number;
  completeSetBonusValue: number;
  uniqueCards: number;
  totalCards: number;
  completionPct: number;
  copies: number;
  variants: VariantCounts;
  rarity: { stars: number; label: string; hex: string; owned: number; total: number }[];
  /** The viewer's most valuable single copies. */
  topCopies: { card: SeasonCard; variant: Variant; value: number; count: number }[];
  /** Upgrades they can afford right now, biggest gain first. */
  upgradable: UpgradeOption[];
  /** Cards they don't own a single copy of yet (names withheld: only a count). */
  missing: number;
}

/** Everything the My Stats page shows, derived from the season overview and the viewer's entries. */
export function computeUserStats(
  o: SeasonOverview,
  username: string,
  owned: number[],
  /** Everyone's entries for the season; needed to project upgrade gains. */
  collection: Record<string, number[]>,
): UserStats {
  const byCard = countVariants(owned);
  const idx = o.rows.findIndex(r => r.username === username);
  const row = idx >= 0 ? o.rows[idx] : null;

  const variants = emptyCounts();
  for (const counts of byCard.values()) for (const v of VARIANTS) variants[v] += counts[v];

  const valueOf = (c: SeasonCard, v: Variant) => o.values.cards.get(c.number)?.values[v] ?? 0;

  // Cards grouped back into their packs, for re-running the value maths on a hypothetical collection.
  const packs = [...new Map(o.cards.map(c => [c.pack.id, c.pack])).values()]
    .map(pack => ({ pack, cards: o.cards.filter(c => c.pack.id === pack.id) }));

  const topCopies: UserStats['topCopies'] = [];
  const upgradable: UpgradeOption[] = [];
  for (const card of o.cards) {
    const counts = byCard.get(card.number);
    if (!counts) continue;
    for (const v of VARIANTS) {
      if (counts[v] > 0) topCopies.push({ card, variant: v, value: valueOf(card, v), count: counts[v] });
      if (!card.pack.upgradesEnabled || card.upgradesEnabled === false) continue;
      const step = upgradeStep(card.pack, card, v);
      if (!step) continue;
      const { to, cost } = step;
      if (counts[v] >= cost) {
        upgradable.push({
          card, from: v, to, have: counts[v], cost,
          gain: projectUpgradeGain(packs, collection, username, card.number, v, to, cost, o.values.settings) ?? valueOf(card, to) - cost * valueOf(card, v),
        });
      }
    }
  }
  topCopies.sort((a, b) => b.value - a.value);
  upgradable.sort((a, b) => b.gain - a.gain);

  const total = o.cards.length;
  const unique = byCard.size;
  return {
    rank: idx >= 0 ? idx + 1 : null,
    players: o.rows.length,
    score: row?.score ?? 0,
    cardPoints: row?.cardPoints ?? 0,
    completionBonus: row?.completionBonus ?? 0,
    setBonus: row?.setBonus ?? 0,
    complete: row?.complete ?? false,
    maxCompletionBonus: collectionBonuses(o.values, o.values.totalCards).completion,
    completeSetBonusValue: collectionBonuses(o.values, o.values.totalCards).set,
    uniqueCards: unique,
    totalCards: total,
    completionPct: total > 0 ? Math.round((unique / total) * 100) : 0,
    copies: owned.length,
    variants,
    rarity: RARITIES.map(r => {
      const tier = o.cards.filter(c => c.stars === r.stars);
      return { stars: r.stars, label: r.label, hex: r.hex, total: tier.length, owned: tier.filter(c => byCard.has(c.number)).length };
    }).filter(r => r.total > 0),
    topCopies: topCopies.slice(0, 5),
    upgradable,
    missing: total - unique,
  };
}

export { VARIANT_LABELS };
