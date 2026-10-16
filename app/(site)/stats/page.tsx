import { Icon } from '@/app/components/Icon';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getActive, getSeasonOverview, computeStats, ownersByCard } from '@/lib/site-data';
import { getCollection } from '@/lib/kv';
import { getHiddenUsers } from '@/lib/user-admin';
import { bucketsFor, getSeries, sum } from '@/lib/stats';
import { CardTable, type StatCard } from './CardTable';
import { PullsChart } from './PullsChart';
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

  // Per-card collectors (those an admin hid or who went private are left out, like everywhere public) and pulls per day.
  const [collection, hidden] = await Promise.all([getCollection(season.collectionName), getHiddenUsers().catch(() => new Set<string>())]);
  const owners = ownersByCard(collection, overview.values, 1, hidden);
  const statCards: StatCard[] = overview.cards.map(c => ({
    number: c.number, name: c.name, stars: c.stars, hex: getRarity(c.stars)?.hex ?? '#9ca3af', label: getRarity(c.stars)?.label ?? '',
    thumb: c.imageUrl ? cardThumbUrl(c.imageUrl) : undefined, copies: overview.values.cards.get(c.number)?.copies ?? 0, collectors: owners.get(c.number)?.collectors ?? 0,
  }));
  // The whole season (at most 90 days), but never fewer than a week so a young season doesn't draw two giant bars.
  const endAt = season.endedAt ?? Date.now();
  const whole = bucketsFor('season', season.startsAt ?? season.createdAt, endAt);
  const { starts, step } = whole.starts.length < 7 ? bucketsFor('7d', 0, endAt) : whole;
  const series = await getSeries(season.collectionName, starts, step);
  const pulls = series.data.pull;
  const dayLabels = starts.map(t => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }));
  const hasSeries = sum(pulls) > 0;

  const tiles = [
    { label: 'Collectors', value: s.collectors.toLocaleString(), sub: 'on the board' },
    { label: 'Cards out there', value: s.totalCopies.toLocaleString(), sub: 'total prints pulled' },
    { label: 'Discovered', value: `${s.cardsPulled}/${s.totalCards}`, sub: 'distinct cards pulled' },
    { label: 'Avg. completion', value: `${s.avgCompletionPct}%`, sub: 'of the set per collector' },
    { label: 'Points in play', value: s.totalScore.toLocaleString(), sub: 'across every collection' },
    { label: 'Top score', value: s.topScore.toLocaleString(), sub: overview.rows[0] ? `by ${overview.rows[0].username}` : '-' },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 space-y-8">
      <div className="space-y-3">
        <h1 className="font-display text-4xl font-bold text-white"><Icon name="chart" className="mr-2 text-yellow-400" />Season stats</h1>
        <p className="text-sm text-gray-400">{season.name}{season.endedAt ? ' · ended' : season.active ? ' · in progress' : ''} · <Link href={`/leaderboard/${season.id}`} className="text-yellow-400 hover:text-yellow-300">Leaderboard →</Link></p>
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
                <span className="text-gray-500 tabular-nums">{r.copies.toLocaleString()} prints · {r.cards} card{r.cards === 1 ? '' : 's'}</span>
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
                    {s.totalCopies > 0 ? `${((s.variantCopies[v] / s.totalCopies) * 100).toFixed(1)}% of all prints` : '-'}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">This season has a single version of every card.</p>
          )}
        </section>

        {hasSeries && (
          <section className="rind rounded-2xl p-5 space-y-3 lg:col-span-2 min-w-0">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-display text-xl font-bold text-white">Pulls per day</h2>
              <p className="text-xs text-gray-500">{sum(pulls).toLocaleString()} pulls counted{series.since ? ` since ${new Date(series.since).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}</p>
            </div>
            <PullsChart labels={dayLabels} values={pulls} />
          </section>
        )}

        <CardTable cards={statCards} collectors={s.collectors} />
      </div>
    </div>
  );
}
