import Link from 'next/link';
import { listSeasons, getPacksForSeason } from '@/lib/kv';
import { deleteSeasonAction, activateSeason } from '../actions';
import { NewSeasonButton } from '../components/NewSeasonButton';

export const dynamic = 'force-dynamic';

export default async function SeasonsPage() {
  const seasons = await listSeasons();
  seasons.sort((a, b) => b.createdAt - a.createdAt);

  const packStats = await Promise.all(
    seasons.map(async s => {
      const packs = await getPacksForSeason(s);
      return { id: s.id, total: packs.length, active: packs.filter(p => p.active).length };
    })
  );
  const packMap = Object.fromEntries(packStats.map(({ id, ...v }) => [id, v]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Seasons</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {seasons.length} season{seasons.length !== 1 ? 's' : ''} · one active at a time
          </p>
        </div>
        <NewSeasonButton />
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-xs font-medium text-gray-500 uppercase tracking-wider">
              <th className="text-left px-6 py-4">Season</th>
              <th className="text-left px-4 py-4 hidden md:table-cell">Collection Key</th>
              <th className="text-right px-4 py-4">Packs</th>
              <th className="text-left px-4 py-4">Status</th>
              <th className="text-right px-4 py-4 hidden md:table-cell">Created</th>
              <th className="text-right pr-6 pl-4 py-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {seasons.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-20 text-center">
                  <p className="text-gray-500 mb-3">No seasons yet</p>
                  <NewSeasonButton />
                </td>
              </tr>
            )}
            {seasons.map(s => {
              const packs = packMap[s.id] ?? { total: 0, active: 0 };
              const activate = activateSeason.bind(null, s.id);
              const del = deleteSeasonAction.bind(null, s.id);
              return (
                <tr key={s.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-4">
                    <span className="font-medium text-white">{s.name}</span>
                  </td>

                  <td className="px-4 py-4 hidden md:table-cell">
                    <code className="text-xs text-gray-500 bg-gray-800 px-2 py-1 rounded">
                      {s.collectionName}
                    </code>
                  </td>

                  <td className="px-4 py-4 text-right tabular-nums">
                    {packs.total === 0 ? (
                      <span className="text-gray-700">—</span>
                    ) : (
                      <span className="text-gray-400">
                        {packs.active}/{packs.total}
                        <span className="text-gray-700 ml-1 text-xs">active</span>
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-4">
                    {s.active ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 shadow shadow-green-400/50" />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-700" />
                        Inactive
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-4 text-right text-xs text-gray-600 tabular-nums hidden md:table-cell">
                    {new Date(s.createdAt).toLocaleDateString()}
                  </td>

                  <td className="pl-4 pr-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {!s.active && (
                        <form action={activate}>
                          <button
                            type="submit"
                            className="px-3 py-1.5 text-xs bg-green-950/50 hover:bg-green-900/50 text-green-500 hover:text-green-300 rounded-lg transition-colors"
                          >
                            Activate
                          </button>
                        </form>
                      )}
                      <Link
                        href={`/admin/seasons/${s.id}`}
                        className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded-lg transition-colors"
                      >
                        Manage →
                      </Link>
                      <form action={del}>
                        <button
                          type="submit"
                          className="px-3 py-1.5 text-xs text-red-500 hover:text-red-300 hover:bg-red-950/40 rounded-lg transition-colors"
                        >
                          Delete
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
