import { listAllPacks, getPackCards } from '@/lib/kv';
import { deletePackAction } from '../actions';
import { NewPackButton } from '../components/NewPackButton';
import Link from 'next/link';
import { rarityStats } from '@/lib/rarity';

export const dynamic = 'force-dynamic';

export default async function PacksPage() {
  const packs = await listAllPacks();
  packs.sort((a, b) => b.createdAt - a.createdAt);

  const stats = await Promise.all(
    packs.map(async p => {
      const cards = await getPackCards(p.id);
      return { id: p.id, count: cards.length, tiers: rarityStats(cards) };
    })
  );
  const statsMap = Object.fromEntries(stats.map(s => [s.id, s]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Packs</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {packs.length} pack{packs.length !== 1 ? 's' : ''} · assign to any season
          </p>
        </div>
        <NewPackButton />
      </div>

      <div className="tcg-panel rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-xs font-medium text-gray-500 uppercase tracking-wider">
              <th className="text-left pl-6 pr-2 py-4 w-14"></th>
              <th className="text-left px-4 py-4">Pack</th>
              <th className="text-right px-4 py-4">Cards</th>
              <th className="text-right px-4 py-4 hidden md:table-cell">Weight</th>
              <th className="text-left px-4 py-4 hidden lg:table-cell">Rarity Mix</th>
              <th className="text-left px-4 py-4">Status</th>
              <th className="text-right pr-6 pl-4 py-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {packs.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-20 text-center">
                  <p className="text-gray-500 mb-3">No packs yet</p>
                  <NewPackButton />
                </td>
              </tr>
            )}
            {packs.map(pack => {
              const { count, tiers } = statsMap[pack.id] ?? { count: 0, tiers: [] };
              const del = deletePackAction.bind(null, pack.id);
              return (
                <tr key={pack.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="pl-6 pr-2 py-3">
                    {pack.coverImageUrl ? (
                      <img src={pack.coverImageUrl} alt={pack.name} loading="lazy" className="w-9 h-12 object-cover rounded-lg" />
                    ) : (
                      <div className="w-9 h-12 bg-gray-800 rounded-lg" />
                    )}
                  </td>

                  <td className="px-4 py-3 font-medium text-white">{pack.name}</td>

                  <td className="px-4 py-3 text-right tabular-nums text-gray-400">{count}</td>

                  <td className="px-4 py-3 text-right tabular-nums text-gray-500 hidden md:table-cell">
                    {pack.weight}×
                  </td>

                  <td className="px-4 py-3 hidden lg:table-cell">
                    <div className="flex items-center gap-3">
                      {tiers.filter(t => t.pct > 0).map(t => (
                        <span key={t.stars} className={`text-xs ${t.text}`}>
                          {'★'.repeat(t.stars)} <span className="text-gray-600">{t.pct}%</span>
                        </span>
                      ))}
                      {count === 0 && <span className="text-xs text-gray-700">—</span>}
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    {pack.active ? (
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

                  <td className="pl-4 pr-6 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/admin/packs/${pack.id}`}
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
