import { Icon } from '@/app/components/Icon';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSeason, listSeasons } from '@/lib/kv';
import { getSeasonLeaderboardCached } from '@/lib/leaderboard';
import { getSnapshot } from '@/lib/season-wrap';
import { standingsToBoardRows, type BoardRow } from '@/lib/board-view';
import { getHiddenUsers } from '@/lib/user-admin';
import { getSession } from '@/lib/session';
import { Board } from '../Board';
import { profileHref } from '@/lib/profile-url';
import { getAvatars, sizeTwitchAvatar } from '@/lib/avatars';
import { Avatar } from '@/app/components/Avatar';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ seasonId: string }> }): Promise<Metadata> {
  const { seasonId } = await params;
  const season = await getSeason(seasonId).catch(() => null);
  if (!season || season.status === 'draft') return { title: 'Leaderboard' };
  return { title: `${season.name} leaderboard`, description: `Who is collecting the most in ${season.name} on The Cheesy TCG.` };
}

export default async function LeaderboardPage({ params }: { params: Promise<{ seasonId: string }> }) {
  const { seasonId } = await params;
  const [season, seasons, session] = await Promise.all([getSeason(seasonId), listSeasons(), getSession()]);
  if (!season || season.status === 'draft') notFound();

  const [{ rows, values }, snapshot] = await Promise.all([getSeasonLeaderboardCached(season), season.endedAt ? getSnapshot(season.id) : Promise.resolve(null)]);
  // An ended season's board IS its saved final standings, so the list always agrees with the champion and awards above it. (The live
  // numbers would drift: serial numbers assigned later and scoring changes both move them.) No snapshot: the live board, as before.
  const hidden = snapshot ? await getHiddenUsers().catch(() => new Set<string>()) : new Set<string>();
  const final = season.endedAt && snapshot && snapshot.standings.length > 0 ? standingsToBoardRows(snapshot.standings, hidden) : null;
  const boardRows: BoardRow[] = final
    ? final.rows.slice(0, values.settings.leaderboardSize)
    : rows.slice(0, values.settings.leaderboardSize).map(r => ({ username: r.username, score: r.score, cardPoints: r.cardPoints, completionBonus: r.completionBonus, setBonus: r.setBonus, complete: r.complete, uniqueCards: r.uniqueCards, copies: r.copies, variants: r.variants }));
  const avatars = await getAvatars(boardRows.map(r => r.username));

  return (
    <div className="text-gray-200">
      <div className="border-b border-poke-blue-light/20 bg-gray-950/70 backdrop-blur">
        <div className="holo-strip" />
        <div className="max-w-3xl mx-auto px-4 py-5 flex items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold text-white leading-none"><Icon name="trophy" className="mr-2 text-yellow-400" />Leaderboard</h1>
            <p className="text-xs text-gray-500 mt-1">
              {season.name} · {final && snapshot ? snapshot.stats.viewers : rows.length} collector{(final && snapshot ? snapshot.stats.viewers : rows.length) === 1 ? '' : 's'}
              {season.endedAt ? <span className="ml-2 text-gray-400">{final ? 'Final' : 'Ended'}</span> : season.active && <span className="ml-2 text-green-400">In progress</span>}
            </p>
          </div>
          <Link href={`/stats?season=${season.id}`} className="text-xs text-yellow-500 hover:text-yellow-300 transition-colors shrink-0">
            Season stats →
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
            {final && <p className="text-xs text-gray-400">The list below is the final ranking saved when the season ended.</p>}
            {snapshot && snapshot.awards.length > 0 && (
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {snapshot.awards.filter(a => !hidden.has(a.username)).slice(0, 12).map((a, i) => (
                  <li key={`${a.id}-${a.username}-${i}`} className="flex items-center gap-2.5 rounded-lg bg-gray-900/70 border border-gray-800 px-3 py-2 text-sm">
                    <Icon name={a.icon} className="text-yellow-400" />
                    <span className="font-semibold text-gray-200">{a.title}</span>
                    <Link href={profileHref(a.username)} className="text-gray-400 hover:text-white truncate">{a.username}</Link>
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

        <Board
          rows={boardRows}
          avatars={Object.fromEntries(boardRows.map(r => [r.username, avatars[r.username] ? sizeTwitchAvatar(avatars[r.username], 70) : undefined]))}
          totalCards={values.totalCards}
          seasonId={season.id}
          viewer={session?.username}
          noVariants={!!final && !final.hasVariants}
        />
      </div>
    </div>
  );
}
