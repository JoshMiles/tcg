import { getActiveSeasonWithPacks, getCollection, getUserProfile } from './kv';
import { getSeasonLeaderboard, getSeasonLeaderboardCached } from './leaderboard';
import { getUserAwards } from './season-wrap';
import { getAvatars, sizeTwitchAvatar } from './avatars';
import { getHiddenUsers } from './user-admin';
import { getUserSettings } from './user-settings-store';
import { countPulls } from './collection';
import { RARITIES } from './rarity';
import { VARIANTS, allowedVariants, countVariants, effectiveWeights, emptyCounts, upgradeStep } from './variants';
import { getHoloResolver } from './holo';
import type { GridCard } from '@/app/u/[username]/CollectionGrid';
import type { Card, Pack, Season, UserProfile } from './types';
import type { LeaderboardRow } from './leaderboard';

// Everything a profile page needs about one viewer in the active season, loaded once and shared by the tabs.

export interface ProfileBase {
  lower: string;
  displayName: string;
  profile: UserProfile | null;
  avatarUrl?: string;
  season: Season;
  packs: { pack: Pack; cards: Card[] }[];
  allCards: (Card & { packName: string; pack: Pack })[];
  collection: Record<string, number[]>;
  owned: number[];
  countMap: Map<number, number>;
  variantMap: ReturnType<typeof countVariants>;
  board: Awaited<ReturnType<typeof getSeasonLeaderboard>>;
  rank: number | null;          // 1-based
  row: LeaderboardRow | null;
  awards: Awaited<ReturnType<typeof getUserAwards>>;
  bio: string;                  // the line they wrote in Settings
  hidden: boolean;              // an admin hid them from public boards (their page still works, but no activity feed)
  uniqueOwned: number;
  total: number;
  pct: number;
  rarity: { stars: number; label: string; hex: string; total: number; owned: number }[];
}

/**
 * `fresh: true` (the owner looking at their own profile) skips the shared 20 s leaderboard so an upgrade they just made shows
 * immediately; everyone else gets the shared one.
 */
export async function loadProfileBase(lower: string, fresh: boolean): Promise<ProfileBase | null> {
  const [result, profile, hiddenSet, theirs] = await Promise.all([getActiveSeasonWithPacks(), getUserProfile(lower), getHiddenUsers().catch(() => new Set<string>()), getUserSettings(lower)]);
  if (!result) return null;
  const { season, packs } = result;
  const [avatars, collection, board, awards] = await Promise.all([
    getAvatars([lower]),
    getCollection(season.collectionName),
    fresh ? getSeasonLeaderboard(season) : getSeasonLeaderboardCached(season),
    getUserAwards(lower).catch(() => []),
  ]);
  const allCards = packs.flatMap(({ pack, cards }) => cards.map(c => ({ ...c, packName: pack.name, pack }))).sort((a, b) => b.stars - a.stars || a.number - b.number);
  const owned = collection[lower] ?? [];
  const countMap = countPulls(owned);
  const idx = board.rows.findIndex(r => r.username === lower);
  const uniqueOwned = allCards.filter(c => countMap.has(c.number)).length;
  const total = allCards.length;
  return {
    lower, displayName: profile?.displayName || lower, profile, avatarUrl: avatars[lower] ? sizeTwitchAvatar(avatars[lower], 150) : undefined,
    season, packs, allCards, collection, owned, countMap, variantMap: countVariants(owned), board,
    rank: idx >= 0 ? idx + 1 : null, row: idx >= 0 ? board.rows[idx] : null, awards, bio: theirs.bio, hidden: hiddenSet.has(lower),
    uniqueOwned, total, pct: total > 0 ? Math.round((uniqueOwned / total) * 100) : 0,
    rarity: RARITIES.map(r => {
      const cs = allCards.filter(c => c.stars === r.stars);
      return { stars: r.stars, label: r.label, hex: r.hex, total: cs.length, owned: cs.filter(c => countMap.has(c.number)).length };
    }).filter(r => r.total > 0),
  };
}

/** The per-card data the collection grid and its detail view need (values come from the season leaderboard maths). */
export async function buildGridCards(b: ProfileBase): Promise<GridCard[]> {
  const holoFor = await getHoloResolver();
  return b.allCards.map(c => {
    const v = b.board.values.cards.get(c.number);
    const w = effectiveWeights(c.pack, c);
    const wTotal = VARIANTS.reduce((s, k) => s + Math.max(0, w[k]), 0) || 1;
    const pullRate = v?.pullRate ?? 0;
    return {
      id: c.id, number: c.number, name: c.name, imageUrl: c.imageUrl, fullArtImageUrl: c.fullArtImageUrl, stars: c.stars, packName: c.packName,
      upgradable: c.pack.upgradesEnabled && c.upgradesEnabled !== false,
      pullRate,
      variantOdds: {
        regular: pullRate * Math.max(0, w.regular) / wTotal, reverse: pullRate * Math.max(0, w.reverse) / wTotal,
        full: pullRate * Math.max(0, w.full) / wTotal, shiny: pullRate * Math.max(0, w.shiny) / wTotal,
      },
      counts: b.variantMap.get(c.number) ?? emptyCounts(),
      values: v?.values ?? { regular: 0, reverse: 0, full: 0, shiny: 0 },
      variantCopies: v?.variantCopies ?? emptyCounts(),
      scarcity: v?.scarcity ?? { regular: 1, reverse: 1, full: 1, shiny: 1 },
      costs: c.pack.upgradeCosts,
      variants: allowedVariants(c.pack, c),
      holo: holoFor(c.pack, c.stars),
      maths: v?.maths,
      steps: Object.fromEntries(VARIANTS.map(x => [x, upgradeStep(c.pack, c, x)])) as GridCard['steps'],
    };
  });
}
