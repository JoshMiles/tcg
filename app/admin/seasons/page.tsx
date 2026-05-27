import Link from 'next/link';
import { listSeasons, listPacks } from '@/lib/kv';
import { deleteSeasonAction, activateSeason } from '../actions';

export const dynamic = 'force-dynamic';

export default async function SeasonsPage() {
  const seasons = await listSeasons();
  seasons.sort((a, b) => b.createdAt - a.createdAt);

  const packCounts = await Promise.all(
    seasons.map(s => listPacks(s.id).then(p => ({ id: s.id, count: p.length, active: p.filter(pk => pk.active).length })))
  );
  const packMap = Object.fromEntries(packCounts.map(({ id, count, active }) => [id, { count, active }]));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Seasons</h1>
        <Link
          href="/admin/seasons/new"
          className="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-gray-950 font-bold rounded-lg text-sm"
        >
          + New Season
        </Link>
      </div>

      {seasons.length === 0 ? (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-8 text-center text-gray-400">
          No seasons yet. Create one to get started.
        </div>
      ) : (
        <div className="space-y-3">
          {seasons.map(s => {
            const activate = activateSeason.bind(null, s.id);
            const del = deleteSeasonAction.bind(null, s.id);
            const packs = packMap[s.id] ?? { count: 0, active: 0 };
            return (
              <div
                key={s.id}
                className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-white">{s.name}</span>
                    {s.active && (
                      <span className="text-xs px-2 py-0.5 bg-green-900 text-green-400 rounded-full">Active</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-400 mt-0.5">
                    {packs.count} pack{packs.count !== 1 ? 's' : ''}
                    {packs.count > 0 && ` (${packs.active} active)`}
                    {' · '}Collection: <span className="text-gray-300">{s.collectionName}</span>
                  </p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    Created {new Date(s.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0 flex-wrap justify-end">
                  {!s.active && (
                    <form action={activate}>
                      <button
                        type="submit"
                        className="px-3 py-1.5 text-sm bg-green-900 hover:bg-green-800 text-green-300 rounded-lg"
                      >
                        Activate
                      </button>
                    </form>
                  )}
                  <Link
                    href={`/admin/seasons/${s.id}`}
                    className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded-lg"
                  >
                    Manage
                  </Link>
                  <form action={del}>
                    <button
                      type="submit"
                      className="px-3 py-1.5 text-sm bg-red-900 hover:bg-red-800 text-red-300 rounded-lg"
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
