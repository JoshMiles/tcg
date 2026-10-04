import Link from 'next/link';
import { getAllCollectionUsers, getUserProfile, listSeasons, getPackCards } from '@/lib/kv';
import { uniqueCount } from '@/lib/collection';
import { resetUser, resetAllUsers, updateUserProfile } from '../actions';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const [users, seasons] = await Promise.all([
    getAllCollectionUsers(),
    listSeasons(),
  ]);

  const profiles = await Promise.all(users.map(u => getUserProfile(u.username)));
  const profileMap = Object.fromEntries(
    profiles.filter(Boolean).map(p => [p!.username, p!])
  );

  const seasonCardCounts: Record<string, number> = {};
  await Promise.all(
    seasons.map(async s => {
      const cardArrays = await Promise.all(s.packIds.map(id => getPackCards(id)));
      seasonCardCounts[s.id] = cardArrays.reduce((sum, cards) => sum + cards.length, 0);
    })
  );

  const sorted = [...users].sort(
    (a, b) =>
      b.seasons.reduce((s, x) => s + uniqueCount(x.cards), 0) -
      a.seasons.reduce((s, x) => s + uniqueCount(x.cards), 0)
  );

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Users</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {sorted.length} collector{sorted.length !== 1 ? 's' : ''} across all seasons
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
              <button
                type="submit"
                className="px-3 py-2 text-xs text-red-500 hover:text-red-300 hover:bg-red-950/40 rounded-xl transition-colors"
              >
                Reset All
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="tcg-panel rounded-2xl overflow-hidden">
        {sorted.length === 0 ? (
          <div className="py-20 text-center space-y-2">
            <p className="text-2xl mb-4">👥</p>
            <p className="text-gray-400 font-medium">No collectors yet</p>
            <p className="text-gray-600 text-sm">Viewers appear here when they pull cards on stream</p>
          </div>
        ) : (
          <>
            {/* Column headers */}
            <div className="grid grid-cols-[2.5rem_1fr_5rem_14rem_5rem_9rem] gap-0 px-6 py-3 border-b border-gray-800 text-xs font-medium text-gray-500 uppercase tracking-wider">
              <span>#</span>
              <span>User</span>
              <span className="text-right">Cards</span>
              <span className="pl-6">Seasons</span>
              <span className="text-right">Best</span>
              <span className="text-right">Actions</span>
            </div>

            {sorted.map((user, i) => {
              const profile = profileMap[user.username];
              const displayName = profile?.displayName || user.username;
              const totalCards = user.seasons.reduce((s, x) => s + uniqueCount(x.cards), 0);
              const updateProfile = updateUserProfile.bind(null, user.username);
              const resetThis = resetUser.bind(null, user.username);

              let best = 0;
              for (const us of user.seasons) {
                const total = seasonCardCounts[us.id] ?? 0;
                if (total > 0) best = Math.max(best, Math.round(uniqueCount(us.cards) / total * 100));
              }

              const rankBadge =
                i === 0 ? 'bg-gradient-to-br from-yellow-300 to-amber-600 text-gray-950 shadow-glow'
                : i === 1 ? 'bg-gradient-to-br from-gray-100 to-gray-400 text-gray-950'
                : i === 2 ? 'bg-gradient-to-br from-orange-300 to-orange-700 text-gray-950'
                : 'text-gray-600';
              const bestColor = best >= 80 ? 'text-amber-400' : best >= 50 ? 'text-green-400' : 'text-gray-500';

              return (
                <details key={user.username} className="group border-t border-gray-800/60 first:border-0">
                  <summary className="grid grid-cols-[2.5rem_1fr_5rem_14rem_5rem_9rem] gap-0 items-center px-6 py-3.5 cursor-pointer list-none hover:bg-white/[0.02] transition-colors [&::-webkit-details-marker]:hidden">

                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold tabular-nums ${rankBadge}`}>{i + 1}</span>

                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-poke-blue to-poke-blue-light flex items-center justify-center text-xs font-extrabold text-white shrink-0 uppercase">
                        {displayName[0]}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-white text-sm truncate">{displayName}</p>
                        {profile?.displayName && profile.displayName !== user.username && (
                          <p className="text-xs text-gray-600 font-mono">{user.username}</p>
                        )}
                      </div>
                      {profile?.twitchId && (
                        <span className="text-xs px-1.5 py-0.5 bg-purple-900/40 text-purple-400 rounded-md shrink-0">Twitch</span>
                      )}
                    </div>

                    <span className="text-right text-gray-400 tabular-nums text-sm">{totalCards}</span>

                    <div className="flex flex-col gap-0.5 pl-6">
                      {user.seasons.map(us => {
                        const total = seasonCardCounts[us.id] ?? 0;
                        const pct = total > 0 ? Math.round(uniqueCount(us.cards) / total * 100) : 0;
                        return (
                          <span key={us.id} className="text-xs text-gray-600 truncate">
                            {us.name}:&nbsp;
                            <span className="text-yellow-500 tabular-nums">{pct}%</span>
                            <span className="text-gray-700"> ({uniqueCount(us.cards)}/{total})</span>
                          </span>
                        );
                      })}
                    </div>

                    <span className={`text-right font-semibold tabular-nums text-sm ${bestColor}`}>{best}%</span>

                    <div className="flex items-center justify-end gap-3">
                      <Link
                        href={`/admin/users/${user.username}`}
                        className="text-xs text-yellow-500 hover:text-yellow-400 transition-colors shrink-0"
                      >
                        View
                      </Link>
                      <span className="text-xs text-gray-700 group-open:rotate-90 transition-transform inline-block">›</span>
                    </div>
                  </summary>

                  {/* Expanded edit + reset panel */}
                  <div className="px-6 py-4 bg-gray-800/30 border-t border-gray-800/60">
                    <div className="flex items-start justify-between gap-6">
                      <form action={updateProfile} className="flex-1 grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Display name</label>
                          <input
                            name="displayName"
                            defaultValue={profile?.displayName || user.username}
                            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500 transition-colors"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Twitch username</label>
                          <input
                            name="twitchId"
                            defaultValue={profile?.twitchId || ''}
                            placeholder="twitch_username"
                            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500 transition-colors"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Notes</label>
                          <input
                            name="notes"
                            defaultValue={profile?.notes || ''}
                            placeholder="Optional"
                            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500 transition-colors"
                          />
                        </div>
                        <div className="col-span-3 flex items-center gap-3">
                          <button
                            type="submit"
                            className="px-4 py-1.5 tcg-btn rounded-xl text-xs transition-colors"
                          >
                            Save Profile
                          </button>
                          <a
                            href={`/collection/${user.username}`}
                            target="_blank"
                            className="px-4 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded-xl transition-colors"
                          >
                            View Collection →
                          </a>
                          <form action={resetThis}>
                            <button
                              type="submit"
                              className="px-3 py-1.5 text-xs text-red-500 hover:text-red-300 hover:bg-red-950/40 rounded-lg transition-colors"
                            >
                              Reset User
                            </button>
                          </form>
                        </div>
                      </form>
                    </div>
                  </div>
                </details>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
