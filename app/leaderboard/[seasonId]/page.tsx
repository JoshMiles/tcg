import { Icon, RankMedal } from '@/app/components/Icon';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSeason, listSeasons } from '@/lib/kv';
import { getSeasonLeaderboard } from '@/lib/leaderboard';
import { getSnapshot } from '@/lib/season-wrap';
import { VARIANTS, VARIANT_LABELS } from '@/lib/variants';
import { getAvatars, sizeTwitchAvatar } from '@/lib/avatars';
import { Avatar } from '@/app/components/Avatar';

export const dynamic = 'force-dynamic';

const VARIANT_SHORT: Record<string, string> = { reverse: 'RH', full: 'FA', shiny: 'SH' };

export default async function LeaderboardPage({ params }: { params: Promise<{ seasonId: string }> }) {
  const { seasonId } = await params;
  const [season, seasons] = await Promise.all([getSeason(seasonId), listSeasons()]);
  if (!season || season.status === 'draft') notFound();

  const [{ rows, values }, snapshot] = await Promise.all([getSeasonLeaderboard(season), season.endedAt ? getSnapshot(season.id) : Promise.resolve(null)]);
  const top = rows.slice(0, values.settings.leaderboardSize);
  const avatars = await getAvatars(top.map(r => r.username));

  return (
    <div className="min-h-screen text-gray-200">
      <div className="border-b border-poke-blue-light/20 bg-gray-950/70 backdrop-blur">
        <div className="holo-strip" />
        <div className="max-w-3xl mx-auto px-4 py-5 flex items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold text-white leading-none"><Icon name="trophy" className="mr-2 text-yellow-400" />Leaderboard</h1>
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

        {season.endedAt && (
          <section className="rounded-2xl border border-yellow-500/30 bg-yellow-500/[0.04] p-4 space-y-3">
            <p className="text-sm font-bold text-yellow-300"><Icon name="trophy" className="mr-1.5" />Final standings · this season ended {new Date(season.endedAt).toLocaleDateString()}</p>
            {snapshot && snapshot.awards.length > 0 && (
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {snapshot.awards.slice(0, 12).map((a, i) => (
                  <li key={`${a.id}-${a.username}-${i}`} className="flex items-center gap-2.5 rounded-lg bg-gray-900/70 border border-gray-800 px-3 py-2 text-sm">
                    <Icon name={a.icon} className="text-yellow-400" />
                    <span className="font-semibold text-gray-200">{a.title}</span>
                    <Link href={`/collection/${a.username}`} className="text-gray-400 hover:text-white truncate">{a.username}</Link>
                    <span className="ml-auto text-xs text-gray-500 shrink-0">{a.detail}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* The full explanation lives on the FAQ page */}
        <Link
          href="/faq#points"
          className="rind rounded-xl px-4 py-3 flex items-center justify-between gap-3 hover:brightness-125 transition"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-white">
            <Icon name="info" /> How are points worked out?
          </span>
          <span className="text-xs text-yellow-400 font-semibold shrink-0">Read the FAQ →</span>
        </Link>

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
                <span className="w-8 text-center font-bold text-gray-500 tabular-nums"><RankMedal rank={i + 1} /></span>
                <Avatar src={avatars[r.username] && sizeTwitchAvatar(avatars[r.username], 70)} name={r.username} className="w-9 h-9 text-sm" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-white truncate">
                    {r.username}
                    {r.complete && (
                      <span
                        className="ml-2 align-middle text-[10px] font-extrabold uppercase tracking-wider text-gray-950 bg-yellow-400 rounded-full px-2 py-0.5"
                        title="Owns every card in the season"
                      >
                        <Icon name="cheese" className="mr-1" />Complete
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500">
                    {r.uniqueCards}/{values.totalCards} cards · {r.copies} cop{r.copies === 1 ? 'y' : 'ies'}
                    {VARIANTS.filter(v => v !== 'regular' && r.variants[v] > 0).map(v => (
                      <span key={v} className="ml-2 text-fuchsia-300" title={VARIANT_LABELS[v]}>{r.variants[v]}× {VARIANT_SHORT[v]}</span>
                    ))}
                  </p>
                </div>
                <span
                  className="font-display text-2xl font-bold text-yellow-400 tabular-nums"
                  title={`Cards ${r.cardPoints.toLocaleString()} + completion bonus ${r.completionBonus.toLocaleString()}${r.setBonus ? ` + complete collection bonus ${r.setBonus.toLocaleString()}` : ''}`}
                >
                  {r.score.toLocaleString()}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
