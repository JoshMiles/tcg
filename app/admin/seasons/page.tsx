import { PendingButton } from '../components/PendingButton';
import Link from 'next/link';
import { listSeasons, getPacksForSeason } from '@/lib/kv';
import { deleteSeasonAction, activateSeason } from '../actions';
import { discardDraftSeason } from '../draft-actions';
import { NewSeasonButton } from '../components/NewSeasonButton';
import { ConfirmButton } from '../components/ConfirmButton';
import { StatusChip, DraftChip } from '../components/StatusChip';

export const dynamic = 'force-dynamic';

export default async function SeasonsPage() {
  const seasons = await listSeasons();
  seasons.sort((a, b) => Number(b.status === 'draft') - Number(a.status === 'draft') || b.createdAt - a.createdAt);

  const packStats = await Promise.all(
    seasons.map(async s => {
      const packs = await getPacksForSeason(s);
      return { id: s.id, total: packs.length, active: packs.filter(p => p.active).length };
    })
  );
  const packMap = Object.fromEntries(packStats.map(({ id, ...v }) => [id, v]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Seasons</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {seasons.length} season{seasons.length !== 1 ? 's' : ''} · one active at a time
          </p>
        </div>
        <NewSeasonButton />
      </div>

      {seasons.length === 0 ? (
        <div className="tcg-panel rounded-2xl py-20 text-center space-y-3">
          <p className="text-gray-500">No seasons yet</p>
          <NewSeasonButton />
        </div>
      ) : (
        <div className="space-y-4">
          {seasons.map(s => {
            const packs = packMap[s.id] ?? { total: 0, active: 0 };
            const activate = activateSeason.bind(null, s.id);
            const isDraft = s.status === 'draft';
            const del = isDraft ? discardDraftSeason.bind(null, s.id) : deleteSeasonAction.bind(null, s.id);
            return (
              <div
                key={s.id}
                className={`rounded-3xl p-[3px] transition-all ${
                  isDraft
                    ? 'bg-gradient-to-r from-amber-700/60 to-gray-800'
                    : s.active
                    ? 'bg-gradient-to-r from-yellow-300 via-yellow-500 to-amber-600 shadow-glow'
                    : 'bg-gradient-to-r from-gray-700 to-gray-800'
                }`}
              >
                <div className="rounded-[1.35rem] bg-gray-900 overflow-hidden">
                  {s.active && <div className="holo-strip" />}
                  <div className="flex flex-wrap items-center gap-x-8 gap-y-4 p-5">
                    <div className="min-w-0 flex-1 basis-64">
                      <div className="flex items-center gap-3">
                        <h2 className="font-display text-2xl font-bold text-white truncate">{s.name || 'Untitled season'}</h2>
                        {isDraft ? <DraftChip /> : <StatusChip active={s.active} />}
                      </div>
                      <div className="mt-2 flex items-center gap-3 text-xs text-gray-500 font-semibold">
                        <code className="bg-gray-950 border border-gray-800 px-2 py-1 rounded-md text-gray-400">
                          {s.collectionName}
                        </code>
                        <span>Created {new Date(s.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>

                    <div className="text-center">
                      <p className="font-display text-3xl font-bold text-yellow-400 tabular-nums leading-none">
                        {packs.total === 0 ? '—' : `${packs.active}/${packs.total}`}
                      </p>
                      <p className="text-[11px] text-gray-500 font-bold uppercase tracking-wider mt-1">Packs active</p>
                    </div>

                    <div className="flex items-center gap-2">
                      {!s.active && !isDraft && (
                        <form action={activate}>
                          <PendingButton
                            type="submit"
                            className="px-3 py-2 text-xs font-bold bg-green-500/10 border border-green-400/30 hover:bg-green-500/20 text-green-300 rounded-xl transition-colors"
                          >
                            Activate
                          </PendingButton>
                        </form>
                      )}
                      <Link
                        href={isDraft ? `/admin/seasons/new?draft=${s.id}` : `/admin/seasons/${s.id}`}
                        className="tcg-btn px-4 py-2 text-sm rounded-xl"
                      >
                        {isDraft ? 'Continue setup →' : 'Manage →'}
                      </Link>
                      <form action={del}>
                        <ConfirmButton
                title={isDraft ? 'Discard draft?' : 'Delete season?'}
                confirmLabel={isDraft ? 'Discard draft' : 'Delete season'}
                message={<>{isDraft ? 'Discard' : 'Delete'} <strong className="text-white">{s.name || 'Untitled season'}</strong>? The season and its settings are removed. Packs and viewers&apos; collection data are kept. This can&apos;t be undone.</>}
                className="px-3 py-2 text-xs font-bold text-red-400 hover:text-red-200 hover:bg-red-950/50 rounded-xl transition-colors"
              >
                {isDraft ? 'Discard' : 'Delete'}
              </ConfirmButton>
                      </form>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
