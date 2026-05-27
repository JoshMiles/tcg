import { getActiveSeasonWithPacks, listAllUsers, getUserPulls } from '@/lib/kv';
import { resetUser, resetAllUsers } from '../actions';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const [result, usernames] = await Promise.all([
    getActiveSeasonWithPacks(),
    listAllUsers(),
  ]);

  if (!result) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Users</h1>
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 text-center text-gray-400">
          No active season. Create or activate a season first.
        </div>
      </div>
    );
  }

  const { season, packs } = result;
  const allCards = packs.flatMap(p => p.cards);

  // Load pull records for all users
  const userPullData = await Promise.all(
    usernames.map(async username => ({
      username,
      pulls: await getUserPulls(username),
    }))
  );

  // Filter to current season and sort by pull count desc
  const users = userPullData
    .map(({ username, pulls }) => {
      const seasonPulls = pulls.filter(p => p.seasonId === season.id);
      // unique card IDs pulled this season
      const uniqueCards = new Set(seasonPulls.map(p => p.cardId));
      return { username, pulls: seasonPulls, uniqueCards, totalPulls: seasonPulls.length };
    })
    .filter(u => u.totalPulls > 0)
    .sort((a, b) => b.uniqueCards.size - a.uniqueCards.size);

  const resetAll = resetAllUsers.bind(null, season.collectionName);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Users</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Season: <span className="text-yellow-400">{season.name}</span> · {users.length} player{users.length !== 1 ? 's' : ''}
          </p>
        </div>
        {users.length > 0 && (
          <form action={resetAll}>
            <button
              type="submit"
              className="px-4 py-2 text-sm bg-red-900 hover:bg-red-800 text-red-300 rounded-lg font-semibold"
            >
              Reset All Users
            </button>
          </form>
        )}
      </div>

      {users.length === 0 ? (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-8 text-center text-gray-400">
          No users have drawn cards this season yet.
        </div>
      ) : (
        <div className="space-y-4">
          {users.map(({ username, pulls, uniqueCards, totalPulls }) => {
            const resetThis = resetUser.bind(null, season.collectionName, username);
            const pct = allCards.length > 0 ? Math.round(uniqueCards.size / allCards.length * 100) : 0;

            // Group pulls by pack
            const byPack: Record<string, { packName: string; count: number }> = {};
            for (const pull of pulls) {
              if (!byPack[pull.packId]) byPack[pull.packId] = { packName: pull.packName, count: 0 };
              byPack[pull.packId].count++;
            }

            // Most recent pull
            const latest = pulls.sort((a, b) => b.pulledAt - a.pulledAt)[0];

            return (
              <div key={username} className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="font-mono font-semibold text-white">{username}</span>
                    <div className="flex items-center gap-3 mt-1 text-sm text-gray-400">
                      <span>{uniqueCards.size}/{allCards.length} unique cards ({pct}%)</span>
                      <span className="text-gray-600">·</span>
                      <span>{totalPulls} total pulls</span>
                      {latest && (
                        <>
                          <span className="text-gray-600">·</span>
                          <span className="text-gray-500 text-xs">Last: {new Date(latest.pulledAt).toLocaleDateString()}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <form action={resetThis}>
                    <button
                      type="submit"
                      className="px-3 py-1 text-xs bg-red-900 hover:bg-red-800 text-red-300 rounded shrink-0"
                    >
                      Reset
                    </button>
                  </form>
                </div>

                {/* Per-pack breakdown */}
                {Object.keys(byPack).length > 1 && (
                  <div className="flex gap-3 flex-wrap">
                    {Object.entries(byPack).map(([packId, { packName, count }]) => (
                      <span key={packId} className="text-xs px-2 py-1 bg-gray-800 rounded text-gray-400">
                        {packName}: {count} pull{count !== 1 ? 's' : ''}
                      </span>
                    ))}
                  </div>
                )}

                {/* Recent pulls */}
                {pulls.slice(0, 5).length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    {pulls
                      .sort((a, b) => b.pulledAt - a.pulledAt)
                      .slice(0, 8)
                      .map((pull, i) => (
                        <div key={i} className="flex items-center gap-1 text-xs bg-gray-800 rounded px-2 py-1">
                          {pull.imageUrl && (
                            <img src={pull.imageUrl} alt={pull.cardName} className="w-4 h-5 object-cover rounded" />
                          )}
                          <span className="text-gray-300">{pull.cardName}</span>
                          <span className="text-yellow-400">{'★'.repeat(pull.stars)}</span>
                        </div>
                      ))}
                    {pulls.length > 8 && (
                      <span className="text-xs text-gray-600 px-2 py-1">+{pulls.length - 8} more</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
