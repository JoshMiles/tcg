import { staffPage } from '@/lib/staff-guard';
import { Icon } from '@/app/components/Icon';
import { PendingButton } from '../../components/PendingButton';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSeason, getPacksForSeason, getPackCards, listAllPacks } from '@/lib/kv';
import { getSeasonLeaderboard } from '@/lib/leaderboard';
import { getSeasonStats, getSnapshot, getActivationPreview } from '@/lib/season-wrap';
import { bucketsFor, getSeries } from '@/lib/stats';
import { ConfirmButton } from '../../components/ConfirmButton';
import { updateSeason, addPackToSeason, activateSeason } from '../../actions/seasons';
import { duplicateSeasonAction, endSeasonAction, reopenSeasonAction } from '../../season-actions';
import { SeasonFields } from '../../components/SeasonFields';
import { DraftChip } from '../../components/StatusChip';
import { NewPackButton } from '../../components/NewPackButton';
import { unpublishSeason } from '../../draft-actions';
import { StackedBars } from '../../dashboard/charts';
import { LineupEditor, type LineupPack } from './LineupEditor';
import { seasonTiming } from '../season-timing';
import { PageTabs, pickTab, type PageTab } from '../../components/PageTabs';
import { Tile } from '../../components/ui';

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

// The tab shows which season this is (the page is rendered on the server, so a fixed locale and zone keep it the same for everyone).
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const season = await getSeason((await params).id);
  return { title: `${season?.name || 'Season'} · Admin`, robots: { index: false } };
}

