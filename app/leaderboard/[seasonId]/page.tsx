import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSeason, listSeasons } from '@/lib/kv';
import { getSeasonLeaderboard } from '@/lib/leaderboard';
import { VARIANTS, VARIANT_LABELS } from '@/lib/variants';
import { getAvatars, sizeTwitchAvatar } from '@/lib/avatars';
import { Avatar } from '@/app/components/Avatar';
import { cardThumbUrl } from '@/lib/card-art';

export const dynamic = 'force-dynamic';

const MEDALS = ['🥇', '🥈', '🥉'];
const VARIANT_SHORT: Record<string, string> = { reverse: 'RH', full: 'FA', shiny: '✨' };

export default async function LeaderboardPage({ params }: { params: Promise<{ seasonId: string }> }) {
  const { seasonId } = await params;
  const [season, seasons] = await Promise.all([getSeason(seasonId), listSeasons()]);
  if (!season || season.status === 'draft') notFound();

  const { rows, values, packs } = await getSeasonLeaderboard(season);
  const top = rows.slice(0, 100);
  const avatars = await getAvatars(top.map(r => r.username));
  const upgrades = packs.some(p => p.pack.upgradesEnabled);

  const cards = packs
    .flatMap(({ pack, cards }) => cards.map(c => ({ card: c, value: values.cards.get(c.number), upgradable: pack.upgradesEnabled && c.upgradesEnabled !== false })))
    .filter(x => x.value)
    .sort((a, b) => b.value!.values.regular - a.value!.values.regular);

  return (
    <div className="min-h-screen text-gray-100">
      <div className="border-b border-poke-blue-light/20 bg-gray-950/70 backdrop-blur">
        <div className="holo-strip" />
        <div className="max-w-3xl mx-auto px-4 py-5 flex items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold text-white leading-none">🏆 Leaderboard</h1>
            <p className="text-xs text-gray-500 mt-1">
              {season.name} · {rows.length} collector{rows.length === 1 ? '' : 's'}
              {season.active && <span className="ml-2 text-green-400">Active</span>}
            </p>
          </div>
          <Link href="/collection" className="text-xs text-yellow-500 hover:text-yellow-300 transition-colors shrink-0">
            Find a collection →
          </Link>
        </div>

        {seasons.filter(s => s.status === 'published').length > 1 && (
          <div className="max-w-3xl mx-auto px-4 pb-3 flex gap-2 overflow-x-auto">
            {seasons.filter(s => s.status === 'published').sort((a, b) => b.createdAt - a.createdAt).map(s => (
              <Link
                key={s.id}
                href={`/leaderboard/${s.id}`}
                className={`px-3 py-1 rounded-full text-xs whitespace-nowrap border transition-colors ${
                  s.id === season.id
                    ? 'bg-yellow-500 text-gray-950 border-yellow-500 font-semibold'
                    : 'text-gray-400 border-gray-700 hover:text-white'
                }`}
              >
                {s.name}
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {top.length === 0 ? (
          <div className="text-center py-16 text-gray-600">No one is on the board yet.</div>
        ) : (
          <div className="space-y-2">
            {top.map((r, i) => (
              <Link
                key={r.username}
                href={`/collection/${r.username}`}
                className={`tcg-panel rounded-xl px-4 py-3 flex items-center gap-4 hover:border-yellow-500/40 transition-colors ${i === 0 ? 'ring-1 ring-yellow-500/50' : ''}`}
              >
                <span className="w-8 text-center font-bold text-gray-500 tabular-nums">{MEDALS[i] ?? `#${i + 1}`}</span>
                <Avatar src={avatars[r.username] && sizeTwitchAvatar(avatars[r.username], 70)} name={r.username} className="w-9 h-9 text-sm" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-white truncate">{r.username}</p>
                  <p className="text-xs text-gray-500">
                    {r.uniqueCards}/{values.totalCards} cards · {r.copies} cop{r.copies === 1 ? 'y' : 'ies'}
                    {VARIANTS.filter(v => v !== 'regular' && r.variants[v] > 0).map(v => (
                      <span key={v} className="ml-2 text-fuchsia-300" title={VARIANT_LABELS[v]}>{r.variants[v]}× {VARIANT_SHORT[v]}</span>
                    ))}
                  </p>
                </div>
                <span className="font-display text-2xl font-bold text-yellow-400 tabular-nums">{r.score.toLocaleString()}</span>
              </Link>
            ))}
          </div>
        )}

        {cards.length > 0 && (
          <details className="tcg-panel rounded-xl overflow-hidden">
            <summary className="px-4 py-3 text-sm font-medium text-gray-300 cursor-pointer select-none">
              How are points worked out?
            </summary>
            <div className="px-4 pb-4 space-y-3">
              <p className="text-xs text-gray-500 leading-relaxed">
                Your score is the value of every card you own. A card is worth more the harder it is to pull, the rarer its
                variant{upgrades ? ' (Reverse Holo, Full Art, Shiny)' : ''}, and the fewer copies exist across the season —
                so values shift as more cards are pulled.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500 text-left">
                      <th className="py-1 pr-3 font-medium">Card</th>
                      <th className="py-1 px-2 font-medium text-right">Copies</th>
                      <th className="py-1 px-2 font-medium text-right">Regular</th>
                      {upgrades && VARIANTS.filter(v => v !== 'regular').map(v => (
                        <th key={v} className="py-1 px-2 font-medium text-right">{VARIANT_SHORT[v]}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/60">
                    {cards.map(({ card, value, upgradable }) => (
                      <tr key={card.id} className="text-gray-300">
                        <td className="py-1 pr-3">
                          <span className="flex items-center gap-2">
                            {card.imageUrl && <img src={cardThumbUrl(card.imageUrl)} alt="" loading="lazy" className="w-5 h-7 object-cover rounded-sm" />}
                            <span className="truncate">{card.name}</span>
                          </span>
                        </td>
                        <td className="py-1 px-2 text-right tabular-nums text-gray-500">{value!.copies}</td>
                        <td className="py-1 px-2 text-right tabular-nums">{value!.values.regular}</td>
                        {upgrades && VARIANTS.filter(v => v !== 'regular').map(v => (
                          <td key={v} className="py-1 px-2 text-right tabular-nums text-gray-400">{upgradable ? value!.values[v] : '—'}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
