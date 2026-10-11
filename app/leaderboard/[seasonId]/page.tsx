import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSeason, listSeasons } from '@/lib/kv';
import { getSeasonLeaderboard, SCORE_BASE } from '@/lib/leaderboard';
import { VARIANTS, VARIANT_LABELS } from '@/lib/variants';
import { getAvatars, sizeTwitchAvatar } from '@/lib/avatars';
import { Avatar } from '@/app/components/Avatar';
import { cardThumbUrl } from '@/lib/card-art';

export const dynamic = 'force-dynamic';

const MEDALS = ['🥇', '🥈', '🥉'];
const VARIANT_SHORT: Record<string, string> = { reverse: 'RH', full: 'FA', shiny: '✨' };

export default async function LeaderboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ seasonId: string }>;
  searchParams: Promise<{ how?: string }>;
}) {
  const { seasonId } = await params;
  const { how } = await searchParams; // ?how=1 opens the explainer (linked from card details)
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
    <div className="min-h-screen text-gray-200">
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

        {/* How points work — at the top so it's easy to find */}
        {cards.length > 0 && (
          <details open={!!how} className="group tcg-panel rounded-xl overflow-hidden">
            <summary className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-2 text-sm font-semibold text-white">
                <span aria-hidden>ℹ️</span> How are points worked out?
              </span>
              <span className="text-xs text-gray-500 group-open:hidden">Show</span>
              <span className="text-xs text-gray-500 hidden group-open:inline">Hide</span>
            </summary>
            <div className="px-4 pb-4 space-y-4 border-t border-gray-800/70 pt-4">
              <p className="text-sm text-gray-300 leading-relaxed">
                Your score is the value of <strong className="text-white">every card you own</strong>, duplicates included. Each copy is worth:
              </p>
              <p className="font-display text-lg font-bold text-yellow-300">
                {SCORE_BASE} × rarity × scarcity{upgrades ? ' × variant' : ''}
              </p>
              <ul className="space-y-2 text-sm text-gray-300 leading-relaxed">
                <li>
                  <strong className="text-white">Rarity</strong> — how hard the card is to pull compared with an average card. A card that comes up half as often is worth twice as much.
                </li>
                <li>
                  <strong className="text-white">Scarcity</strong> — how few copies exist across everyone this season. Fewer copies than average gives a bonus (up to 2×), more gives a penalty (down to 0.5×), so
                  values shift as more cards are pulled.
                </li>
                {upgrades && (
                  <li>
                    <strong className="text-white">Variant</strong> — Reverse Holo, Full Art and Shiny Full Art copies are worth far more than a Regular. An upgraded card is worth more than the copies
                    you spend to make it.
                  </li>
                )}
                {upgrades && (
                  <li>
                    <strong className="text-white">Upgrades use cards up.</strong> The copies you spend are destroyed, so fewer of that card exist and it becomes scarcer. That can raise the value of
                    the remaining copies of it, including the lower versions. It also nudges the season-wide average, so other cards&rsquo; values can move slightly too.
                  </li>
                )}
              </ul>

              <div className="overflow-x-auto rounded-lg border border-gray-800">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500 text-left bg-gray-950/50">
                      <th className="py-2 px-3 font-medium">Card</th>
                      <th className="py-2 px-2 font-medium text-right">Copies</th>
                      <th className="py-2 px-2 font-medium text-right">Regular</th>
                      {upgrades && VARIANTS.filter(v => v !== 'regular').map(v => (
                        <th key={v} className="py-2 px-2 font-medium text-right" title={VARIANT_LABELS[v]}>{VARIANT_SHORT[v]}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/60">
                    {cards.map(({ card, value, upgradable }) => (
                      <tr key={card.id} className="text-gray-300">
                        <td className="py-1.5 px-3">
                          <span className="flex items-center gap-2">
                            {card.imageUrl && <img src={cardThumbUrl(card.imageUrl)} alt="" loading="lazy" className="w-5 h-7 object-cover rounded-sm" />}
                            <span className="truncate">{card.name}</span>
                          </span>
                        </td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-gray-500">{value!.copies}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums">{value!.values.regular}</td>
                        {upgrades && VARIANTS.filter(v => v !== 'regular').map(v => (
                          <td key={v} className="py-1.5 px-2 text-right tabular-nums text-gray-400">{upgradable ? value!.values[v] : '—'}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-gray-600">RH = Reverse Holo · FA = Full Art · ✨ = Shiny Full Art. Click a card in your collection to see its value there too.</p>
            </div>
          </details>
        )}

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
      </div>
    </div>
  );
}
