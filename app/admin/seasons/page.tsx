import Link from 'next/link';
import { listSeasons, getPacksForSeason } from '@/lib/kv';
import { deleteSeasonAction, activateSeason } from '../actions';

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
  const packMap = Object.fromEntries(packStats.map(({ id, total, active }) => [id, { total, active }]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Seasons</h1>
          <p className="text-sm text-gray-500 mt-0.5">Each season references one or more packs</p>
        </div>
        <Link
          href="/admin/seasons/new"
          className="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-gray-950 font-bold rounded-lg text-sm transition-colors"
        >
          + New Season
        </Link>
      </div>

      {seasons.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center space-y-3">
          <p className="text-gray-500">No seasons yet.</p>
          <Link href="/admin/seasons/new" className="inline-block px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-gray-950 font-bold rounded-lg text-sm">
            Create your first season
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {seasons.map(s => {
            const activate = activateSeason.bind(null, s.id);
            const del = deleteSeasonAction.bind(null, s.id);
            const packs = packMap[s.id] ?? { total: 0, active: 0 };
            return (
              <div
                key={s.id}
                className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-4 hover:border-gray-700 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-white">{s.name}</span>
                    {s.active ? (
                      <span className="text-xs px-1.5 py-0.5 bg-green-900/60 text-green-400 rounded-md">Active</span>
                    ) : (
                      <span className="text-xs px-1.5 py-0.5 bg-gray-800 text-gray-500 rounded-md">Inactive</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {packs.total} pack{packs.total !== 1 ? 's' : ''}
                    {packs.total > 0 && ` · ${packs.active} active`}
                    {' · '}
                    <span className="text-gray-600">{s.collectionName}</span>
                  </p>
                  <p className="text-xs text-gray-700 mt-0.5">
                    Created {new Date(s.createdAt).toLocaleDateString()}
                  </p>
                </div>

                <div className="flex gap-2 shrink-0">
                  {!s.active && (
                    <form action={activate}>
                      <button
                        type="submit"
                        className="px-3 py-1.5 text-sm bg-green-900/60 hover:bg-green-900 text-green-400 rounded-lg transition-colors"
                      >
                        Activate
                      </button>
                    </form>
                  )}
                  <Link
                    href={`/admin/seasons/${s.id}`}
                    className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                  >
                    Manage
                  </Link>
                  <form action={del}>
                    <button
                      type="submit"
                      className="px-3 py-1.5 text-sm bg-red-900/50 hover:bg-red-900 text-red-400 rounded-lg transition-colors"
                    >
                      Delete
                    </button>
                  </form>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
