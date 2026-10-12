import { PendingButton } from '../../components/PendingButton';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSeason, getPacksForSeason, listAllPacks } from '@/lib/kv';
import { ConfirmButton } from '../../components/ConfirmButton';
import { updateSeason, addPackToSeason, removePackFromSeason } from '../../actions';
import { SeasonFields } from '../../components/SeasonFields';
import { DraftChip } from '../../components/StatusChip';
import { unpublishSeason } from '../../draft-actions';

export const dynamic = 'force-dynamic';

export default async function SeasonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const season = await getSeason(id);
  if (!season) notFound();

  const [assignedPacks, allPacks] = await Promise.all([
    getPacksForSeason(season),
    listAllPacks(),
  ]);

  const assignedIds = new Set(season.packIds);
  const availablePacks = allPacks.filter(p => !assignedIds.has(p.id));

  const updateThisSeason = updateSeason.bind(null, id);
  const moveToDrafts = unpublishSeason.bind(null, id);
  const addPack = addPackToSeason.bind(null, id);

  return (
    <div className="space-y-8">
      {/* Season settings */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{season.name}</h1>
            {season.status === 'draft' && <DraftChip />}
            {season.active && (
              <span className="text-xs px-2 py-1 bg-green-900/60 text-green-400 rounded-full">Active</span>
            )}
          </div>
          <Link href="/admin/seasons" className="text-sm text-gray-500 hover:text-white transition-colors">
            ← Seasons
          </Link>
        </div>

        {season.status === 'draft' && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 px-5 py-4 mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-amber-200">
              This season is a <strong>draft</strong> — it can&apos;t be activated until you create it.
            </p>
            <Link href={`/admin/seasons/new?draft=${id}`} className="tcg-btn px-4 py-2 text-sm rounded-xl">Continue setup →</Link>
          </div>
        )}

        {season.status === 'published' && (
          <form action={moveToDrafts} className="tcg-panel rounded-xl p-4 mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-gray-500 max-w-xl leading-relaxed">
              <strong className="text-gray-300">Published.</strong> Move it back to a draft to take it off the public site while you rework it. Viewers&apos; cards, the season&apos;s packs and its settings are all kept.
              {season.active && <span className="text-amber-300"> This is the active season, so the overlay and Twitch panel will have no season until you activate another.</span>}
            </p>
            <ConfirmButton
              title="Move season to drafts?"
              confirmLabel="Move to drafts"
              message={<>Move <strong className="text-white">{season.name}</strong> back to a draft?{season.active ? ' It is the active season, so it will stop being active: nothing can be drawn on stream until you publish and activate a season again.' : ''} Viewers&apos; collections and all settings are kept, and you can publish it again from the Seasons list.</>}
              className="shrink-0 px-3 py-1.5 text-xs font-bold bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg transition-colors"
            >
              Move to drafts
            </ConfirmButton>
          </form>
        )}

        <form action={updateThisSeason} className="tcg-panel rounded-xl p-6 space-y-4">
          <SeasonFields
            defaults={{
              name: season.name,
              collectionName: season.collectionName,
              maxConcurrentPacks: season.maxConcurrentPacks,
              active: season.active,
              canActivate: season.status === 'published',
            }}
          />
          <div className="pt-2">
            <PendingButton
              type="submit"
              className="px-5 py-2 tcg-btn rounded-lg text-sm transition-colors"
            >
              Save Changes
            </PendingButton>
          </div>
        </form>
      </div>

      {/* Pack assignment */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold">Packs in this Season</h2>
            <p className="text-sm text-gray-500 mt-0.5">Packs are drawn randomly by weight when this season is active</p>
          </div>
          <Link href="/admin/packs/new" className="text-sm text-yellow-500 hover:text-yellow-400 transition-colors">
            + New Pack
          </Link>
        </div>

        {/* Assigned packs */}
        <div className="space-y-2 mb-4">
          {assignedPacks.length === 0 ? (
            <div className="tcg-panel rounded-xl p-8 text-center text-gray-600">
              No packs assigned. Add packs from your library below.
            </div>
          ) : (
            assignedPacks.map(pack => {
              const remove = removePackFromSeason.bind(null, id, pack.id);
              return (
                <div
                  key={pack.id}
                  className="tcg-panel rounded-xl p-3 flex items-center gap-3"
                >
                  {pack.coverImageUrl ? (
                    <img src={pack.coverImageUrl} alt={pack.name} loading="lazy" className="w-9 h-12 object-cover rounded shrink-0" />
                  ) : (
                    <div className="w-9 h-12 bg-gray-800 rounded shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white text-sm">{pack.name}</span>
                      {pack.status === 'draft' ? (
                        <span className="text-xs px-1.5 py-0.5 bg-amber-900/50 text-amber-300 rounded-md">Draft</span>
                      ) : pack.active ? (
                        <span className="text-xs px-1.5 py-0.5 bg-green-900/60 text-green-400 rounded-md">Active</span>
                      ) : (
                        <span className="text-xs px-1.5 py-0.5 bg-gray-800 text-gray-500 rounded-md">Inactive</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">Weight {pack.weight}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Link
                      href={`/admin/packs/${pack.id}`}
                      className="px-2.5 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded transition-colors"
                    >
                      Edit
                    </Link>
                    <form action={remove}>
                      <ConfirmButton
                title="Remove pack from season?"
                confirmLabel="Remove"
                message={<>Remove <strong className="text-white">{pack.name}</strong> from this season? The pack itself is kept and can be added back.</>}
                className="px-2.5 py-1 text-xs bg-red-900/50 hover:bg-red-900 text-red-400 rounded transition-colors"
              >
                Remove
              </ConfirmButton>
                    </form>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Add pack from library */}
        {availablePacks.length > 0 && (
          <form action={addPack} className="flex gap-2">
            <select
              name="packId"
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500 transition-colors"
            >
              <option value="">Select a pack to add…</option>
              {availablePacks.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <PendingButton
              type="submit"
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors shrink-0"
            >
              Add to Season
            </PendingButton>
          </form>
        )}

        {availablePacks.length === 0 && allPacks.length > 0 && (
          <p className="text-sm text-gray-600 text-center">All packs are already assigned to this season.</p>
        )}

        {allPacks.length === 0 && (
          <div className="text-center py-4">
            <Link href="/admin/packs/new" className="text-sm text-yellow-500 hover:text-yellow-400 transition-colors">
              Create a pack first →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