/** Dates here are rendered on the server, so say which clock they are on: UTC, in a fixed format. */
const when = (ms: number) => `${new Date(ms).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })} UTC`;
export default async function SeasonPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; error?: string }> }) {
  await staffPage('admin');
  const { id } = await params;
  const { tab: tabParam, error } = await searchParams;
  const season = await getSeason(id);
  if (!season) notFound();

  const [assignedPacks, allPacks, snapshot] = await Promise.all([getPacksForSeason(season), listAllPacks(), getSnapshot(id)]);
  const isPublished = season.status === 'published';
  const [stats, board, series, preview, cardCounts] = await Promise.all([
    isPublished ? getSeasonStats(season) : Promise.resolve(null),
    isPublished ? getSeasonLeaderboard(season).catch(() => null) : Promise.resolve(null),
    isPublished ? (() => { const b = bucketsFor('season', season.startsAt ?? season.createdAt); return getSeries(season.collectionName, b.starts, b.step); })() : Promise.resolve(null),
    isPublished && !season.active ? getActivationPreview(season) : Promise.resolve(null),
    Promise.all(assignedPacks.map(async p => (await getPackCards(p.id)).length)),
  ]);

  const assignedIds = new Set(season.packIds);
  const availablePacks = allPacks.filter(p => !assignedIds.has(p.id));
  const lineup: LineupPack[] = assignedPacks.map((p, i) => ({
    id: p.id, name: p.name, coverImageUrl: p.coverImageUrl, weight: p.weight, status: p.status, active: p.active, cards: cardCounts[i],
    archived: (p as { archived?: boolean }).archived === true,
  }));
  const timing = seasonTiming(season);
  const tabs: PageTab[] = [
    ...(isPublished ? [{ id: 'overview', label: 'Overview', icon: 'chart' } as PageTab] : []),
    { id: 'packs', label: 'Pack lineup', icon: 'cards', count: lineup.length },
    { id: 'settings', label: 'Settings', icon: 'settings' },
    ...(isPublished ? [{ id: 'wrapup', label: 'Wrap-up', icon: 'trophy' } as PageTab] : []),
  ];
  const tab = pickTab(tabs, tabParam);

  const updateThisSeason = updateSeason.bind(null, id);
  const moveToDrafts = unpublishSeason.bind(null, id);
  const addPack = addPackToSeason.bind(null, id);
  const dayLabels = series ? series.starts.map(s => new Date(s).toLocaleDateString('en-GB', { month: 'short', day: 'numeric', timeZone: 'UTC' })) : [];
  const sumArr = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-8">
      {/* ── Header ── */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold text-white wrap-break-word">{season.name}</h1>
            {season.status === 'draft' && <DraftChip />}
            {season.active && <span className="text-xs px-2 py-1 bg-green-900/60 text-green-400 rounded-full">Active</span>}
            {season.endedAt && <span className="text-xs px-2 py-1 bg-gray-800 text-gray-300 rounded-full">Ended {when(season.endedAt)}</span>}
            {season.tradingFrozen && <span className="text-xs px-2 py-1 bg-amber-900/40 text-amber-300 rounded-full">Trading closed</span>}
            {timing && <span className={`text-xs px-2 py-1 rounded-full ${timing.tone === 'soon' ? 'bg-sky-900/40 text-sky-300' : 'bg-gray-800 text-gray-400'}`}>{timing.label}</span>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isPublished && !season.active && (
              <form action={activateSeason.bind(null, id)}>
                <ConfirmButton
                  title={`Activate ${season.name}?`}
                  confirmLabel="Activate"
                  tone="primary"
                  message={<ActivationMessage name={season.name} preview={preview} />}
                  className="px-3.5 py-2 text-sm font-bold bg-green-500/10 border border-green-400/30 hover:bg-green-500/20 text-green-300 rounded-xl transition-colors"
                >
                  <Icon name="play" className="mr-1.5" />{season.endedAt ? 'Reactivate' : 'Activate'}
                </ConfirmButton>
              </form>
            )}
            <form action={duplicateSeasonAction.bind(null, id)}>
              <PendingButton type="submit" pendingLabel="Duplicating…" className="px-3.5 py-2 text-sm font-semibold rounded-xl border border-gray-700 text-gray-200 hover:border-gray-500 hover:bg-white/5 transition-colors" title="Copy the pack lineup and settings into a new draft season">
                <Icon name="copy" className="mr-1.5" />Duplicate
              </PendingButton>
            </form>
            <Link href="/admin/seasons" className="text-sm text-gray-500 hover:text-white transition-colors">← Seasons</Link>
          </div>
        </div>
        {(season.startsAt || season.endsAt) && (
          <p className="text-xs text-gray-500">
            {season.startsAt && <>Starts {when(season.startsAt)}{season.autoStart ? ' (switches on automatically)' : ''}</>}
            {season.startsAt && season.endsAt && ' · '}
            {season.endsAt && <>Ends {when(season.endsAt)}</>}
          </p>
        )}
      </div>

      {season.status === 'draft' && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 px-5 py-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-amber-200">This season is a <strong>draft</strong>: it can&apos;t be activated until you create it.</p>
          <Link href={`/admin/seasons/new?draft=${id}`} className="btn btn-primary px-4 py-2 text-sm rounded-xl">Continue setup →</Link>
        </div>
      )}

      <PageTabs tabs={tabs} active={tab} base={`/admin/seasons/${id}`} label="Season sections" />

      {/* ── Overview ── */}
      {tab === 'overview' && isPublished && stats && (
        <section className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <Tile label="Viewers" value={stats.viewers} />
            <Tile label="Pulls" value={stats.copies.toLocaleString()} sub={stats.days > 0 ? `${Math.round(stats.copies / stats.days).toLocaleString()} per day` : undefined} />
            <Tile label="Cards found" value={`${stats.found}/${stats.pool}`} sub={stats.pool > 0 ? `${Math.round((stats.found / stats.pool) * 100)}% of the pool` : undefined} />
            <Tile label="Complete sets" value={stats.complete} />
            <Tile label="Avg completion" value={`${stats.avgCompletion}%`} sub={stats.top ? `best: ${stats.top.username}` : undefined} />
            <Tile label={season.endedAt ? 'Ran for' : 'Running'} value={`${stats.days} day${stats.days === 1 ? '' : 's'}`} />
          </div>
          <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
            <div className="card rounded-2xl p-5 space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-sm font-semibold text-white">Pulls per day</h3>
                <span className="text-xs text-gray-500">{sumArr(series?.data.pull ?? []).toLocaleString()} pulls · {sumArr(series?.data['v:shiny'] ?? [])} FH</span>
              </div>
              {series && sumArr(series.data.pull) > 0 ? (
                <StackedBars
                  labels={dayLabels}
                  layers={[
                    { label: 'Regular', color: '#64748b', values: series.data.pull.map((n, i) => Math.max(0, n - series.data['v:reverse'][i] - series.data['v:full'][i] - series.data['v:shiny'][i])) },
                    { label: 'Reverse Holo', color: '#8b5cf6', values: series.data['v:reverse'] },
                    { label: 'Full Art', color: '#0ea5e9', values: series.data['v:full'] },
                    { label: 'Full Art Holo', color: '#f59e0b', values: series.data['v:shiny'] },
                  ]}
                />
              ) : <p className="text-sm text-gray-600 py-6">No pulls counted yet{series?.since ? '' : ' (charts fill in from the first pull after tracking started)'}.</p>}
            </div>
            <div className="card rounded-2xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-800 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Top collectors</h3>
                <Link href={`/leaderboard/${id}`} target="_blank" className="text-xs text-yellow-500 hover:text-yellow-300">Leaderboard ↗</Link>
              </div>
              {!board || board.rows.length === 0 ? <p className="px-5 py-8 text-center text-sm text-gray-600">No collectors yet.</p> : (
                <ol className="divide-y divide-gray-800/60">
                  {board.rows.slice(0, 6).map((r, i) => (
                    <li key={r.username} className="px-5 py-2 flex items-center gap-3 text-sm">
                      <span className="w-5 text-gray-600 tabular-nums">{i + 1}</span>
                      <Link href={`/admin/users/${r.username}`} className="flex-1 min-w-0 truncate font-mono text-gray-200 hover:text-white">{r.username}{r.complete && <Icon name="cheese" className="ml-1 text-yellow-400" />}</Link>
                      <span className="text-xs text-gray-500 tabular-nums">{r.uniqueCards} collected</span>
                      <span className="font-bold text-yellow-400 tabular-nums">{r.score.toLocaleString()}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </section>
      )}

      {tab === 'settings' && error && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-950/20 px-4 py-3 text-sm text-red-300">Not saved: {error}</p>}
      {tab === 'settings' && (
        <div className="grid gap-6 xl:grid-cols-2 items-start">
          <form action={updateThisSeason} className="card rounded-xl p-6 space-y-4 xl:col-start-1">
            <h2 className="text-lg font-semibold text-white">Settings</h2>
            <SeasonFields
              defaults={{
                name: season.name, collectionName: season.collectionName, maxConcurrentPacks: season.maxConcurrentPacks,
                active: season.active, canActivate: isPublished, startsAt: season.startsAt, endsAt: season.endsAt, autoStart: season.autoStart,
              }}
            />
            <div className="pt-2">
              <PendingButton type="submit" className="px-5 py-2 btn btn-primary rounded-lg text-sm transition-colors">Save Changes</PendingButton>
            </div>
          </form>
          {isPublished && (
            <form action={moveToDrafts} className="xl:col-start-2 xl:row-start-1 card rounded-xl p-5 flex flex-wrap items-center justify-between gap-3">
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
        </div>
      )}

      {tab === 'wrapup' && isPublished && (
        <div className="grid gap-6 xl:grid-cols-2 items-start">
        {/* Wrap-up */}
        {isPublished && (
          <section className="card rounded-xl p-6 space-y-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2"><Icon name="trophy" className="text-yellow-500/90" />Wrap-up</h2>
            {season.active && (
              <form action={endSeasonAction.bind(null, id)} className="space-y-3">
                <p className="text-sm text-gray-400 leading-relaxed">Ending the season saves the <strong className="text-gray-200">final standings and awards</strong>, takes it off the air (nothing is drawn until you activate another season) and keeps every collection. Starting another season does this automatically for the one it replaces.</p>
                <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                  <input type="checkbox" name="freezeTrading" value="on" defaultChecked className="toggle toggle-sm toggle-primary" />Close trading for this season
                </label>
                <ConfirmButton
                  title={`End ${season.name}?`}
                  confirmLabel="End season"
                  message={<>End <strong className="text-white">{season.name}</strong> now? The final standings and awards are saved, and the overlay and Twitch panel will have no active season until you activate another. You can reopen it later.</>}
                  className="px-4 py-2 text-sm font-bold bg-amber-500/10 border border-amber-400/30 hover:bg-amber-500/20 text-amber-200 rounded-xl transition-colors"
                >
                  End season &amp; save standings
                </ConfirmButton>
              </form>
            )}
            {season.endedAt && (
              <form action={reopenSeasonAction.bind(null, id)} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-gray-950/50 border border-gray-800 px-4 py-3">
                <p className="text-sm text-gray-400">Ended {when(season.endedAt)}.{season.tradingFrozen ? ' Trading is closed.' : ''}</p>
                <PendingButton type="submit" className="px-3 py-1.5 text-xs font-bold bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg transition-colors">Reopen (open trading)</PendingButton>
              </form>
            )}
            {!season.active && !season.endedAt && <p className="text-sm text-gray-500">Not active, so there is nothing to wrap up yet. When it has run and ends, its final standings and awards are saved here.</p>}

            {snapshot && (
              <div className="space-y-3">
                <p className="text-xs uppercase tracking-wider font-bold text-gray-500">Final standings · saved {when(snapshot.at)}</p>
                {snapshot.awards.length > 0 && (
                  <ul className="grid gap-1.5">
                    {snapshot.awards.slice(0, 12).map((a, i) => (
                      <li key={`${a.id}-${a.username}-${i}`} className="flex items-center gap-2.5 rounded-lg bg-gray-950/50 border border-gray-800 px-3 py-2 text-sm">
                        <Icon name={a.icon} className="text-yellow-400" />
                        <span className="font-semibold text-gray-200">{a.title}</span>
                        <Link href={`/admin/users/${a.username}`} className="font-mono text-gray-400 hover:text-white truncate">{a.username}</Link>
                        <span className="ml-auto text-xs text-gray-500 shrink-0">{a.detail}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <ol className="divide-y divide-gray-800/60 rounded-lg border border-gray-800 overflow-hidden">
                  {snapshot.standings.slice(0, 10).map((r, i) => (
                    <li key={r.username} className="px-3 py-1.5 flex items-center gap-3 text-sm">
                      <span className="w-5 text-gray-600 tabular-nums">{i + 1}</span>
                      <span className="flex-1 min-w-0 truncate font-mono text-gray-300">{r.username}</span>
                      <span className="font-bold text-yellow-400 tabular-nums">{r.score.toLocaleString()}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </section>
        )}
        </div>
      )}

      {/* ── Pack lineup ── */}
      {tab === 'packs' && (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">Pack lineup</h2>
            <p className="text-sm text-gray-500 mt-0.5">Packs are drawn randomly by weight while this season is active. Drag to reorder; edit weights in place.</p>
          </div>
          <NewPackButton label="+ New Pack" className="text-sm text-yellow-500 hover:text-yellow-400 transition-colors" />
        </div>

        <LineupEditor seasonId={id} initial={lineup} />

        {availablePacks.length > 0 && (
          <form action={addPack} className="flex gap-2">
            <select name="packId" className="select flex-1 min-w-0">
              <option value="">Select a pack to add…</option>
              {availablePacks.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <PendingButton type="submit" className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors shrink-0">Add to Season</PendingButton>
          </form>
        )}
        {availablePacks.length === 0 && allPacks.length > 0 && <p className="text-sm text-gray-600 text-center">All packs are already assigned to this season.</p>}
        {allPacks.length === 0 && (
          <div className="text-center py-4"><NewPackButton label="Create a pack first →" className="text-sm text-yellow-500 hover:text-yellow-400 transition-colors" /></div>
        )}
      </div>
      )}
    </div>
  );
}

/** The body of the activation confirmation: what gets wrapped up, and anything to fix first. */
function ActivationMessage({ name, preview }: { name: string; preview: Awaited<ReturnType<typeof getActivationPreview>> | null }) {
  return (
    <div className="space-y-3">
      <p>Make <strong className="text-white">{name}</strong> the live season? The overlay and Twitch panel switch to it straight away.</p>
      {preview?.outgoing && (
        <p className="rounded-lg border border-gray-700 bg-gray-950/60 px-3 py-2 text-gray-300">
          <strong className="text-white">{preview.outgoing.name}</strong> will be wrapped up first: its final standings and awards are saved ({preview.outgoing.viewers} viewer{preview.outgoing.viewers === 1 ? '' : 's'}, {preview.outgoing.copies.toLocaleString()} cards), trading for it is closed, and every collection is kept.
        </p>
      )}
      {preview && preview.warnings.length > 0 && (
        <ul className="rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2 space-y-1 text-amber-200">
          {preview.warnings.map((w, i) => <li key={i} className="flex gap-2"><span aria-hidden>•</span><span>{w}</span></li>)}
        </ul>
      )}
    </div>
  );
}
