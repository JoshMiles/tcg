import type { Card, Pack, Season, Variant } from './types';
import { getActive, listSeasons } from './site-seasons';
import { getSeasonLeaderboard, getSeasonLeaderboardCached, pointsFor, type CardValue, type LeaderboardRow, type SeasonValues } from './leaderboard';
import { getActivity, type ActivityEvent } from './activity';
import { getHiddenUsers } from './user-admin';
import { RARITIES } from './rarity';
import { VARIANTS, countVariants, decodeEntry, emptyCounts, type VariantCounts } from './variants';

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

/** One season's cards (with their pack) and leaderboard. The shared input for home, stats and card dex. */
export async function getSeasonOverview(season: Season): Promise<SeasonOverview> {
  const { rows, values, packs } = await getSeasonLeaderboardCached(season);
  const cards = packs.flatMap(({ pack, cards }) => cards.map(c => ({ ...c, packName: pack.name, pack })));
  return { season, rows, values, cards };
}

/** A card that arrived in a season's collection by a pull or as a grant (an admin gift or the grant webhook). */
export type CardArrival = Extract<ActivityEvent, { type: 'pull' | 'grant' }>;

/**
 * The newest cards to arrive in a season, pulls and grants together, newest first; collectors an admin hid are left out. Reads the
 * newest 100 log entries and, only when those hold fewer than `limit` arrivals, the whole log (capped at 500): a stretch of
 * triggers, collections shown and trades can fill a shorter window, which used to leave the home feed empty although pulls had
 * happened.
 */
export async function getRecentCardArrivals(collectionName: string, limit = 10): Promise<CardArrival[]> {
  const hidden = getHiddenUsers(); // memoised per request; started now so it runs alongside the log read
  let arrivals: CardArrival[] = [];
  for (const window of [100, 500]) {
    const [{ events }, hiddenUsers] = await Promise.all([getActivity({ limit: window }), hidden]);
    arrivals = events.filter((e): e is CardArrival => (e.type === 'pull' || e.type === 'grant') && e.collectionName === collectionName && !hiddenUsers.has(e.username));
    if (arrivals.length >= limit || events.length < window) break; // enough found, or the log has nothing older to read
  }
  return arrivals.slice(0, limit);
}

// ── Who owns each card ─────────────────────────────────────

export interface CardOwner {
  username: string;
  /** Copies of this card across all versions. */
  copies: number;
  variants: VariantCounts;
  /** What those copies are worth right now. */
  points: number;
}

/**
 * For every card: its biggest collectors (most copies first, then most points) and how many collectors own at least one.
 * Built in one pass over the season's collection.
 */
export function ownersByCard(
  collection: Record<string, number[]>,
  values: SeasonValues,
  limit = 10,
  hidden: Set<string> = new Set(),
): Map<number, { top: CardOwner[]; collectors: number }> {
  const lists = new Map<number, CardOwner[]>();
  for (const [username, entries] of Object.entries(collection)) {
    if (hidden.has(username.toLowerCase())) continue; // an admin hid this viewer from public lists
    const byCard = new Map<number, number[]>();
    for (const e of entries) { const n = decodeEntry(e).cardNumber; byCard.set(n, [...(byCard.get(n) ?? []), e]); }
    for (const [cardNumber, counts] of countVariants(entries)) {
      const cv = values.cards.get(cardNumber);
      if (!cv) continue; // card since removed from the season
      const copies = VARIANTS.reduce((s, v) => s + counts[v], 0);
      // The points of these copies, serial bonuses included (the same maths as the leaderboard).
      const points = pointsFor(values, byCard.get(cardNumber) ?? [], username).points;
      const list = lists.get(cardNumber) ?? [];
      list.push({ username: username.toLowerCase(), copies, variants: counts, points });
      lists.set(cardNumber, list);
    }
  }
  const out = new Map<number, { top: CardOwner[]; collectors: number }>();
  for (const [n, list] of lists) {
    list.sort((a, b) => b.copies - a.copies || b.points - a.points || a.username.localeCompare(b.username));
    out.set(n, { top: list.slice(0, limit), collectors: list.length });
  }
  return out;
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
