import { getActiveSeasonWithCards, getCollection } from '@/lib/kv';

export const dynamic = 'force-dynamic';
import { resetUser, resetAllUsers } from '../actions';

export default async function UsersPage() {
  const result = await getActiveSeasonWithCards();

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

  const { season, cards } = result;
  const collection = await getCollection(season.collectionName);
  const users = Object.entries(collection).sort((a, b) => b[1].length - a[1].length);

  const resetAll = resetAllUsers.bind(null, season.collectionName);

  return (
    <div className="space-y-4">
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
          No users have drawn cards yet.
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-xs uppercase border-b border-gray-800">
                <th className="text-left px-4 py-3">Username</th>
                <th className="text-right px-4 py-3">Cards</th>
                <th className="text-right px-4 py-3">Completion</th>
                <th className="text-right px-4 py-3">Cards Owned</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(([username, owned]) => {
                const pct = Math.round(owned.length / cards.length * 100);
                const resetThis = resetUser.bind(null, season.collectionName, username);
                const ownedCards = cards
                  .filter(c => owned.includes(c.number))
                  .sort((a, b) => a.number - b.number);
                return (
                  <tr key={username} className="border-t border-gray-800 hover:bg-gray-800/50">
                    <td className="px-4 py-3 text-gray-200 font-mono">{username}</td>
                    <td className="px-4 py-3 text-right text-gray-300">{owned.length}/{cards.length}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-yellow-400">{pct}%</span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500 text-xs max-w-xs truncate">
                      {ownedCards.map(c => `#${c.number} ${c.name}`).join(', ')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <form action={resetThis}>
                        <button
                          type="submit"
                          className="px-3 py-1 text-xs bg-red-900 hover:bg-red-800 text-red-300 rounded"
                        >
                          Reset
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
