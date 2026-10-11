import type { Metadata } from 'next';
import Link from 'next/link';
import { getActive, getSeasonOverview } from '@/lib/site-data';
import { CardDex, type DexCard } from './CardDex';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Card Dex' };

export default async function CardDexPage({ searchParams }: { searchParams: Promise<{ season?: string }> }) {
  const { season: seasonParam } = await searchParams;
  const { season, seasons } = await getActive(seasonParam);

  if (!season) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-20 text-center space-y-2">
        <p className="text-4xl">🃏</p>
        <h1 className="font-display text-3xl font-bold text-white">No cards yet</h1>
        <p className="text-gray-400 text-sm">The card dex fills up once a season is running.</p>
      </div>
    );
  }

  const overview = await getSeasonOverview(season);
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
        values: [v?.values.regular ?? 0, v?.values.reverse ?? 0, v?.values.full ?? 0, v?.values.shiny ?? 0] as DexCard['values'],
      };
    })
    .filter(c => c.pullRate > 0);

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 space-y-6">
      <div className="space-y-3">
        <h1 className="font-display text-4xl font-bold text-white">🃏 Card dex</h1>
        <p className="text-sm text-gray-400">
          Every card in {season.name}, with how rare it is and what it&rsquo;s worth. Values shift as more cards are pulled — see{' '}
          <Link href={`/leaderboard/${season.id}?how=1`} className="text-yellow-400 hover:text-yellow-300">how points are worked out</Link>.
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
        <CardDex cards={cards} />
      )}
    </div>
  );
}
