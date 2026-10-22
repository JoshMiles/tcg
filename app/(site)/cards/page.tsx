import { Icon } from '@/app/components/Icon';
import type { Metadata } from 'next';
import { getHoloResolver } from '@/lib/holo';
import { getHiddenUsers } from '@/lib/user-admin';
import Link from 'next/link';
import { getActive, getSeasonOverview, ownersByCard } from '@/lib/site-data';
import { getCollectionCached } from '@/lib/leaderboard';
import { getSession } from '@/lib/session';
import { getAvatars, sizeTwitchAvatar } from '@/lib/avatars';
import { VARIANTS, countVariants, effectiveWeights, emptyCounts } from '@/lib/variants';
import { SITE_URL } from '@/lib/site';
import { getUserSettings } from '@/lib/user-settings-store';
import { CardDex, type DexCard } from './CardDex';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Card Dex' };

/** Chance of each version per pull: the card's pull rate times that version's share of the pack's variant weights. */
function variantOdds(w: Record<(typeof VARIANTS)[number], number>, pullRate: number): DexCard['variantOdds'] {
  const total = VARIANTS.reduce((s, v) => s + Math.max(0, w[v]), 0) || 1;
  return {
    regular: (pullRate * Math.max(0, w.regular)) / total,
    reverse: (pullRate * Math.max(0, w.reverse)) / total,
    full: (pullRate * Math.max(0, w.full)) / total,
    shiny: (pullRate * Math.max(0, w.shiny)) / total,
    golden: (pullRate * Math.max(0, w.golden)) / total,
  };
}

export default async function CardDexPage({ searchParams }: { searchParams: Promise<{ season?: string; card?: string }> }) {
  const { season: seasonParam, card: cardParam } = await searchParams;
  const { season, seasons } = await getActive(seasonParam);

  if (!season) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-20 text-center space-y-2">
        <p className="text-4xl"><Icon name="cards" className="w-10 h-10 text-yellow-400" /></p>
        <h1 className="font-display text-3xl font-bold text-white">No cards yet</h1>
        <p className="text-gray-400 text-sm">The card dex fills up once a season is running.</p>
      </div>
    );
  }

  const overview = await getSeasonOverview(season);
  const collection = await getCollectionCached(season);
  const owners = ownersByCard(collection, overview.values, 10, await getHiddenUsers());
  const avatars = await getAvatars([...new Set([...owners.values()].flatMap(o => o.top.map(t => t.username)))]);

  // Cards the logged-in viewer owns (for the Collected / Missing filter). Only meaningful for the active season.
  const session = await getSession();
  const mine = session ? new Set(countVariants(collection[session.username] ?? []).keys()) : null;
  const prefs = session ? await getUserSettings(session.username) : null;
  const wanted = new Set(prefs?.wanted ?? []);

  const holoFor = await getHoloResolver();
  const cards: DexCard[] = overview.cards
    .map(c => {
      const v = overview.values.cards.get(c.number);
      return {
        id: c.id,
        number: c.number,
        name: c.name,
        imageUrl: c.imageUrl,
        stars: c.stars,
        packName: c.packName,
        pullRate: v?.pullRate ?? 0,
        copies: v?.copies ?? 0,
        upgradable: c.pack.upgradesEnabled && c.upgradesEnabled !== false,
        values: [v?.values.regular ?? 0, v?.values.reverse ?? 0, v?.values.full ?? 0, v?.values.shiny ?? 0, v?.values.golden ?? 0] as DexCard['values'],
        fullArtImageUrl: c.fullArtImageUrl,
        stillUrl: c.stillUrl,
        fullArtStillUrl: c.fullArtStillUrl,
        variantCopies: v?.variantCopies ?? emptyCounts(),
        variantOdds: variantOdds(effectiveWeights(c.pack, c), v?.pullRate ?? 0),
        collectors: owners.get(c.number)?.collectors ?? 0,
        owners: (owners.get(c.number)?.top ?? []).map(o => ({ ...o, avatar: avatars[o.username] ? sizeTwitchAvatar(avatars[o.username], 70) : undefined })),
        owned: mine ? mine.has(c.number) : undefined,
        wanted: session ? wanted.has(c.number) : undefined,
        holo: holoFor(c.pack, c.stars),
        maths: v?.maths,
      };
    })
    .filter(c => c.pullRate > 0);

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 space-y-6">
      <div className="space-y-3">
        <h1 className="font-display text-4xl font-bold text-white"><Icon name="cards" className="mr-2 text-yellow-400" />Card dex</h1>
        <p className="text-sm text-gray-400">
          Every card in {season.name}, with how rare it is and what it&rsquo;s worth. Values shift as more cards are pulled. See{' '}
          <Link href="/faq#points" className="text-yellow-400 hover:text-yellow-300">how points are worked out</Link>.
        </p>
        {seasons.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {seasons.map(x => (
              <Link
                key={x.id}
                href={`/cards?season=${x.id}`}
                className={`px-3 py-1 rounded-full text-xs whitespace-nowrap border transition-colors ${
                  x.id === season.id ? 'bg-yellow-500 text-gray-950 border-yellow-500 font-semibold' : 'text-gray-400 border-gray-700 hover:text-white'
                }`}
              >
                {x.name}
              </Link>
            ))}
          </div>
        )}
      </div>

      {cards.length === 0 ? (
        <p className="text-gray-500 text-sm py-10 text-center">This season has no cards yet.</p>
      ) : (
        <CardDex cards={cards} seasonId={season.id} siteHost={SITE_URL.replace(/^https?:\/\//, '')} signedIn={!!session} compactDefault={prefs?.compactGrids ?? false} showMine={!!session && season.active} initialOpenId={cardParam ? cards.find(c => c.number === Number(cardParam))?.id : undefined} />
      )}
    </div>
  );
}
