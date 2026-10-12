import { Icon } from '@/app/components/Icon';
import { PendingButton } from '../../components/PendingButton';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPack, getPackCards, listSeasons } from '@/lib/kv';
import { getPackOverrides } from '@/lib/overlay-settings';
import { updatePack, deleteCard, setPackActive, deletePackAction } from '../../actions';
import { unpublishPack } from '../../draft-actions';
import { DraftChip, StatusChip } from '../../components/StatusChip';
import { CardFilter } from './CardFilter';
import { PackVariantsPanel, CardToggles, BulkBar } from './VariantControls';
import { PackFields } from '../../components/PackFields';
import { AddCardButton } from '../../components/AddCardButton';
import { ConfirmButton } from '../../components/ConfirmButton';
import { rarityStats, getRarity } from '@/lib/rarity';
import { cardThumbUrl } from '@/lib/card-art';

export const dynamic = 'force-dynamic';

export default async function PackPage({ params }: { params: Promise<{ packId: string }> }) {
  const { packId } = await params;
  const [pack, cards, seasons, overrides] = await Promise.all([getPack(packId), getPackCards(packId), listSeasons(), getPackOverrides().catch((): Record<string, unknown> => ({}))]);
  if (!pack) notFound();
  const inSeasons = seasons.filter(s => s.packIds.includes(packId));
  const hasOverrides = Object.keys(overrides[packId] ?? {}).length > 0;
  const starLevels = [...new Set(cards.map(c => c.stars))].sort((a, b) => b - a);

  const sorted = [...cards].sort((a, b) => a.number - b.number);
  const totalProb = cards.reduce((s, c) => s + c.probability, 0);
  const updateThisPack = updatePack.bind(null, packId);
  const isDraft = pack.status === 'draft';
  const moveToDrafts = unpublishPack.bind(null, packId);

  const rarityBreakdown = rarityStats(cards);

  return (
    <div className="space-y-8">

      {/* ── Header ── */}
      <div className="space-y-4">
        <Link href="/admin/packs" className="inline-block text-sm text-gray-500 hover:text-white transition-colors">← All packs</Link>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            {pack.coverImageUrl && (
              <img src={pack.coverImageUrl} alt="" className="w-14 h-20 object-cover rounded-xl border border-white/10 shrink-0" />
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-2xl font-bold text-white truncate">{pack.name}</h1>
                {isDraft ? <DraftChip /> : <StatusChip active={pack.active} />}
                {pack.upgradesEnabled && <span className="text-[11px] font-extrabold uppercase tracking-wider text-purple-300 bg-purple-500/10 border border-purple-400/30 rounded-full px-2.5 py-0.5"><Icon name="sparkles" className="mr-1" />Upgrades</span>}
              </div>
              <p className="text-sm text-gray-500 mt-1">{cards.length} cards · Draw weight {pack.weight}×</p>
            </div>
          </div>

          {/* Quick actions */}
          <div className="flex flex-wrap items-center gap-2">
            {!isDraft && (
              <form action={setPackActive.bind(null, packId, !pack.active)}>
                <PendingButton type="submit" className="px-3.5 py-2 text-sm font-semibold rounded-xl border border-gray-700 text-gray-200 hover:border-gray-500 hover:bg-white/5 transition-colors">
                  {pack.active ? 'Deactivate' : 'Activate'}
                </PendingButton>
              </form>
            )}
            <Link
              href={`/admin/overlay?scope=${packId}`}
              className="px-3.5 py-2 text-sm font-semibold rounded-xl border border-gray-700 text-gray-200 hover:border-yellow-500/60 hover:text-yellow-300 transition-colors"
              title="Open the Overlay Editor with this pack's overrides"
            >
              <Icon name="palette" className="mr-1.5" />Overlay look{hasOverrides ? ' ●' : ''}
            </Link>
          </div>
        </div>
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
            <div className="flex flex-wrap items-center gap-2">
              {pack.upgradesEnabled && <BulkBar packId={packId} />}
              <Link
                href={`/admin/packs/${packId}/cards`}
                className="px-3 py-2 text-sm font-semibold bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-xl transition-colors"
              >
                Bulk edit cards
              </Link>
              <AddCardButton packId={packId} />
            </div>
          </div>

          <CardFilter total={sorted.length} stars={starLevels} />

          <div className="tcg-panel rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <th className="text-left px-5 py-3 w-10">#</th>
                  <th className="text-left px-4 py-3">Card</th>
                  <th className="text-right px-4 py-3">Rarity</th>
                  <th className="text-right px-4 py-3 hidden md:table-cell">Variants</th>
                  <th className="text-right px-4 py-3 hidden sm:table-cell">Prob</th>
                  <th className="text-right px-4 py-3 hidden sm:table-cell">%</th>
                  <th className="text-right pr-5 pl-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-16 text-center text-gray-600">
                      No cards yet — add your first card →
                    </td>
                  </tr>
                )}
                {sorted.map(card => {
                  const del = deleteCard.bind(null, packId, card.id);
                  const pct = totalProb > 0 ? (card.probability / totalProb * 100).toFixed(1) : '—';
                  const rarity = getRarity(card.stars);
                  return (
                    <tr key={card.id} data-card data-stars={card.stars} data-search={`${card.name} ${card.number}`.toLowerCase()} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-2.5 text-gray-600 tabular-nums text-xs">{card.number}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          {card.imageUrl ? (
                            <img src={cardThumbUrl(card.imageUrl)} alt={card.name} loading="lazy" className="w-7 h-10 object-cover rounded shrink-0" />
                          ) : (
                            <div className="w-7 h-10 bg-gray-800 rounded shrink-0" />
                          )}
                          <Link href={`/admin/packs/${packId}/cards/${card.id}`} className="text-gray-200 font-medium hover:text-yellow-300 transition-colors">{card.name}</Link>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={`text-xs font-medium ${rarity?.text ?? 'text-gray-400'}`}>
                          {'★'.repeat(card.stars)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right hidden md:table-cell">
                        <CardToggles
                          packId={packId}
                          cardId={card.id}
                          packUpgrades={pack.upgradesEnabled}
                          upgrades={card.upgradesEnabled !== false}
                          disabled={card.disabledVariants ?? []}
                          packDisabled={pack.disabledVariants ?? []}
                          hasFullArt={!!card.fullArtImageUrl}
                        />
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

          {/* Where it's used */}
          <div className="tcg-panel rounded-2xl p-5 space-y-3">
            <h3 className="text-sm font-semibold text-white">Used in</h3>
            {inSeasons.length > 0 ? (
              <ul className="space-y-1.5">
                {inSeasons.map(s => (
                  <li key={s.id}>
                    <Link href={`/admin/seasons/${s.id}`} className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 bg-white/[0.03] hover:bg-white/[0.07] text-sm text-gray-200 transition-colors">
                      <span className="truncate">{s.name}</span>
                      {s.active && <span className="text-[10px] font-extrabold uppercase tracking-wider text-yellow-300">Active season</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-amber-300">
                {isDraft ? 'Not in a season yet.' : 'Not in any season, so this pack is never drawn.'}{' '}
                <Link href="/admin/seasons" className="underline hover:text-amber-100">Add it to a season →</Link>
              </p>
            )}
          </div>

          <PackVariantsPanel packId={packId} upgradesEnabled={pack.upgradesEnabled} disabled={pack.disabledVariants ?? []} weights={pack.variantWeights} />

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
              <PendingButton type="submit" className="shrink-0 px-3 py-1.5 text-xs font-bold bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg transition-colors">Move to drafts</PendingButton>
            </form>
          )}

          {/* Settings form */}
          <div className="tcg-panel rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-800">
              <h3 className="text-sm font-semibold text-white">Pack Settings</h3>
            </div>
            <form action={updateThisPack} className="p-5 space-y-4">
              <PackFields defaults={pack} />
              <div className="sticky bottom-0 -mx-5 -mb-5 px-5 py-3 bg-gray-900/95 backdrop-blur border-t border-gray-800">
                <PendingButton type="submit" className="w-full px-4 py-2.5 tcg-btn rounded-xl text-sm transition-colors">Save Changes</PendingButton>
              </div>
            </form>
          </div>

          {/* Danger zone */}
          <div className="rounded-2xl border border-red-500/20 p-5 space-y-3">
            <h3 className="text-sm font-semibold text-red-300">Danger zone</h3>
            <p className="text-xs text-gray-500">Deleting removes the pack and its cards, and takes it out of every season. Viewers keep any entries they already pulled in their data.</p>
            <form action={deletePackAction.bind(null, packId)}>
              <ConfirmButton
                title="Delete pack?"
                confirmLabel="Delete pack"
                message={<>Delete <strong className="text-white">{pack.name}</strong>? Its cards are deleted and it is removed from every season. This can&apos;t be undone.</>}
                className="px-3.5 py-2 text-sm font-bold text-red-400 hover:text-red-200 hover:bg-red-950/50 border border-red-500/30 rounded-xl transition-colors"
              >
                Delete this pack
              </ConfirmButton>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
