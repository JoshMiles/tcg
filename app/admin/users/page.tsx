import Link from 'next/link';
import { getAllCollectionUsers, getUserProfile, listSeasons, getPackCards } from '@/lib/kv';
import { uniqueCount } from '@/lib/collection';
import { getAvatars, sizeTwitchAvatar } from '@/lib/avatars';
import { getActivity } from '@/lib/activity';
import { Avatar } from '@/app/components/Avatar';
import { resetAllUsers } from '../actions';
import { ConfirmButton } from '../components/ConfirmButton';
import { UserSearch } from './UserSearch';

export const dynamic = 'force-dynamic';

type SortKey = 'cards' | 'pulls' | 'active' | 'name';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'cards', label: 'Most cards' },
  { key: 'pulls', label: 'Most pulls' },
  { key: 'active', label: 'Recently active' },
  { key: 'name', label: 'A–Z' },
];

function timeAgo(at: number | undefined, now: number): string {
  if (!at) return '—';
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ sort?: string }> }) {
  const { sort: sortParam } = await searchParams;
  const sort: SortKey = SORTS.some(s => s.key === sortParam) ? (sortParam as SortKey) : 'cards';

  const [users, seasons, activity] = await Promise.all([
    getAllCollectionUsers(),
    listSeasons(),
    getActivity({ limit: 500 }),
  ]);

  const [profiles, avatars] = await Promise.all([
    Promise.all(users.map(u => getUserProfile(u.username))),
    getAvatars(users.map(u => u.username)),
  ]);
  const profileMap = Object.fromEntries(profiles.filter(Boolean).map(p => [p!.username, p!]));

  const seasonCardCounts: Record<string, number> = {};
  await Promise.all(
    seasons.map(async s => {
      const cardArrays = await Promise.all(s.packIds.map(id => getPackCards(id)));
      seasonCardCounts[s.id] = cardArrays.reduce((sum, cards) => sum + cards.length, 0);
    })
  );
  const activeSeasonId = seasons.find(s => s.active)?.id;

  // Most recent logged activity per user (the log keeps the latest 500 events, newest first).
  const lastActive = new Map<string, number>();
  for (const e of activity.events) {
    if (e.username && !lastActive.has(e.username)) lastActive.set(e.username, e.at);
  }

  const rows = users.map(user => {
    const unique = user.seasons.reduce((s, x) => s + uniqueCount(x.cards), 0);
    const pulls = user.seasons.reduce((s, x) => s + x.cards.length, 0);

    // Headline progress: the active season if they have cards in it, else their best season.
    const withPct = user.seasons.map(us => {
      const total = seasonCardCounts[us.id] ?? 0;
      const owned = uniqueCount(us.cards);
      return { id: us.id, name: us.name, owned, total, pct: total > 0 ? Math.round((owned / total) * 100) : 0 };
    });
    const primary =
      withPct.find(w => w.id === activeSeasonId) ??
      [...withPct].sort((a, b) => b.pct - a.pct)[0];

    const profile = profileMap[user.username];
    return {
      username: user.username,
      displayName: profile?.displayName || user.username,
      isTwitch: !!profile?.twitchId,
      unique, pulls, primary,
      otherSeasons: withPct.length - 1,
      lastActive: lastActive.get(user.username),
    };
  });

  // Rank is by unique cards regardless of how the list is sorted.
  const byCards = [...rows].sort((a, b) => b.unique - a.unique || b.pulls - a.pulls);
  const rank = new Map(byCards.map((r, i) => [r.username, i + 1]));

  const sorted = [...rows].sort((a, b) => {
    if (sort === 'pulls') return b.pulls - a.pulls || b.unique - a.unique;
    if (sort === 'name') return a.username.localeCompare(b.username);
    if (sort === 'active') return (b.lastActive ?? 0) - (a.lastActive ?? 0) || b.unique - a.unique;
    return b.unique - a.unique || b.pulls - a.pulls;
  });

  const now = Date.now();

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Users</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {sorted.length} collector{sorted.length !== 1 ? 's' : ''} across all seasons · click a row to manage them
          </p>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="/collection"
            target="_blank"
            className="px-3 py-2 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl transition-colors"
          >
            ↗ Collection Page
          </a>
          {sorted.length > 0 && (
            <form action={resetAllUsers}>
              <ConfirmButton
                title="Reset ALL collections?"
                confirmLabel="Reset everyone"
                message={<>This wipes <strong className="text-white">every viewer&apos;s cards in every season</strong> ({sorted.length} collector{sorted.length !== 1 ? 's' : ''}). This can&apos;t be undone.</>}
                className="px-3 py-2 text-xs text-red-500 hover:text-red-300 hover:bg-red-950/40 rounded-xl transition-colors"
              >
                Reset All
              </ConfirmButton>
            </form>
          )}
        </div>
      </div>

      <div className="tcg-panel rounded-2xl overflow-hidden">
        {sorted.length === 0 ? (
          <div className="py-20 text-center space-y-2">
            <p className="text-2xl mb-4">👥</p>
            <p className="text-gray-400 font-medium">No collectors yet</p>
            <p className="text-gray-600 text-sm">Viewers appear here when they pull cards on stream</p>
          </div>
        ) : (
          <>
            {/* Search + sort */}
            <UserSearch total={sorted.length} />
            <div className="px-6 py-2.5 border-b border-gray-800 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-gray-500 font-bold uppercase tracking-wider mr-1">Sort</span>
              {SORTS.map(s => (
                <Link
                  key={s.key}
                  href={s.key === 'cards' ? '/admin/users' : `/admin/users?sort=${s.key}`}
                  className={`px-3 py-1 rounded-full font-bold border transition-colors ${
                    sort === s.key
                      ? 'bg-yellow-500/15 border-yellow-500/50 text-yellow-300'
                      : 'border-gray-700 text-gray-400 hover:text-white'
                  }`}
                >
                  {s.label}
                </Link>
              ))}
            </div>

            {/* Column headers */}
            <div className="grid grid-cols-[2.5rem_minmax(0,1.4fr)_minmax(0,1.3fr)_5.5rem_6.5rem_5rem] gap-3 px-6 py-3 border-b border-gray-800 text-xs font-medium text-gray-500 uppercase tracking-wider">
              <span>#</span>
              <span>Viewer</span>
              <span>Collection</span>
              <span className="text-right">Pulls</span>
              <span className="text-right" title="From the latest 500 activity events">Last active</span>
              <span />
            </div>

            {sorted.map(r => {
              const n = rank.get(r.username) ?? 0;
              const rankBadge =
                n === 1 ? 'bg-gradient-to-br from-yellow-300 to-amber-600 text-gray-950 shadow-glow'
                : n === 2 ? 'bg-gradient-to-br from-gray-100 to-gray-400 text-gray-950'
                : n === 3 ? 'bg-gradient-to-br from-orange-300 to-orange-700 text-gray-950'
                : 'text-gray-600';
              const pct = r.primary?.pct ?? 0;
              const barColor = pct >= 80 ? 'from-amber-300 to-amber-500' : pct >= 50 ? 'from-green-300 to-green-500' : 'from-gray-500 to-gray-400';
              const dupes = r.pulls - r.unique;

              return (
                // The whole row is one link (stretched anchor); the gift link sits above it.
                <div
                  key={r.username}
                  data-search={`${r.username} ${r.displayName}`.toLowerCase()}
                  className="relative grid grid-cols-[2.5rem_minmax(0,1.4fr)_minmax(0,1.3fr)_5.5rem_6.5rem_5rem] gap-3 items-center px-6 py-3 border-t border-gray-800/60 first:border-0 hover:bg-white/[0.03] transition-colors"
                >
                  <Link href={`/admin/users/${r.username}`} aria-label={`Manage ${r.displayName}`} className="absolute inset-0" />

                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold tabular-nums ${rankBadge}`}>{n}</span>

                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar src={avatars[r.username] && sizeTwitchAvatar(avatars[r.username], 70)} name={r.displayName} className="w-9 h-9 text-sm" />
                    <div className="min-w-0">
                      <p className="font-bold text-white text-sm truncate">{r.displayName}</p>
                      <p className="text-xs text-gray-600 font-mono truncate">
                        {r.displayName !== r.username ? `@${r.username}` : r.isTwitch ? 'Twitch linked' : ''}
                      </p>
                    </div>
                  </div>

                  <div className="min-w-0">
                    {r.primary ? (
                      <>
                        <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
                          <div className={`h-full rounded-full bg-gradient-to-r ${barColor}`} style={{ width: `${pct}%` }} />
                        </div>
                        <p className="mt-1 text-xs text-gray-400 truncate">
                          <span className="font-bold text-white tabular-nums">{r.primary.owned}/{r.primary.total}</span>
                          <span className="tabular-nums"> · {pct}%</span>
                          <span className="text-gray-600"> · {r.primary.name}{r.otherSeasons > 0 ? ` +${r.otherSeasons} more` : ''}</span>
                        </p>
                      </>
                    ) : (
                      <span className="text-xs text-gray-600">—</span>
                    )}
                  </div>

                  <span className="text-right tabular-nums text-sm text-gray-300" title={dupes > 0 ? `${r.unique} unique, ${dupes} duplicate${dupes !== 1 ? 's' : ''}` : undefined}>
                    {r.pulls}
                    {dupes > 0 && <span className="block text-[10px] text-gray-600">{dupes} dupes</span>}
                  </span>

                  <span className="text-right text-xs text-gray-500 tabular-nums">{timeAgo(r.lastActive, now)}</span>

                  <div className="relative z-10 flex items-center justify-end gap-2">
                    <Link
                      href={`/admin?gift=${encodeURIComponent(r.username)}#quick-actions`}
                      title={`Gift ${r.displayName} a pack`}
                      className="px-2 py-1 text-base rounded-lg hover:bg-white/10 transition-colors"
                    >
                      🎁
                    </Link>
                    <span aria-hidden className="text-gray-600">›</span>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
