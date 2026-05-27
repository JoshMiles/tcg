import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSeason, getSeasonCards } from '@/lib/kv';

export const dynamic = 'force-dynamic';
import { updateSeason, addCard, deleteCard } from '../../actions';
import { SeasonFields } from '../new/page';

export default async function SeasonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [season, cards] = await Promise.all([getSeason(id), getSeasonCards(id)]);
  if (!season) notFound();

  const sortedCards = [...cards].sort((a, b) => a.number - b.number);

  const updateThisSeason = updateSeason.bind(null, id);

  return (
    <div className="space-y-8 max-w-3xl">
      {/* Season metadata */}
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
              coverImageUrl: season.coverImageUrl,
              accentColor: season.accentColor,
              tearBorderColor: season.tearBorderColor,
              holoMinStars: season.holoMinStars,
              cardTime: season.cardTime,
              cooldownTime: season.cooldownTime,
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

      {/* Cards */}
      <div>
        <h2 className="text-xl font-bold mb-4">Cards ({sortedCards.length})</h2>

        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden mb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-xs uppercase border-b border-gray-800">
                <th className="text-left px-4 py-3">#</th>
                <th className="text-left px-4 py-3">Name</th>
                <th className="text-right px-4 py-3">★</th>
                <th className="text-right px-4 py-3">Prob</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedCards.map(card => {
                const deleteThisCard = deleteCard.bind(null, id, card.id);
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
                    <td className="px-4 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/admin/seasons/${id}/cards/${card.id}`}
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
                  <td colSpan={5} className="px-4 py-6 text-center text-gray-500">No cards yet</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Add card form */}
        <details className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <summary className="px-4 py-3 cursor-pointer text-sm font-semibold text-gray-300 hover:text-white select-none">
            + Add Card
          </summary>
          <form action={addCard.bind(null, id)} className="px-4 pb-4 pt-2 space-y-3">
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
