import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPack, getPackCards } from '@/lib/kv';
import { updatePack, deleteCard } from '../../actions';
import { unpublishPack } from '../../draft-actions';
import { DraftChip } from '../../components/StatusChip';
import { PackFields } from '../../components/PackFields';
import { AddCardButton } from '../../components/AddCardButton';
import { ConfirmButton } from '../../components/ConfirmButton';
import { rarityStats, getRarity } from '@/lib/rarity';
import { cardThumbUrl } from '@/lib/card-art';

export const dynamic = 'force-dynamic';

export default async function PackPage({ params }: { params: Promise<{ packId: string }> }) {
  const { packId } = await params;
  const [pack, cards] = await Promise.all([getPack(packId), getPackCards(packId)]);
  if (!pack) notFound();

  const sorted = [...cards].sort((a, b) => a.number - b.number);
  const totalProb = cards.reduce((s, c) => s + c.probability, 0);
  const updateThisPack = updatePack.bind(null, packId);
  const isDraft = pack.status === 'draft';
  const moveToDrafts = unpublishPack.bind(null, packId);

  const rarityBreakdown = rarityStats(cards);

  return (
    <div className="space-y-8">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {pack.coverImageUrl && (
            <img src={pack.coverImageUrl} alt={pack.name} className="w-10 h-14 object-cover rounded-lg" />
          )}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-white">{pack.name}</h1>
              {isDraft ? (
                <DraftChip />
              ) : pack.active ? (
                <span className="text-xs px-2 py-0.5 bg-green-900/50 text-green-400 rounded-full">Active</span>
              ) : (
                <span className="text-xs px-2 py-0.5 bg-gray-800 text-gray-500 rounded-full">Inactive</span>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-0.5">{cards.length} cards · Weight {pack.weight}×</p>
          </div>
        </div>
        <Link href="/admin/packs" className="text-sm text-gray-500 hover:text-white transition-colors">
          ← Packs
        </Link>
      </div>

      {isDraft && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 px-5 py-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-amber-200">
            This pack is a <strong>draft</strong> — it&apos;s never drawn on stream until you publish it.
          </p>
          <Link href={`/admin/packs/new?draft=${packId}`} className="tcg-btn px-4 py-2 text-sm rounded-xl">Continue setup →</Link>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-8">

        {/* ── Left: Cards table ── */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">
              Cards <span className="text-gray-600 font-normal text-base ml-1">({sorted.length})</span>
            </h2>
            <div className="flex items-center gap-2">
              <Link
                href={`/admin/packs/${packId}/cards`}
                className="px-3 py-2 text-sm font-semibold bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-xl transition-colors"
              >
                Bulk edit cards
              </Link>
              <AddCardButton packId={packId} />
            </div>
          </div>

          <div className="tcg-panel rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <th className="text-left px-5 py-3 w-10">#</th>
                  <th className="text-left px-4 py-3">Card</th>
                  <th className="text-right px-4 py-3">Rarity</th>
                  <th className="text-right px-4 py-3 hidden sm:table-cell">Prob</th>
                  <th className="text-right px-4 py-3 hidden sm:table-cell">%</th>
                  <th className="text-right pr-5 pl-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-16 text-center text-gray-600">
                      No cards yet — add your first card →
                    </td>
                  </tr>
                )}
                {sorted.map(card => {
                  const del = deleteCard.bind(null, packId, card.id);
                  const pct = totalProb > 0 ? (card.probability / totalProb * 100).toFixed(1) : '—';
                  const rarity = getRarity(card.stars);
                  return (
                    <tr key={card.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-2.5 text-gray-600 tabular-nums text-xs">{card.number}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          {card.imageUrl ? (
                            <img src={cardThumbUrl(card.imageUrl)} alt={card.name} loading="lazy" className="w-7 h-10 object-cover rounded shrink-0" />
                          ) : (
                            <div className="w-7 h-10 bg-gray-800 rounded shrink-0" />
                          )}
                          <span className="text-gray-200 font-medium">{card.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={`text-xs font-medium ${rarity?.text ?? 'text-gray-400'}`}>
                          {'★'.repeat(card.stars)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-500 tabular-nums hidden sm:table-cell">
                        {card.probability}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-700 text-xs tabular-nums hidden sm:table-cell">
                        {pct}%
                      </td>
                      <td className="pr-5 pl-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link
                            href={`/admin/packs/${packId}/cards/${card.id}`}
                            className="px-2.5 py-1 text-xs bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded-lg transition-colors"
                          >
                            Edit
                          </Link>
                          <form action={del}>
                            <ConfirmButton
                title="Delete card?"
                confirmLabel="Delete card"
                message={<>Delete <strong className="text-white">{card.name}</strong> (#{card.number}) from this pack? Viewers who already pulled it keep the entry in their data, but the card will no longer show anywhere. This can&apos;t be undone.</>}
                className="px-2.5 py-1 text-xs text-red-600 hover:text-red-300 hover:bg-red-950/40 rounded-lg transition-colors"
              >
                Del
              </ConfirmButton>
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

        {/* ── Right: Pack settings ── */}
        <div className="space-y-6">

          {/* Rarity breakdown */}
          {rarityBreakdown.length > 0 && (
            <div className="tcg-panel rounded-2xl p-5 space-y-3">
              <h3 className="text-sm font-semibold text-white">Rarity Mix</h3>
              {rarityBreakdown.map(r => (
                <div key={r.stars} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className={r.text}>{'★'.repeat(r.stars)} {r.label}</span>
                    <span className="text-gray-600">{r.count} cards · {r.pct}%</span>
                  </div>
                  <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                    <div className={`h-full ${r.bar} rounded-full`} style={{ width: `${r.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Draft / publish state */}
          {!isDraft && (
            <form action={moveToDrafts} className="tcg-panel rounded-2xl p-4 flex items-center justify-between gap-3">
              <p className="text-xs text-gray-500">Published. Move it back to drafts to stop it being drawn while you rework it.</p>
              <button type="submit" className="shrink-0 px-3 py-1.5 text-xs font-bold bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg transition-colors">Move to drafts</button>
            </form>
          )}

          {/* Settings form */}
          <div className="tcg-panel rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-800">
              <h3 className="text-sm font-semibold text-white">Pack Settings</h3>
            </div>
            <form action={updateThisPack} className="p-5 space-y-4">
              <PackFields defaults={pack} />
              <button
                type="submit"
                className="w-full px-4 py-2.5 tcg-btn rounded-xl text-sm transition-colors"
              >
                Save Changes
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
