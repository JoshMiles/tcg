import { Icon } from '@/app/components/Icon';
import { getAllCollectionUsers, getUserProfile, listSeasons, getPackCards, getPacksForSeason } from '@/lib/kv';
import { uniqueCount } from '@/lib/collection';
import { getAvatars, sizeTwitchAvatar } from '@/lib/avatars';
import { getActivity } from '@/lib/activity';
import { getSeasonLeaderboard } from '@/lib/leaderboard';
import { getLastSeen } from '@/lib/stats';
import { tradeCountsByUser } from '@/lib/trades';
import { decodeEntry } from '@/lib/variants';
import { resetAllUsers } from '../actions/users';
import { ConfirmButton } from '../components/ConfirmButton';
import { UsersList, type UserRow } from './UsersList';
import { Tile, EmptyState } from '../components/ui';

export const metadata = { title: 'Users · Admin', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const [users, seasons, activity, lastSeenMap, trades] = await Promise.all([
    getAllCollectionUsers(),
    listSeasons(),
    getActivity({ limit: 500 }),
    getLastSeen(),
    tradeCountsByUser().catch((): Record<string, { total: number; open: number; completed: number }> => ({})),
  ]);
  const active = seasons.find(s => s.active && s.status === 'published') ?? null;

  const [profiles, avatars, board] = await Promise.all([
    Promise.all(users.map(u => getUserProfile(u.username))),
    getAvatars(users.map(u => u.username)),
    active ? getSeasonLeaderboard(active).catch((): null => null) : Promise.resolve(null),
  ]);
  const profileMap = Object.fromEntries(profiles.filter(Boolean).map(p => [p!.username, p!]));
  const scoreRows = new Map((board?.rows ?? []).map((r, i) => [r.username, { score: r.score, rank: i + 1 }]));

  // The cards a season can be completed with: the same set the leaderboard uses (draft packs are never drawn, so their cards don't count).
  const seasonNumbers: Record<string, Set<number>> = {};
  await Promise.all(seasons.map(async s => {
    const packs = (await getPacksForSeason(s)).filter(p => p.status !== 'draft');
    seasonNumbers[s.id] = new Set((await Promise.all(packs.map(p => getPackCards(p.id)))).flat().map(c => c.number));
  }));

  // Last seen: the viewer's last counted action, falling back to the latest 500 logged events.
  const lastActive = new Map<string, number>();
  for (const e of activity.events) if (e.username && !lastActive.has(e.username)) lastActive.set(e.username, e.at);
  for (const [u, t] of Object.entries(lastSeenMap)) if (t > (lastActive.get(u) ?? 0)) lastActive.set(u, t);

  const rows: UserRow[] = users.map(user => {
    const unique = user.seasons.reduce((s, x) => s + uniqueCount(x.cards), 0);
    const pulls = user.seasons.reduce((s, x) => s + x.cards.length, 0);
    let shiny = 0, full = 0;
    for (const s of user.seasons) for (const e of s.cards) { const v = decodeEntry(e).variant; if (v === 'shiny') shiny++; else if (v === 'full') full++; }
    const withPct = user.seasons.map(us => {
      const numbers = seasonNumbers[us.id] ?? new Set<number>();
      const total = numbers.size;
      const owned = new Set(us.cards.map(e => decodeEntry(e).cardNumber).filter(n => numbers.has(n))).size;
      return { id: us.id, name: us.name, owned, total, pct: total > 0 ? Math.round((owned / total) * 100) : 0 };
    });
    const primary = withPct.find(w => w.id === active?.id) ?? [...withPct].sort((a, b) => b.pct - a.pct)[0];
    const profile = profileMap[user.username];
    const score = scoreRows.get(user.username);
    return {
      username: user.username,
      displayName: profile?.displayName || user.username,
      avatar: avatars[user.username] ? sizeTwitchAvatar(avatars[user.username], 70) : undefined,
      isTwitch: !!profile?.twitchId,
      tags: profile?.tags ?? [],
      noTrading: !!profile?.flags?.noTrading,
      hidden: !!profile?.flags?.hideFromBoard,
      hasNotes: !!profile?.notes?.trim(),
      unique, pulls, shiny, full,
      primary: primary ? { name: primary.name, owned: primary.owned, total: primary.total, pct: primary.pct } : null,
      otherSeasons: withPct.length - 1,
      score: score?.score ?? null,
      scoreRank: score?.rank ?? null,
      joined: profile?.createdAt ?? null,
      lastActive: lastActive.get(user.username) ?? null,
      trades: trades[user.username]?.total ?? 0,
    };
  });

  const now = Date.now();
  const newThisWeek = rows.filter(r => r.joined && now - r.joined < 7 * 86_400_000).length;
  const active24 = rows.filter(r => r.lastActive && now - r.lastActive < 86_400_000).length;
  const active7 = rows.filter(r => r.lastActive && now - r.lastActive < 7 * 86_400_000).length;
  const dormant = rows.filter(r => r.lastActive && now - r.lastActive > 30 * 86_400_000).length;
  const complete = rows.filter(r => r.primary && r.primary.total > 0 && r.primary.owned >= r.primary.total).length;
  const restricted = rows.filter(r => r.noTrading || r.hidden).length;
  const allTags = [...new Set(rows.flatMap(r => r.tags))].sort();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-white">Users</h1>
          <p className="text-sm text-gray-500 mt-0.5">{rows.length} collector{rows.length !== 1 ? 's' : ''} across all seasons · click a row to manage them</p>
        </div>
        <div className="flex items-center gap-3">
          <a href="/collection" target="_blank" className="px-3 py-2 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl transition-colors">↗ Collection Page</a>
          {rows.length > 0 && (
            <form action={resetAllUsers}>
              <ConfirmButton
                title="Reset ALL collections?"
                confirmLabel="Reset everyone"
                typeToConfirm="reset everyone"
                message={<>This wipes <strong className="text-white">every viewer&apos;s cards in every season</strong> ({rows.length} collector{rows.length !== 1 ? 's' : ''}). There is no restore point for a reset of everyone, so this can&apos;t be undone.</>}
                className="px-3 py-2 text-xs text-red-500 hover:text-red-300 hover:bg-red-950/40 rounded-xl transition-colors"
              >
                Reset All
              </ConfirmButton>
            </form>
          )}
        </div>
      </div>

      {rows.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <Tile label="Viewers" value={rows.length} />
          <Tile label="New this week" value={newThisWeek} />
          <Tile label="Active today" value={active24} sub={`${active7} in 7 days`} />
          <Tile label="Dormant" value={dormant} sub="not seen for 30+ days" />
          <Tile label="Complete" value={complete} sub={active ? `in ${active.name}` : undefined} />
          <Tile label="Restricted" value={restricted} sub={restricted > 0 ? 'blocked or hidden' : 'none'} />
        </div>
      )}

      <div className="tcg-panel rounded-2xl overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState icon="users" title="No collectors yet">Viewers appear here when they pull cards on stream.</EmptyState>
        ) : (
          <UsersList rows={rows} allTags={allTags} activeSeason={active?.name ?? null} />
        )}
      </div>
    </div>
  );
}
