import type { Card, Pack, Season, Variant } from './types';
import { getActive, listSeasons } from './site-seasons';
import { getSeasonLeaderboard, type CardValue, type LeaderboardRow } from './leaderboard';
import { getActivity, type ActivityEvent } from './activity';
import { RARITIES } from './rarity';
import { VARIANTS, emptyCounts, type VariantCounts } from './variants';

export { getActive, listSeasons };

/** "just now", "5m ago", "3h ago", "2d ago". */
export function timeAgo(at: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export type SeasonCard = Card & { packName: string; pack: Pack };

export interface SeasonOverview {
  season: Season;
  rows: LeaderboardRow[];
  values: Awaited<ReturnType<typeof getSeasonLeaderboard>>['values'];
  cards: SeasonCard[];
}

/** One season's cards (with their pack) and leaderboard — the shared input for home, stats and card dex. */
export async function getSeasonOverview(season: Season): Promise<SeasonOverview> {
  const { rows, values, packs } = await getSeasonLeaderboard(season);
  const cards = packs.flatMap(({ pack, cards }) => cards.map(c => ({ ...c, packName: pack.name, pack })));
  return { season, rows, values, cards };
}

/** Most recent pulls in a season, newest first. */
export async function getRecentPulls(collectionName: string, limit = 10): Promise<Extract<ActivityEvent, { type: 'pull' }>[]> {
  const { events } = await getActivity({ limit: 150 });
  return events
    .filter((e): e is Extract<ActivityEvent, { type: 'pull' }> => e.type === 'pull' && e.collectionName === collectionName)
    .slice(0, limit);
}

// ── Season stats ──────────────────────────────────────────

export interface SeasonStats {
  collectors: number;
  totalCopies: number;
  totalCards: number;
  cardsPulled: number;          // distinct cards with at least one copy out there
  avgCompletionPct: number;
  totalScore: number;
  topScore: number;
  variantCopies: VariantCounts;
  rarity: { stars: number; label: string; hex: string; cards: number; copies: number }[];
  mostPulled: { card: SeasonCard; copies: number }[];
  leastPulled: { card: SeasonCard; copies: number }[];
  upgradesOn: boolean;
}

export function computeStats(o: SeasonOverview): SeasonStats {
  const copiesOf = (c: Card) => o.values.cards.get(c.number)?.copies ?? 0;

  const variantCopies = emptyCounts();
  let totalScore = 0;
  let uniqueSum = 0;
  for (const r of o.rows) {
    totalScore += r.score;
    uniqueSum += r.uniqueCards;
    for (const v of VARIANTS) variantCopies[v as Variant] += r.variants[v];
  }
  const totalCards = o.cards.length;

  const byCopies = [...o.cards].sort((a, b) => copiesOf(b) - copiesOf(a) || a.number - b.number);
  return {
    collectors: o.rows.length,
    totalCopies: o.rows.reduce((s, r) => s + r.copies, 0),
    totalCards,
    cardsPulled: o.cards.filter(c => copiesOf(c) > 0).length,
    avgCompletionPct: o.rows.length > 0 && totalCards > 0 ? Math.round((uniqueSum / o.rows.length / totalCards) * 100) : 0,
    totalScore,
    topScore: o.rows[0]?.score ?? 0,
    variantCopies,
    rarity: RARITIES.map(r => {
      const tier = o.cards.filter(c => c.stars === r.stars);
      return { stars: r.stars, label: r.label, hex: r.hex, cards: tier.length, copies: tier.reduce((s, c) => s + copiesOf(c), 0) };
    }).filter(r => r.cards > 0),
    mostPulled: byCopies.slice(0, 5).map(card => ({ card, copies: copiesOf(card) })),
    leastPulled: [...byCopies].reverse().slice(0, 5).map(card => ({ card, copies: copiesOf(card) })),
    upgradesOn: o.cards.some(c => c.pack.upgradesEnabled),
  };
}

export type { CardValue };
