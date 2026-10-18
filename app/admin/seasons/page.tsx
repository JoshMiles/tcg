import { Icon } from '@/app/components/Icon';
import { PendingButton } from '../components/PendingButton';
import Link from 'next/link';
import { listSeasons, getPacksForSeason } from '@/lib/kv';
import { getActivationPreview, getSeasonStats, getSnapshot, type ActivationPreview, type SeasonStats } from '@/lib/season-wrap';
import { deleteSeasonAction, activateSeason } from '../actions/seasons';
import { discardDraftSeason } from '../draft-actions';
import { duplicateSeasonAction } from '../season-actions';
import { NewSeasonButton } from '../components/NewSeasonButton';
import { ConfirmButton } from '../components/ConfirmButton';
import { StatusChip, DraftChip } from '../components/StatusChip';
import { seasonTiming } from './season-timing';
import { PageHeader, EmptyState } from '../components/ui';

export const metadata = { title: 'Seasons · Admin', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function SeasonsPage() {
  const seasons = await listSeasons();
  // Drafts first, then the active season, then newest.
  seasons.sort((a, b) => Number(b.status === 'draft') - Number(a.status === 'draft') || Number(b.active) - Number(a.active) || b.createdAt - a.createdAt);

  const extras = await Promise.all(
    seasons.map(async s => {
      const published = s.status === 'published';
      const [packs, stats, snapshot, preview] = await Promise.all([
        getPacksForSeason(s),
        published ? getSeasonStats(s).catch((): null => null) : Promise.resolve(null),
        s.endedAt ? getSnapshot(s.id) : Promise.resolve(null),
        published && !s.active ? getActivationPreview(s).catch((): null => null) : Promise.resolve(null),
      ]);
      return { id: s.id, total: packs.length, active: packs.filter(p => p.active).length, stats, snapshot, preview };
    })
  );
  const extraMap = Object.fromEntries(extras.map(({ id, ...v }) => [id, v]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Seasons"
        subtitle={`${seasons.length} season${seasons.length !== 1 ? 's' : ''} · one active at a time · starting one wraps up the one it replaces`}
        actions={<NewSeasonButton />}
      />

      {seasons.length === 0 ? (
        <EmptyState icon="trophy" title="No seasons yet" action={<NewSeasonButton />}>
          A season groups packs and keeps its own collections and leaderboard. Create one, add packs, then activate it.
        </EmptyState>
      ) : (
        <div className="space-y-4">
          {seasons.map(s => {
            const x = extraMap[s.id];
            const packs = { total: x?.total ?? 0, active: x?.active ?? 0 };
            const stats: SeasonStats | null = x?.stats ?? null;
            const preview: ActivationPreview | null = x?.preview ?? null;
            const isDraft = s.status === 'draft';
            const del = isDraft ? discardDraftSeason.bind(null, s.id) : deleteSeasonAction.bind(null, s.id);
            const timing = seasonTiming(s);
            const champion = x?.snapshot?.awards.find(a => a.id === 'champion');
            return (
              <div
                key={s.id}
                className={`rounded-3xl p-[3px] transition-all ${
                  isDraft ? 'bg-gradient-to-r from-amber-700/60 to-gray-800'
                  : s.active ? 'bg-gradient-to-r from-yellow-300 via-yellow-500 to-amber-600 shadow-glow'
                  : 'bg-gradient-to-r from-gray-700 to-gray-800'
                }`}
              >
                <div className="rounded-[1.35rem] bg-gray-900 overflow-hidden">
                  {s.active && <div className="holo-strip" />}
                  <div className="flex flex-wrap items-center gap-x-8 gap-y-4 p-5">
                    <div className="min-w-0 flex-1 basis-64">
                      <div className="flex flex-wrap items-center gap-3">
                        <h2 className="font-display text-2xl font-bold text-white truncate">{s.name || 'Untitled season'}</h2>
                        {isDraft ? <DraftChip /> : <StatusChip active={s.active} />}
                        {s.endedAt && <span className="text-[11px] font-extrabold uppercase tracking-wider rounded-full border border-gray-600 text-gray-400 px-2.5 py-1">Ended</span>}
                        {timing && <span className={`text-[11px] font-bold rounded-full px-2.5 py-1 ${timing.tone === 'soon' ? 'bg-sky-900/40 text-sky-300' : 'bg-gray-800 text-gray-400'}`}>{timing.label}</span>}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-500 font-semibold">
                        <code className="bg-gray-950 border border-gray-800 px-2 py-1 rounded-md text-gray-400">{s.collectionName}</code>
                        <span>Created {new Date(s.createdAt).toLocaleDateString('en-GB', { timeZone: 'UTC' })}</span>
                        {s.endedAt && <span>Ended {new Date(s.endedAt).toLocaleDateString('en-GB', { timeZone: 'UTC' })}</span>}
                        {champion && <span className="inline-flex items-center gap-1 text-yellow-400"><Icon name="trophy" className="w-3.5 h-3.5" />{champion.username}</span>}
                      </div>
                    </div>

                    {stats ? (
                      <dl className="grid grid-cols-4 gap-x-6 gap-y-1 text-center">
                        {[
                          ['Viewers', stats.viewers],
                          ['Pulled', stats.copies.toLocaleString()],
                          ['Found', stats.pool > 0 ? `${Math.round((stats.found / stats.pool) * 100)}%` : '-'],
                          ['Complete', stats.complete],
                        ].map(([label, value]) => (
                          <div key={label as string}>
                            <dd className="font-display text-xl font-bold text-yellow-400 tabular-nums leading-none">{value}</dd>
                            <dt className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mt-1">{label}</dt>
                          </div>
                        ))}
                      </dl>
                    ) : (
                      <div className="text-center">
                        <p className="font-display text-3xl font-bold text-yellow-400 tabular-nums leading-none">{packs.total === 0 ? '-' : `${packs.active}/${packs.total}`}</p>
                        <p className="text-[11px] text-gray-500 font-bold uppercase tracking-wider mt-1">Packs active</p>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2">
                      {!s.active && !isDraft && (
                        <form action={activateSeason.bind(null, s.id)}>
                          <ConfirmButton
                            title={`Activate ${s.name}?`}
                            confirmLabel="Activate"
                            tone="primary"
                            message={
                              <div className="space-y-3">
                                <p>Make <strong className="text-white">{s.name}</strong> the live season? The overlay and Twitch panel switch to it straight away.</p>
                                {preview?.outgoing && (
                                  <p className="rounded-lg border border-gray-700 bg-gray-950/60 px-3 py-2 text-gray-300">
                                    <strong className="text-white">{preview.outgoing.name}</strong> will be wrapped up first: final standings and awards saved ({preview.outgoing.viewers} viewer{preview.outgoing.viewers === 1 ? '' : 's'}, {preview.outgoing.copies.toLocaleString()} cards), trading closed, every collection kept.
                                  </p>
                                )}
                                {preview && preview.warnings.length > 0 && (
                                  <ul className="rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2 space-y-1 text-amber-200">
                                    {preview.warnings.map((w, i) => <li key={i} className="flex gap-2"><span aria-hidden>•</span><span>{w}</span></li>)}
                                  </ul>
                                )}
                              </div>
                            }
                            className="px-3 py-2 text-xs font-bold bg-green-500/10 border border-green-400/30 hover:bg-green-500/20 text-green-300 rounded-xl transition-colors"
                          >
                            {s.endedAt ? 'Reactivate' : 'Activate'}
                          </ConfirmButton>
                        </form>
                      )}
                      <Link href={isDraft ? `/admin/seasons/new?draft=${s.id}` : `/admin/seasons/${s.id}`} className="tcg-btn px-4 py-2 text-sm rounded-xl">
                        {isDraft ? 'Continue setup →' : 'Manage →'}
                      </Link>
                      <form action={duplicateSeasonAction.bind(null, s.id)}>
                        <PendingButton type="submit" title="Duplicate as a draft" aria-label={`Duplicate ${s.name || 'season'}`} className="w-9 h-9 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors"><Icon name="copy" /></PendingButton>
                      </form>
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
