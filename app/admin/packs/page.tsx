import Link from 'next/link';
import { listAllPacks, getPackCards } from '@/lib/kv';
import { deletePackAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function PacksPage() {
  const packs = await listAllPacks();
  packs.sort((a, b) => b.createdAt - a.createdAt);

  const cardCounts = await Promise.all(
    packs.map(p => getPackCards(p.id).then(cards => ({ id: p.id, count: cards.length, cards })))
  );
  const statsMap = Object.fromEntries(
    cardCounts.map(({ id, count, cards }) => {
      const totalProb = cards.reduce((s, c) => s + c.probability, 0);
      const tiers = [5, 4, 3, 2, 1].map(star => {
        const sum = cards.filter(c => c.stars === star).reduce((s, c) => s + c.probability, 0);
        return totalProb > 0 ? Math.round(sum / totalProb * 100) : 0;
      });
      return [id, { count, tiers }];
    })
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Packs</h1>
          <p className="text-sm text-gray-500 mt-0.5">Global pack library — add packs to any season</p>
        </div>
        <Link
          href="/admin/packs/new"
          className="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-gray-950 font-bold rounded-lg text-sm transition-colors"
        >
          + New Pack
        </Link>
      </div>

      {packs.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center space-y-3">
          <p className="text-gray-400">No packs yet.</p>
          <Link href="/admin/packs/new" className="inline-block px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-gray-950 font-bold rounded-lg text-sm">
            Create your first pack
          </Link>
        </div>
      ) : (
        <div className="grid gap-3">
          {packs.map(pack => {
            const stats = statsMap[pack.id] ?? { count: 0, tiers: [0, 0, 0, 0, 0] };
            const del = deletePackAction.bind(null, pack.id);
            return (
              <div
                key={pack.id}
                className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-4 hover:border-gray-700 transition-colors"
              >
                {pack.coverImageUrl ? (
                  <img src={pack.coverImageUrl} alt={pack.name} className="w-12 h-16 object-cover rounded-lg shrink-0" />
                ) : (
                  <div className="w-12 h-16 bg-gray-800 rounded-lg shrink-0 flex items-center justify-center text-gray-600 text-xs">
                    No img
                  </div>
                )}

                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-white">{pack.name}</span>
                    {pack.active ? (
                      <span className="text-xs px-1.5 py-0.5 bg-green-900/60 text-green-400 rounded-md">Active</span>
                    ) : (
                      <span className="text-xs px-1.5 py-0.5 bg-gray-800 text-gray-500 rounded-md">Inactive</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500">
                    {stats.count} card{stats.count !== 1 ? 's' : ''} · Weight {pack.weight}
                  </p>
                  {stats.count > 0 && (
                    <div className="flex gap-2">
                      {[5, 4, 3, 2, 1].map((star, i) => stats.tiers[i] > 0 && (
                        <span key={star} className="text-xs text-gray-600">
                          <span className="text-yellow-500">{'★'.repeat(star)}</span>
                          {' '}{stats.tiers[i]}%
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex gap-2 shrink-0">
                  <Link
                    href={`/admin/packs/${pack.id}`}
                    className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                  >
                    Manage
                  </Link>
                  <form action={del}>
                    <button
                      type="submit"
                      className="px-3 py-1.5 text-sm bg-red-900/60 hover:bg-red-900 text-red-400 rounded-lg transition-colors"
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
