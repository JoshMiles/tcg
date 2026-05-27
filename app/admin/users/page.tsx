import { getAllCollectionUsers, getUserProfile, listSeasons, getPackCards } from '@/lib/kv';
import { resetUser, resetAllUsers, updateUserProfile } from '../actions';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const [users, seasons] = await Promise.all([
    getAllCollectionUsers(),
    listSeasons(),
  ]);

  // Load profiles for all users
  const profiles = await Promise.all(
    users.map(u => getUserProfile(u.username))
  );
  const profileMap = Object.fromEntries(
    profiles.filter(Boolean).map(p => [p!.username, p!])
  );

  // Build a card pool per season for completion %
  const seasonCardCounts: Record<string, number> = {};
  await Promise.all(
    seasons.map(async s => {
      let total = 0;
      for (const packId of s.packIds) {
        const cards = await getPackCards(packId);
        total += cards.length;
      }
      seasonCardCounts[s.id] = total;
    })
  );

  // Sort by total cards desc
  const sorted = [...users].sort(
    (a, b) =>
      b.seasons.reduce((s, x) => s + x.cards.length, 0) -
      a.seasons.reduce((s, x) => s + x.cards.length, 0)
  );

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Users</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {sorted.length} collector{sorted.length !== 1 ? 's' : ''} across all seasons
          </p>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="/collection"
            target="_blank"
            className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
          >
            ↗ Collection Page
          </a>
          {sorted.length > 0 && (
            <form action={resetAllUsers}>
              <button
                type="submit"
                className="px-3 py-1.5 text-xs bg-red-900/60 hover:bg-red-900 text-red-400 rounded-lg transition-colors"
              >
                Reset All
              </button>
            </form>
          )}
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center space-y-2">
          <p className="text-gray-500">No collectors yet.</p>
          <p className="text-gray-700 text-sm">
            When viewers pull cards through the overlay, they'll appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map(({ username, seasons: userSeasons }) => {
            const profile = profileMap[username];
            const displayName = profile?.displayName || username;
            const totalCards = userSeasons.reduce((s, x) => s + x.cards.length, 0);
            const updateProfile = updateUserProfile.bind(null, username);
            const resetThis = resetUser.bind(null, username);

            return (
              <div key={username} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                {/* Main row */}
                <div className="px-4 py-3 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-white">{displayName}</span>
                      {profile?.displayName && profile.displayName !== username && (
                        <span className="text-xs text-gray-600 font-mono">({username})</span>
                      )}
                      {profile?.twitchId && (
                        <span className="text-xs px-1.5 py-0.5 bg-purple-900/50 text-purple-400 rounded-md">
                          Twitch linked
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      <span className="text-xs text-gray-500">{totalCards} card{totalCards !== 1 ? 's' : ''} total</span>
                      {userSeasons.map(us => {
                        const total = seasonCardCounts[us.id] ?? 0;
                        const pct = total > 0 ? Math.round(us.cards.length / total * 100) : 0;
                        return (
                          <span key={us.id} className="text-xs text-gray-600">
                            {us.name}: <span className="text-gray-400">{us.cards.length}/{total}</span>
                            {' '}
                            <span className="text-yellow-500">{pct}%</span>
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <a
                      href={`/collection/${username}`}
                      target="_blank"
                      className="px-2.5 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded transition-colors"
                    >
                      View →
                    </a>
                    <form action={resetThis}>
                      <button
                        type="submit"
                        className="px-2.5 py-1 text-xs bg-red-900/50 hover:bg-red-900 text-red-400 rounded transition-colors"
                      >
                        Reset
                      </button>
                    </form>
                  </div>
                </div>

                {/* Inline edit panel */}
                <details className="group border-t border-gray-800/60">
                  <summary className="px-4 py-2 text-xs text-gray-600 hover:text-gray-400 cursor-pointer select-none transition-colors list-none flex items-center gap-1">
                    <span className="group-open:rotate-90 transition-transform inline-block">›</span>
                    Edit profile
                  </summary>
                  <form action={updateProfile} className="px-4 pb-4 pt-2 space-y-3 bg-gray-800/30">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Display name</label>
                        <input
                          name="displayName"
                          defaultValue={profile?.displayName || username}
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-yellow-500 transition-colors"
                          placeholder={username}
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Twitch username</label>
                        <input
                          name="twitchId"
                          defaultValue={profile?.twitchId || ''}
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-purple-500 transition-colors"
                          placeholder="twitch_username"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Notes</label>
                      <input
                        name="notes"
                        defaultValue={profile?.notes || ''}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-yellow-500 transition-colors"
                        placeholder="Optional notes"
                      />
                    </div>
                    <button
                      type="submit"
                      className="px-4 py-1.5 bg-yellow-500 hover:bg-yellow-400 text-gray-950 font-bold rounded-lg text-xs transition-colors"
                    >
                      Save
                    </button>
                  </form>
                </details>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
