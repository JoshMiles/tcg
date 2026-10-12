import { Icon } from '@/app/components/Icon';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getActive, getSeasonOverview, computeStats } from '@/lib/site-data';
import { VARIANTS, VARIANT_LABELS } from '@/lib/variants';
import { cardThumbUrl } from '@/lib/card-art';
import { getRarity } from '@/lib/rarity';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Season Stats' };

export default async function StatsPage({ searchParams }: { searchParams: Promise<{ season?: string }> }) {
  const { season: seasonParam } = await searchParams;
  const { season, seasons } = await getActive(seasonParam);

  if (!season) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-20 text-center space-y-2">
        <p className="text-4xl"><Icon name="chart" className="w-10 h-10 text-yellow-400" /></p>
        <h1 className="font-display text-3xl font-bold text-white">No seasons yet</h1>
        <p className="text-gray-400 text-sm">Stats appear once a season is running.</p>
      </div>
    );
  }

  const overview = await getSeasonOverview(season);
  const s = computeStats(overview);
  const maxRarityCopies = Math.max(1, ...s.rarity.map(r => r.copies));

  const tiles = [
    { label: 'Collectors', value: s.collectors.toLocaleString(), sub: 'on the board' },
    { label: 'Cards out there', value: s.totalCopies.toLocaleString(), sub: 'total copies pulled' },
    { label: 'Discovered', value: `${s.cardsPulled}/${s.totalCards}`, sub: 'distinct cards pulled' },
    { label: 'Avg. completion', value: `${s.avgCompletionPct}%`, sub: 'of the set per collector' },
    { label: 'Points in play', value: s.totalScore.toLocaleString(), sub: 'across every collection' },
    { label: 'Top score', value: s.topScore.toLocaleString(), sub: overview.rows[0] ? `by ${overview.rows[0].username}` : '—' },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 space-y-8">
      <div className="space-y-3">
        <h1 className="font-display text-4xl font-bold text-white"><Icon name="chart" className="mr-2 text-yellow-400" />Season stats</h1>
        <p className="text-sm text-gray-400">{season.name}{season.active ? ' · live' : ''}</p>
        {seasons.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {seasons.map(x => (
              <Link
                key={x.id}
                href={`/stats?season=${x.id}`}
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

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        {tiles.map(t => (
          <div key={t.label} className="rind rounded-xl p-4 space-y-0.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{t.label}</p>
            <p className="font-display text-3xl font-bold text-white tabular-nums">{t.value}</p>
            <p className="text-xs text-gray-500">{t.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Rarity */}
        <section className="rind rounded-2xl p-5 space-y-4">
          <h2 className="font-display text-xl font-bold text-white">Pulls by rarity</h2>
          {s.rarity.map(r => (
            <div key={r.stars} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span style={{ color: r.hex }} className="font-semibold">{'★'.repeat(r.stars)} {r.label}</span>
                <span className="text-gray-500 tabular-nums">{r.copies.toLocaleString()} copies · {r.cards} card{r.cards === 1 ? '' : 's'}</span>
              </div>
              <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${(r.copies / maxRarityCopies) * 100}%`, backgroundColor: r.hex }} />
              </div>
            </div>
          ))}
        </section>

        {/* Variants */}
        <section className="rind rounded-2xl p-5 space-y-4">
          <h2 className="font-display text-xl font-bold text-white">Variants</h2>
          {s.upgradesOn ? (
            <div className="grid grid-cols-2 gap-3">
              {VARIANTS.map(v => (
                <div key={v} className="rounded-xl bg-gray-950/50 border border-gray-800 p-3">
                  <p className="text-xs text-gray-500">{VARIANT_LABELS[v]}</p>
                  <p className="font-display text-2xl font-bold text-white tabular-nums">{s.variantCopies[v].toLocaleString()}</p>
                  <p className="text-[11px] text-gray-600">
                    {s.totalCopies > 0 ? `${((s.variantCopies[v] / s.totalCopies) * 100).toFixed(1)}% of all copies` : '—'}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">This season has a single version of every card.</p>
          )}
        </section>

        <CardList title="Most pulled" items={s.mostPulled} />
        <CardList title="Least pulled" items={s.leastPulled} />
      </div>
    </div>
  );
}

function CardList({ title, items }: { title: string; items: { card: { id: string; number: number; name: string; imageUrl: string; stars: number }; copies: number }[] }) {
  return (
    <section className="rind rounded-2xl p-5 space-y-3">
      <h2 className="font-display text-xl font-bold text-white">{title}</h2>
      {items.length === 0 ? <p className="text-sm text-gray-500">No cards yet.</p> : (
        <ul className="divide-y divide-gray-800/70">
          {items.map(({ card, copies }) => {
            const rarity = getRarity(card.stars);
            return (
              <li key={card.id} className="py-2 flex items-center gap-3">
                {card.imageUrl ? (
                  <img src={cardThumbUrl(card.imageUrl)} alt="" loading="lazy" className="w-8 h-11 object-cover rounded" style={{ boxShadow: `0 0 0 1.5px ${rarity?.hex}` }} />
                ) : <span className="w-8 h-11 rounded bg-gray-800" />}
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-white truncate">{card.name}</span>
                  <span className="block text-xs" style={{ color: rarity?.hex }}>{'★'.repeat(card.stars)} {rarity?.label}</span>
                </span>
                <span className="text-sm text-gray-400 tabular-nums">{copies.toLocaleString()} cop{copies === 1 ? 'y' : 'ies'}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
