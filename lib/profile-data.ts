import { getActiveSeasonWithPacks, getCollection, getUserProfile } from './kv';
import { getSeasonLeaderboard, getSeasonLeaderboardCached, pointsFor } from './leaderboard';
import { getUserAwards } from './season-wrap';
import { getAvatars, sizeTwitchAvatar } from './avatars';
import { getHiddenUsers } from './user-admin';
import { getUserSettings } from './user-settings-store';
import { hasExperiment, type UserSettings } from './user-settings';
import { countPulls } from './collection';
import { RARITIES } from './rarity';
import { serialMultiplier } from './scoring-core';
import { VARIANTS, allowedVariants, countVariants, decodeEntry, effectiveWeights, emptyCounts, upgradeStep } from './variants';
import { getHoloResolver } from './holo';
import type { GridCard } from '@/app/u/[username]/CollectionGrid';
import type { Card, Pack, Season, UserProfile, Variant } from './types';
import type { VariantCounts } from './variants';
import type { Copy } from './serials-core';
import type { ShareSpec } from './share-image';
import type { LeaderboardRow } from './leaderboard';

// Everything a profile page needs about one viewer in the active season, loaded once and shared by the tabs.

export interface ShowcaseCard { number: number; name: string; imageUrl: string; fullArtImageUrl?: string; stars: number; variant: Variant; points: number }

/** The viewer's `n` most valuable single copies, one per card. */
export function topCopies(allCards: { number: number; name: string; imageUrl: string; fullArtImageUrl?: string; stars: number }[], variantMap: Map<number, VariantCounts>, values: Map<number, { values: Record<Variant, number> }>, n: number): ShowcaseCard[] {
  const out: ShowcaseCard[] = [];
  for (const c of allCards) {
    const counts = variantMap.get(c.number);
    if (!counts) continue;
    let best: { variant: Variant; points: number } | null = null;
    for (const v of VARIANTS) if (counts[v] > 0) { const pts = values.get(c.number)?.values[v] ?? 0; if (!best || pts > best.points) best = { variant: v, points: pts }; }
    if (best) out.push({ number: c.number, name: c.name, imageUrl: c.imageUrl, fullArtImageUrl: c.fullArtImageUrl, stars: c.stars, ...best });
  }
  return out.sort((a, b) => b.points - a.points || a.number - b.number).slice(0, n);
}

/** The "Share image" of a collector: their best cards with serials, rank and progress. */
export function buildShareSpec(b: ProfileBase, copies: Copy[], siteHost: string): ShareSpec {
  const top = topCopies(b.allCards, b.variantMap, b.board.values.cards, 6);
  const art = (c: ShowcaseCard) => ((c.variant === 'full' || c.variant === 'shiny') && c.fullArtImageUrl ? c.fullArtImageUrl : c.imageUrl);
  return {
    title: b.displayName,
    subtitle: `@${b.lower} · ${b.season.name}`,
    stats: [b.rank ? `#${b.rank} rank` : 'Unranked', `${b.row ? Math.round(b.row.score).toLocaleString() : 0} pts`, `${b.uniqueOwned}/${b.total} cards`],
    cards: top.map(c => {
      const lowest = copies.filter(x => x.card === c.number && x.variant === c.variant).sort((a, z) => a.n - z.n)[0];
      return { src: art(c), name: c.name, hex: RARITIES.find(r => r.stars === c.stars)?.hex, tag: [c.variant === 'regular' ? '' : SHORT_VARIANT[c.variant], lowest ? `#${lowest.n}` : ''].filter(Boolean).join(' ') || undefined };
    }),
    footer: siteHost,
  };
}
const SHORT_VARIANT: Record<Variant, string> = { regular: '', reverse: 'RH', full: 'FA', shiny: 'SH' };

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
  settings: UserSettings;       // their own Settings (accent, wanted cards, layout, experiments)
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
    rank: idx >= 0 ? idx + 1 : null, row: idx >= 0 ? board.rows[idx] : null, awards, settings: theirs, bio: theirs.bio, hidden: hiddenSet.has(lower),
    uniqueOwned, total, pct: total > 0 ? Math.round((uniqueOwned / total) * 100) : 0,
    rarity: RARITIES.map(r => {
      const cs = allCards.filter(c => c.stars === r.stars);
      return { stars: r.stars, label: r.label, hex: r.hex, total: cs.length, owned: cs.filter(c => countMap.has(c.number)).length };
    }).filter(r => r.total > 0),
  };
}

/** What this viewer's low serial numbers add to one card, and the best one they hold (for the card dialog). */
function serialFor(b: ProfileBase, cardNumber: number): GridCard['serial'] {
  const { values, } = b.board;
  const entries = b.owned.filter(e => decodeEntry(e).cardNumber === cardNumber);
  const points = pointsFor(values, entries, b.lower).serialPoints;
  let best: number | undefined;
  for (const [e, list] of values.serials?.held.get(b.lower) ?? []) if (decodeEntry(e).cardNumber === cardNumber && list.length) best = Math.min(best ?? Infinity, list[0]);
  return { points, best, mult: serialMultiplier(best, values.settings) };
}

/** The per-card data the collection grid and its detail view need (values come from the season leaderboard maths). */
export async function buildGridCards(b: ProfileBase, copies: Copy[] = []): Promise<GridCard[]> {
  const copiesByCard = new Map<number, GridCard['copies']>();
  for (const c of copies) copiesByCard.set(c.card, [...(copiesByCard.get(c.card) ?? []), { id: c.id, variant: c.variant, n: c.n, ...(c.est ? { est: true } : {}) }]);
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
      serial: serialFor(b, c.number),
      costs: c.pack.upgradeCosts,
      variants: allowedVariants(c.pack, c),
      holo: holoFor(c.pack, c.stars),
      maths: v?.maths,
      copies: copiesByCard.get(c.number),
      steps: Object.fromEntries(VARIANTS.map(x => [x, upgradeStep(c.pack, c, x)])) as GridCard['steps'],
    };
  });
}
