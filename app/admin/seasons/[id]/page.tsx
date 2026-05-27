import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSeason, listPacks, getPackCards } from '@/lib/kv';
import { updateSeason, deletePackAction } from '../../actions';
import { SeasonFields } from '../../components/SeasonFields';

export const dynamic = 'force-dynamic';

export default async function SeasonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const season = await getSeason(id);
  if (!season) notFound();

  const packs = await listPacks(id);
  packs.sort((a, b) => a.createdAt - b.createdAt);

  const cardCounts = await Promise.all(
    packs.map(p => getPackCards(p.id).then(cards => ({ id: p.id, count: cards.length })))
  );
  const countMap = Object.fromEntries(cardCounts.map(({ id: pid, count }) => [pid, count]));

  const updateThisSeason = updateSeason.bind(null, id);

  return (
    <div className="space-y-8 max-w-3xl">
      {/* Season settings */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">{season.name}</h1>
          <Link href="/admin/seasons" className="text-sm text-gray-400 hover:text-white">
            ← Seasons
          </Link>
        </div>

        <form action={updateThisSeason} className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
          <SeasonFields
            defaults={{
              name: season.name,
              collectionName: season.collectionName,
              maxConcurrentPacks: season.maxConcurrentPacks,
              active: season.active,
            }}
          />
          <div className="pt-2">
            <button
              type="submit"
              className="px-5 py-2 bg-yellow-500 hover:bg-yellow-400 text-gray-950 font-bold rounded-lg text-sm"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>

      {/* Packs */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Packs ({packs.length})</h2>
          <Link
            href={`/admin/seasons/${id}/packs/new`}
            className="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-gray-950 font-bold rounded-lg text-sm"
          >
            + New Pack
          </Link>
        </div>

        {packs.length === 0 ? (
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-8 text-center text-gray-400">
            No packs yet. Add a pack to start adding cards.
          </div>
        ) : (
          <div className="space-y-3">
            {packs.map(pack => {
              const delPack = deletePackAction.bind(null, id, pack.id);
              return (
                <div
                  key={pack.id}
                  className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-4"
                >
                  {pack.coverImageUrl && (
                    <img src={pack.coverImageUrl} alt={pack.name} className="w-10 h-14 object-cover rounded shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white">{pack.name}</span>
                      {pack.active ? (
                        <span className="text-xs px-2 py-0.5 bg-green-900 text-green-400 rounded-full">Active</span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 bg-gray-700 text-gray-400 rounded-full">Inactive</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-400 mt-0.5">
                      {countMap[pack.id] ?? 0} cards · Weight: {pack.weight}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Link
                      href={`/admin/seasons/${id}/packs/${pack.id}`}
                      className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded-lg"
                    >
                      Manage
                    </Link>
                    <form action={delPack}>
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
    </div>
  );
}
