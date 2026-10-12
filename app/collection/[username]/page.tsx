import Link from 'next/link';
import { Icon } from '@/app/components/Icon';
import { notFound } from 'next/navigation';
import { getHoloResolver } from '@/lib/holo';
import {
  getActiveSeasonWithPacks,
  getCollection,
  getUserProfile,
} from '@/lib/kv';
import { RARITIES } from '@/lib/rarity';
import { countPulls } from '@/lib/collection';
import { VARIANTS, allowedVariants, countVariants, effectiveWeights, emptyCounts, upgradeStep } from '@/lib/variants';
import { getSeasonLeaderboard } from '@/lib/leaderboard';
import { getUserAwards } from '@/lib/season-wrap';
import { getSession } from '@/lib/session';
import { sweepTrades } from '@/lib/trades';
import { CollectionGrid, type GridCard } from './CollectionGrid';
import { Avatar } from '@/app/components/Avatar';
import { getAvatars, sizeTwitchAvatar } from '@/lib/avatars';

export const dynamic = 'force-dynamic';

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const lower = username.toLowerCase();
  // Viewing your own collection while logged in unlocks upgrades in the card details.
  const session = await getSession();
  await sweepTrades(); // hand back copies from offers that have run out of time
  const isOwner = session?.username === lower;

  const [result, profile] = await Promise.all([
    getActiveSeasonWithPacks(),
    getUserProfile(lower),
  ]);

  const displayName = profile?.displayName || username;
  const avatarUrl = (await getAvatars([lower]))[lower];

  if (!result) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center text-center p-8">
        <div className="space-y-3">
          <div className="text-4xl"><Icon name="cards" className="w-10 h-10 text-yellow-400" /></div>
          <h1 className="text-xl font-bold text-white">No active season</h1>
          <p className="text-gray-500 text-sm">Check back when a season is running!</p>
        </div>
      </div>
    );
  }

  const { season, packs } = result;
  const allCards = packs
    .flatMap(({ pack, cards }) => cards.map(c => ({ ...c, packName: pack.name, pack })))
    .sort((a, b) => b.stars - a.stars || a.number - b.number);

  const collection = await getCollection(season.collectionName);
  const ownedArray = collection[lower] ?? [];
  const countMap = countPulls(ownedArray);
  const variantMap = countVariants(ownedArray);
  const board = await getSeasonLeaderboard(season);
  const awards = await getUserAwards(lower).catch(() => []);
  const myRank = board.rows.findIndex(r => r.username === lower);
  const myRow = myRank >= 0 ? board.rows[myRank] : null;

  // Per-card data for the grid + the click-to-expand detail (values come from the season leaderboard maths).
  const holoFor = await getHoloResolver();
  const gridCards: GridCard[] = allCards.map(c => {
    const v = board.values.cards.get(c.number);
    const w = effectiveWeights(c.pack, c);
    const wTotal = VARIANTS.reduce((s, k) => s + Math.max(0, w[k]), 0) || 1;
    const pullRate = v?.pullRate ?? 0;
    return {
      id: c.id,
      number: c.number,
      name: c.name,
      imageUrl: c.imageUrl,
      fullArtImageUrl: c.fullArtImageUrl,
      stars: c.stars,
      packName: c.packName,
      upgradable: c.pack.upgradesEnabled && c.upgradesEnabled !== false,
      pullRate,
      variantOdds: {
        regular: pullRate * Math.max(0, w.regular) / wTotal,
        reverse: pullRate * Math.max(0, w.reverse) / wTotal,
        full: pullRate * Math.max(0, w.full) / wTotal,
        shiny: pullRate * Math.max(0, w.shiny) / wTotal,
      },
      counts: variantMap.get(c.number) ?? emptyCounts(),
      values: v?.values ?? { regular: 0, reverse: 0, full: 0, shiny: 0 },
      variantCopies: v?.variantCopies ?? emptyCounts(),
      scarcity: v?.scarcity ?? { regular: 1, reverse: 1, full: 1, shiny: 1 },
      costs: c.pack.upgradeCosts,
      variants: allowedVariants(c.pack, c),
      holo: holoFor(c.pack, c.stars),
      maths: v?.maths,
      steps: Object.fromEntries(VARIANTS.map(v => [v, upgradeStep(c.pack, c, v)])) as GridCard['steps'],
    };
  });
  const leaderboardHref = `/leaderboard/${season.id}`;

  const totalPulls = ownedArray.length;
  const owned = allCards.filter(c => countMap.has(c.number));
  const total = allCards.length;
  const pct = total > 0 ? Math.round(owned.length / total * 100) : 0;

  // Group by rarity for the breakdown
  const rarityBreakdown = RARITIES.map(r => {
    const rarityCards = allCards.filter(c => c.stars === r.stars);
    const rarityOwned = rarityCards.filter(c => countMap.has(c.number));
    return { ...r, total: rarityCards.length, owned: rarityOwned.length };
  }).filter(r => r.total > 0);

  return (
    <div className="min-h-screen text-gray-100">
      {/* Header */}
      <div className="border-b border-poke-blue-light/20 bg-gray-950/70 backdrop-blur">
        <div className="holo-strip" />
        <div className="max-w-4xl mx-auto px-4 py-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Avatar src={avatarUrl && sizeTwitchAvatar(avatarUrl, 150)} name={displayName} className="w-11 h-11 text-lg ring-2 ring-yellow-500/60" />
            <div>
              <h1 className="font-bold text-white text-2xl leading-none">
                {displayName}
                {myRow?.complete && (
                  <span
                    className="ml-2 align-middle text-[10px] font-extrabold uppercase tracking-wider text-gray-950 bg-yellow-400 rounded-full px-2 py-0.5"
                    title="Owns every card in the season"
                  >
                    <Icon name="cheese" className="mr-1" />Complete collection
                  </span>
                )}
              </h1>
              {profile?.twitchId && (
                <p className="text-xs text-purple-400 mt-0.5">Twitch: {profile.twitchId}</p>
              )}
              {awards.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Season awards">
                  {awards.slice(0, 8).map((a, i) => (
                    <li key={`${a.seasonId}-${a.award.id}-${i}`}>
                      <Link href={`/leaderboard/${a.seasonId}`} title={`${a.award.title} · ${a.seasonName} · ${a.award.detail}`} className="inline-flex items-center gap-1 rounded-full border border-yellow-500/40 bg-yellow-500/10 px-2.5 py-0.5 text-[11px] font-bold text-yellow-300 hover:bg-yellow-500/20 transition-colors">
                        <Icon name={a.award.icon} className="w-3 h-3" />{a.award.title}<span className="text-yellow-500/70 font-semibold">· {a.seasonName}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="font-display text-4xl font-bold text-yellow-400 tabular-nums leading-none">{pct}%</p>
            <p className="text-xs text-gray-500">
              {owned.length}/{total} cards · {season.name}
            </p>
            {totalPulls > owned.length && (
              <p className="text-xs text-gray-600">{totalPulls} total pulls</p>
            )}
            <a
              href={leaderboardHref}
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-yellow-300 bg-yellow-500/10 border border-yellow-500/40 hover:bg-yellow-500/20 rounded-full px-3 py-1 transition-colors"
            >
              <Icon name="trophy" className="mr-1" />{myRow ? `#${myRank + 1} · ${myRow.score.toLocaleString()} pts · ` : ''}Full leaderboard →
            </a>
            {session && !isOwner && (
              <a
                href={`/trade/new?to=${encodeURIComponent(lower)}`}
                className="mt-2 ml-2 inline-flex items-center gap-1.5 text-xs font-bold text-purple-300 bg-purple-500/10 border border-purple-400/40 hover:bg-purple-500/20 rounded-full px-3 py-1 transition-colors"
              >
                <Icon name="trade" className="mr-1" />Trade with {displayName}
              </a>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="max-w-4xl mx-auto px-4 pb-4">
          <div className="h-3 bg-gray-950 border border-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-yellow-300 to-yellow-600 rounded-full transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Rarity breakdown */}
        {rarityBreakdown.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {rarityBreakdown.map(r => (
              <div
                key={r.stars}
                className="tcg-panel rounded-xl p-3 text-center"
              >
                <p className="text-xs font-medium mb-1" style={{ color: r.hex }}>
                  {'★'.repeat(r.stars)}
                </p>
                <p className="text-lg font-bold text-white tabular-nums">{r.owned}/{r.total}</p>
                <p className="text-xs text-gray-600">{r.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Card grid — click a collected card for its details and current value */}
        {allCards.length === 0 ? (
          <div className="text-center py-16 text-gray-600">
            No cards in this season yet.
          </div>
        ) : (
          <CollectionGrid cards={gridCards} totalScore={myRow?.cardPoints ?? 0} leaderboardHref={leaderboardHref} canUpgrade={isOwner} ownerName={displayName} tradeWith={session && !isOwner ? lower : undefined} />
        )}

        <p className="text-center text-xs text-gray-700 pt-2">
          <a href={leaderboardHref} className="text-yellow-600 hover:text-yellow-400 transition-colors">View the full leaderboard →</a>
          {' · '}
          Pull cards live on stream · <a href="/collection" className="hover:text-gray-500 transition-colors">view another collection →</a>
        </p>
      </div>
    </div>
  );
}
