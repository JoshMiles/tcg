import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSeason, getPack, getPackCards } from '@/lib/kv';
import { updatePack, addCard, deleteCard } from '../../../../actions';
import { PackFields } from '../../../../components/PackFields';

export const dynamic = 'force-dynamic';

export default async function PackPage({
  params,
}: {
  params: Promise<{ id: string; packId: string }>;
}) {
  const { id, packId } = await params;
  const [season, pack, cards] = await Promise.all([getSeason(id), getPack(packId), getPackCards(packId)]);
  if (!season || !pack) notFound();

  const sortedCards = [...cards].sort((a, b) => a.number - b.number);
  const totalProb = cards.reduce((s, c) => s + c.probability, 0);

  const updateThisPack = updatePack.bind(null, id, packId);

  const tierStats: Record<number, { count: number; probSum: number }> = {};
  for (const c of cards) {
    if (!tierStats[c.stars]) tierStats[c.stars] = { count: 0, probSum: 0 };
    tierStats[c.stars].count++;
    tierStats[c.stars].probSum += c.probability;
  }

  return (
    <div className="space-y-8 max-w-3xl">
      {/* Pack settings */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold">{pack.name}</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              <Link href="/admin/seasons" className="hover:text-white">Seasons</Link>
              {' / '}
              <Link href={`/admin/seasons/${id}`} className="hover:text-white">{season.name}</Link>
            </p>
          </div>
        </div>

        <form action={updateThisPack} className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
          <PackFields defaults={pack} />
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

      {/* Cards */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Cards ({sortedCards.length})</h2>
          {totalProb > 0 && (
            <div className="flex gap-3 text-xs text-gray-500">
              {[5, 4, 3, 2, 1].map(star => {
                const t = tierStats[star];
                if (!t) return null;
                const pct = Math.round(t.probSum / totalProb * 100);
                return (
                  <span key={star} className="flex items-center gap-1">
                    <span className="text-yellow-400">{'★'.repeat(star)}</span>
                    <span>{pct}%</span>
                  </span>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden mb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-xs uppercase border-b border-gray-800">
                <th className="text-left px-4 py-3">#</th>
                <th className="text-left px-4 py-3">Name</th>
                <th className="text-right px-4 py-3">★</th>
                <th className="text-right px-4 py-3">Prob</th>
                <th className="text-right px-4 py-3">%</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedCards.map(card => {
                const deleteThisCard = deleteCard.bind(null, id, packId, card.id);
                const pct = totalProb > 0 ? (card.probability / totalProb * 100).toFixed(1) : '—';
                return (
                  <tr key={card.id} className="border-t border-gray-800 hover:bg-gray-800">
                    <td className="px-4 py-2 text-gray-500">{card.number}</td>
                    <td className="px-4 py-2 text-gray-200">
                      <div className="flex items-center gap-2">
                        {card.imageUrl && (
                          <img src={card.imageUrl} alt={card.name} className="w-6 h-8 object-cover rounded" />
                        )}
                        {card.name}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right text-yellow-400">{'★'.repeat(card.stars)}</td>
                    <td className="px-4 py-2 text-right text-gray-400">{card.probability}</td>
                    <td className="px-4 py-2 text-right text-gray-500 text-xs">{pct}%</td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/admin/seasons/${id}/packs/${packId}/cards/${card.id}`}
                          className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded"
                        >
                          Edit
                        </Link>
                        <form action={deleteThisCard}>
                          <button
                            type="submit"
                            className="px-2 py-1 text-xs bg-red-900 hover:bg-red-800 text-red-300 rounded"
                          >
                            Del
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {sortedCards.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-500">No cards yet</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Add card */}
        <details className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <summary className="px-4 py-3 cursor-pointer text-sm font-semibold text-gray-300 hover:text-white select-none">
            + Add Card
          </summary>
          <form action={addCard.bind(null, id, packId)} className="px-4 pb-4 pt-2 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Name *</label>
                <input
                  name="name"
                  required
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Image URL</label>
                <input
                  name="imageUrl"
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Stars (1–5) *</label>
                <input
                  name="stars"
                  type="number"
                  min="1"
                  max="5"
                  required
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Probability *</label>
                <input
                  name="probability"
                  type="number"
                  min="1"
                  required
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500"
                />
              </div>
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-gray-950 font-bold rounded-lg text-sm"
            >
              Add Card
            </button>
          </form>
        </details>
      </div>
    </div>
  );
}
