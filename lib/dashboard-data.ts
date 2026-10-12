import { kv } from './db';
import { getCollection } from './kv';
import type { Card, Pack, Season } from './types';
import { DEFAULT_LAYOUT, sanitizeLayout, type DashboardLayout, type WidgetType } from './dashboard';
import { uniqueCount } from './collection';
import { rarityStats } from './rarity';
import { getAvatars } from './avatars';
import { getActivity, type ActivityEvent } from './activity';
import { getSeasonLeaderboard, type LeaderboardRow, type SeasonValues } from './leaderboard';
import { listOpenTrades, tradeHistory } from './trades';
import type { Trade } from './trade-core';
import { getLiveStatus, type LiveStatus } from './twitch-live';
import { decodeEntry, emptyCounts, type VariantCounts } from './variants';

// Server side of the admin dashboard: where the layout and notes are stored, and the numbers the widgets show.
// Only what the widgets in the saved layout need is computed (the leaderboard, activity log, trades and live status cost
// extra reads), so a trimmed-down dashboard is a cheaper one.

const LAYOUT_KEY = 'admin:dashboard';
const NOTES_KEY = 'admin:dashboard:notes';

export async function getDashboardLayout(): Promise<DashboardLayout> {
  try {
    const stored = await kv.get<DashboardLayout>(LAYOUT_KEY);
    return stored ? sanitizeLayout(stored) : DEFAULT_LAYOUT;
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export async function saveDashboardLayout(layout: DashboardLayout): Promise<void> {
  await kv.set(LAYOUT_KEY, sanitizeLayout(layout));
}

export async function resetDashboardLayout(): Promise<void> {
  await kv.del(LAYOUT_KEY);
}

export async function getDashboardNotes(): Promise<string> {
  try { return (await kv.get<string>(NOTES_KEY)) ?? ''; } catch { return ''; }
}

export async function saveDashboardNotes(text: string): Promise<void> {
  await kv.set(NOTES_KEY, text.slice(0, 4000));
}

export interface DashboardData {
  season: Season;
  packs: { pack: Pack; cards: Card[] }[];
  allCards: Card[];
  users: [string, number[]][];
  totalUsers: number;
  totalOwned: number;
  totalUnique: number;
  avgCompletion: number;
  topCollectors: { username: string; owned: number; pct: number }[];
  cardStats: (Card & { ownedBy: number })[];
  avatars: Record<string, string | undefined>;
  rarityDist: ReturnType<typeof rarityStats>;
  variantCounts: VariantCounts;
  activity: ActivityEvent[];
  trades: { open: Trade[]; recent: Trade[]; escrowedCopies: number; completed24h: number } | null;
  board: { rows: LeaderboardRow[]; values: SeasonValues } | null;
  live: LiveStatus | null;
  notes: string;
}

export async function loadDashboardData(season: Season, packs: { pack: Pack; cards: Card[] }[], needs: Set<WidgetType>): Promise<DashboardData> {
  const allCards = packs.flatMap(p => p.cards);
  const collection = await getCollection(season.collectionName);
  const users = Object.entries(collection);
  const totalUsers = users.length;
  const totalOwned = users.reduce((s, [, c]) => s + c.length, 0);
  const totalUnique = users.reduce((s, [, c]) => s + uniqueCount(c), 0);
  const avgCompletion = totalUsers > 0 && allCards.length > 0 ? Math.round((totalUnique / totalUsers / allCards.length) * 100) : 0;

  const freq: Record<number, number> = {};
  const variantCounts = emptyCounts();
  for (const [, owned] of users) {
    const seen = new Set<number>();
    for (const entry of owned) {
      const { cardNumber, variant } = decodeEntry(entry);
      seen.add(cardNumber);
      variantCounts[variant]++;
    }
    seen.forEach(n => { freq[n] = (freq[n] ?? 0) + 1; });
  }

  const topCollectors = users
    .map(([username, owned]) => ({
      username,
      owned: uniqueCount(owned),
      pct: allCards.length > 0 ? Math.round((uniqueCount(owned) / allCards.length) * 100) : 0,
    }))
    .sort((a, b) => b.owned - a.owned)
    .slice(0, 8);
  const cardStats = allCards.map(c => ({ ...c, ownedBy: freq[c.number] ?? 0 })).sort((a, b) => b.stars - a.stars || b.ownedBy - a.ownedBy);

  const wantsActivity = needs.has('activity') || needs.has('pulse');
  const [avatars, activity, openTrades, history, board, live, notes] = await Promise.all([
    needs.has('top-collectors') || needs.has('leaderboard') ? getAvatars(topCollectors.map(c => c.username)) : Promise.resolve({}),
    wantsActivity ? getActivity({ limit: 500 }).then(r => r.events).catch(() => []) : Promise.resolve([] as ActivityEvent[]),
    needs.has('trades') ? listOpenTrades().catch(() => [] as Trade[]) : Promise.resolve(null),
    needs.has('trades') ? tradeHistory().catch(() => [] as Trade[]) : Promise.resolve(null),
    needs.has('leaderboard') || needs.has('valuable') ? getSeasonLeaderboard(season).catch(() => null) : Promise.resolve(null),
    needs.has('live') ? getLiveStatus().catch(() => null) : Promise.resolve(null),
    needs.has('notes') ? getDashboardNotes() : Promise.resolve(''),
  ]);

  const trades = openTrades && history
    ? {
        open: openTrades,
        recent: history.slice(0, 6),
        escrowedCopies: openTrades.filter(t => t.escrowed).reduce((n, t) => n + t.give.reduce((m, i) => m + i.count, 0), 0),
        completed24h: history.filter(t => t.status === 'accepted' && (t.resolvedAt ?? 0) > Date.now() - 86_400_000).length,
      }
    : null;

  return {
    season, packs, allCards, users, totalUsers, totalOwned, totalUnique, avgCompletion, topCollectors, cardStats,
    avatars: avatars as Record<string, string | undefined>,
    rarityDist: rarityStats(allCards),
    variantCounts, activity, trades, board: board ? { rows: board.rows, values: board.values } : null, live, notes,
  };
}
