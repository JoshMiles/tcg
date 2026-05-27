import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPack, getPackCards } from '@/lib/kv';
import { updatePack, addCard, deleteCard } from '../../actions';
import { PackFields } from '../../components/PackFields';

export const dynamic = 'force-dynamic';

export default async function PackPage({ params }: { params: Promise<{ packId: string }> }) {
  const { packId } = await params;
  const [pack, cards] = await Promise.all([getPack(packId), getPackCards(packId)]);
  if (!pack) notFound();

  const sortedCards = [...cards].sort((a, b) => a.number - b.number);
  const totalProb = cards.reduce((s, c) => s + c.probability, 0);

  const tierStats: Record<number, { count: number; prob: number }> = {};
  for (const c of cards) {
    if (!tierStats[c.stars]) tierStats[c.stars] = { count: 0, prob: 0 };
    tierStats[c.stars].count++;
    tierStats[c.stars].prob += c.probability;
  }

  const updateThisPack = updatePack.bind(null, packId);

  return (
    <div className="space-y-8 max-w-3xl">
      {/* Pack settings */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{pack.name}</h1>
            {pack.active ? (
              <span className="text-xs px-2 py-1 bg-green-900/60 text-green-400 rounded-full">Active</span>
            ) : (
              <span className="text-xs px-2 py-1 bg-gray-800 text-gray-500 rounded-full">Inactive</span>
            )}
          </div>
          <Link href="/admin/packs" className="text-sm text-gray-500 hover:text-white transition-colors">
            ← Packs
          </Link>
        </div>

        <form action={updateThisPack} className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
          <PackFields defaults={pack} />
          <div className="pt-2">
            <button
              type="submit"
              className="px-5 py-2 bg-yellow-500 hover:bg-yellow-400 text-gray-950 font-bold rounded-lg text-sm transition-colors"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>

      {/* Cards */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">
            Cards
            <span className="ml-2 text-base font-normal text-gray-500">({sortedCards.length})</span>
          </h2>
          {totalProb > 0 && (
            <div className="flex gap-3 text-xs text-gray-500">
              {[5, 4, 3, 2, 1].map(star => {
                const t = tierStats[star];
                if (!t) return null;
                const pct = Math.round(t.prob / totalProb * 100);
                return (
                  <span key={star} className="flex items-center gap-1">
                    <span className="text-yellow-500">{'★'.repeat(star)}</span>
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
              <tr className="text-gray-600 text-xs uppercase border-b border-gray-800">
                <th className="text-left px-4 py-3 w-10">#</th>
                <th className="text-left px-4 py-3">Name</th>
                <th className="text-right px-4 py-3">Stars</th>
                <th className="text-right px-4 py-3">Prob</th>
                <th className="text-right px-4 py-3">%</th>
                <th className="text-right px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {sortedCards.map(card => {
                const del = deleteCard.bind(null, packId, card.id);
                const pct = totalProb > 0 ? (card.probability / totalProb * 100).toFixed(1) : '—';
                return (
                  <tr key={card.id} className="border-t border-gray-800/60 hover:bg-gray-800/40 transition-colors">
                    <td className="px-4 py-2.5 text-gray-600 tabular-nums">{card.number}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        {card.imageUrl ? (
                          <img src={card.imageUrl} alt={card.name} className="w-6 h-8 object-cover rounded" />
                        ) : (
                          <div className="w-6 h-8 bg-gray-800 rounded shrink-0" />
                        )}
                        <span className="text-gray-200">{card.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right text-yellow-500">{'★'.repeat(card.stars)}</td>
                    <td className="px-4 py-2.5 text-right text-gray-400 tabular-nums">{card.probability}</td>
                    <td className="px-4 py-2.5 text-right text-gray-600 text-xs tabular-nums">{pct}%</td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex justify-end gap-1.5">
                        <Link
                          href={`/admin/packs/${packId}/cards/${card.id}`}
                          className="px-2.5 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded transition-colors"
                        >
                          Edit
                        </Link>
                        <form action={del}>
                          <button
                            type="submit"
                            className="px-2.5 py-1 text-xs bg-red-900/50 hover:bg-red-900 text-red-400 rounded transition-colors"
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
                  <td colSpan={6} className="px-4 py-10 text-center text-gray-600">
                    No cards yet — add one below
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Add card */}
        <details className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden group">
          <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-gray-400 hover:text-white select-none transition-colors group-open:text-white group-open:border-b group-open:border-gray-800">
            + Add Card
          </summary>
          <form action={addCard.bind(null, packId)} className="px-4 pb-4 pt-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Name *</label>
                <input name="name" required className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500 transition-colors" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Image URL</label>
                <input name="imageUrl" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500 transition-colors" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Stars (1–5) *</label>
                <input name="stars" type="number" min="1" max="5" required className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500 transition-colors" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Probability *</label>
                <input name="probability" type="number" min="1" required className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500 transition-colors" />
              </div>
            </div>
            <button type="submit" className="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-gray-950 font-bold rounded-lg text-sm transition-colors">
              Add Card
            </button>
          </form>
        </details>
      </div>
    </div>
  );
}
