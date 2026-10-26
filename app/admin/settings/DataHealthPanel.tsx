import Link from 'next/link';
import { formatBytes, loadDataHealth, BLOB_WARN_BYTES, BLOB_HIGH_BYTES, type HealthLevel } from '@/lib/data-health';
import { getActiveSeason, OLD_COPY_DAYS } from '@/lib/kv';
import { deleteOldCollectionCopiesAction, finishMoveAction, releaseStuckEscrowAction } from '../trade-actions';
import { PendingButton } from '@/app/components/PendingButton';
import { Panel, Chip } from '../components/ui';

const TONE: Record<HealthLevel, 'green' | 'amber' | 'red'> = { ok: 'green', warn: 'amber', high: 'red' };
const LABEL: Record<HealthLevel, string> = { ok: 'Fine', warn: 'Growing', high: 'Large' };

const n = (v: number) => v.toLocaleString();

/** How big the stored game data is, and which seasons moved to the per-viewer hash layout. A measurement plus the old-copy cleanup. */
export async function DataHealthPanel() {
  const active = await getActiveSeason().catch(() => null);
  const h = await loadDataHealth(active?.id ?? null);
  return (
    <Panel title="Data health" icon="database" hint={`Each season's collection is stored per viewer, so a pull, trade or upgrade only touches the viewers involved. The leaderboard, search and admin lists still read the whole season; it is flagged at ${formatBytes(BLOB_WARN_BYTES)} and again at ${formatBytes(BLOB_HIGH_BYTES)}. Trades and the activity log are capped, so they stay small. Measured just now.`}>
      {h.seasons.length === 0 ? <p className="text-sm text-gray-500">No published seasons yet.</p> : (
        <>
        <ul className="sm:hidden space-y-2">
          {h.seasons.map(s => (
            <li key={s.id} className="rounded-lg border border-gray-800 bg-gray-950/40 p-3 space-y-1 text-sm">
              <p className="text-white font-semibold">{s.name} {s.active && <Chip tone="green">Active</Chip>}</p>
              <p className="text-gray-300 tabular-nums">{formatBytes(s.collection.bytes)} <Chip tone={TONE[s.level]}>{LABEL[s.level]}</Chip></p>
              <p className="text-xs text-gray-400">{n(s.collection.viewers)} viewers, {n(s.collection.entries)} entries{s.collection.largest ? `, largest ${n(s.collection.largest.entries)} (${s.collection.largest.username})` : ''}</p>
              <p className="text-xs text-gray-500 wrap-break-word">{s.ledger.tracking ? `Edition ledger: ${n(s.ledger.live)} live, ${n(s.ledger.retired)} retired, ${n(s.ledger.editions)} editions` : 'Edition ledger: not numbered yet'}</p>
            </li>
          ))}
        </ul>
        <div className="hidden sm:block overflow-x-auto">
          <table className="table table-sm w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-gray-500">
                <th className="py-1.5 pr-3 font-bold">Season</th>
                <th className="py-1.5 pr-3 font-bold text-right">Collection size</th>
                <th className="py-1.5 pr-3 font-bold text-right">Viewers</th>
                <th className="py-1.5 pr-3 font-bold text-right">Entries</th>
                <th className="py-1.5 pr-3 font-bold text-right">Largest viewer</th>
                <th className="py-1.5 font-bold">Edition ledger</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60">
              {h.seasons.map(s => (
                <tr key={s.id} className="align-top">
                  <td className="py-2 pr-3 text-white">{s.name} {s.active && <Chip tone="green">Active</Chip>}</td>
                  <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap">{formatBytes(s.collection.bytes)} <Chip tone={TONE[s.level]}>{LABEL[s.level]}</Chip></td>
                  <td className="py-2 pr-3 text-right tabular-nums text-gray-300">{n(s.collection.viewers)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-gray-300">{n(s.collection.entries)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-gray-400">{s.collection.largest ? `${n(s.collection.largest.entries)} (${s.collection.largest.username})` : '-'}</td>
                  <td className="py-2 text-xs text-gray-400">
                    {s.ledger.tracking
                      ? <>{n(s.ledger.live)} live, {n(s.ledger.retired)} retired, {n(s.ledger.editions)} editions, {n(s.ledger.ownerEntries)} owner entries{s.ledger.largestOwner ? `, largest ${n(s.ledger.largestOwner.entries)} (${s.ledger.largestOwner.username})` : ''}{s.ledger.sampled ? ' (first 500 viewers)' : ''}</>
                      : 'Not numbered yet'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
      {h.trades.stuckEscrow.length > 0 && (
        <div role="alert" className="rounded-lg border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-200 space-y-3">
          <p>
            {n(h.trades.stuckEscrow.length)} closed offer{h.trades.stuckEscrow.length === 1 ? '' : 's'} still marked escrowed.
            Return editions puts back only what that offer still holds, then clears the flag. Running it again does not add the editions a second time.
            If the season was deleted, it refuses and the flag stays set. On a season whose editions are not numbered, use it only when the offerer is actually missing the cards.
          </p>
          <div className="flex flex-wrap gap-2">
            {h.trades.stuckEscrow.map(id => (
              <form key={id} action={releaseStuckEscrowAction.bind(null, id)}>
                <PendingButton type="submit" className="px-3 py-1.5 text-xs font-bold rounded-lg border border-red-400/40 text-red-100 hover:bg-red-900/40">
                  Return editions {id.slice(0, 8)}
                </PendingButton>
              </form>
            ))}
          </div>
        </div>
      )}
      <dl className="grid grid-cols-1 sm:grid-cols-[10rem_1fr] gap-y-0.5 sm:gap-y-1 text-sm">
        <dt className="text-gray-500">Collections moved</dt>
        <dd className="text-gray-300 mb-1.5 sm:mb-0">
          {h.migrations.length === 0 ? 'None' : (
            <ul className="space-y-0.5">
              {h.migrations.map(m => (
                <li key={m.collection} className="tabular-nums">{m.collection}: {n(m.viewers)} viewers, {n(m.entries)} entries, {new Date(m.at).toLocaleString()}{m.oldCopy ? ', old copy kept' : ', old copy deleted'}</li>
              ))}
            </ul>
          )}
          {h.oldCopiesDue > 0 && (
            <form action={deleteOldCollectionCopiesAction} className="mt-1.5">
              <PendingButton type="submit" className="px-3 py-1.5 text-xs font-bold rounded-lg border border-red-400/40 text-red-100 hover:bg-red-900/40">
                Delete old collection copies ({n(h.oldCopiesDue)})
              </PendingButton>
            </form>
          )}
          <span className="block text-xs text-gray-500">The old copy is kept as a rollback for {OLD_COPY_DAYS} days; the delete button appears after that.</span>
        </dd>
        <dt className="text-gray-500">Open trade offers</dt>
        <dd className="text-gray-300 tabular-nums mb-1.5 sm:mb-0">{n(h.trades.openCount)} ({formatBytes(h.trades.openBytes)})</dd>
        <dt className="text-gray-500">Trade history</dt>
        <dd className="text-gray-300 tabular-nums mb-1.5 sm:mb-0">{n(h.trades.historyCount)} kept ({formatBytes(h.trades.historyBytes)}), capped at 400</dd>
        {h.trades.stuckEscrow.length > 0 && <>
          <dt className="text-red-400">Stuck in escrow</dt>
          <dd className="text-red-300 mb-1.5 sm:mb-0">{h.trades.stuckEscrow.join(', ')}: closed offers still marked escrowed. Use Return editions above.</dd>
        </>}
        <dt className="text-gray-500">Activity log</dt>
        <dd className="text-gray-300 tabular-nums mb-1.5 sm:mb-0">{n(h.activityEvents)} events, capped at 500</dd>
        <dt className="text-gray-500">Login conflicts</dt>
        <dd className="text-gray-300 mb-1.5 sm:mb-0">
          {h.accountConflicts.length === 0 ? 'None' : (
            <ul className="space-y-0.5">
              {h.accountConflicts.slice(0, 20).map(c => (
                <li key={c.login} className="tabular-nums">{c.login}: a different Twitch account signed in, last {new Date(c.seen).toLocaleString()}, {n(c.count)} time{c.count === 1 ? '' : 's'}</li>
              ))}
              {h.accountConflicts.length > 20 && <li className="text-gray-500">and {n(h.accountConflicts.length - 20)} more</li>}
            </ul>
          )}
          <span className="block text-xs text-gray-500">Recorded only: the profile was not changed.</span>
        </dd>
        <dt className="text-gray-500">Moved aside</dt>
        <dd className="text-gray-300 mb-1.5 sm:mb-0">
          {h.asideAccounts.length === 0 ? 'None' : (
            <ul className="space-y-0.5">
              {h.asideAccounts.slice(0, 20).map(a => (
                <li key={a.to} className="tabular-nums">
                  <Link href={`/admin/users/${encodeURIComponent(a.to)}`} className="underline hover:text-white">{a.to}</Link> was {a.login}, {new Date(a.movedAt).toLocaleString()}: {a.reason}
                </li>
              ))}
              {h.asideAccounts.length > 20 && <li className="text-gray-500">and {n(h.asideAccounts.length - 20)} more</li>}
            </ul>
          )}
        </dd>
        <dt className="text-gray-500">Unfinished moves</dt>
        <dd className="text-gray-300 mb-1.5 sm:mb-0">
          {h.unfinishedMoves.length === 0 ? 'None' : (
            <ul className="space-y-1.5">
              {h.unfinishedMoves.map(m => (
                <li key={m.from} className="flex flex-wrap items-center gap-2">
                  <span className="tabular-nums">{m.from} to {m.to}: {m.done.length} step{m.done.length === 1 ? '' : 's'} done, started {new Date(m.startedAt).toLocaleString()}</span>
                  <form action={finishMoveAction.bind(null, m.from)}>
                    <PendingButton type="submit" className="px-3 py-1.5 text-xs font-bold rounded-lg border border-red-400/40 text-red-100 hover:bg-red-900/40">Finish move</PendingButton>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </dd>
        <dt className="text-gray-500">Nightly Twitch check</dt>
        <dd className="text-gray-300 mb-1.5 sm:mb-0">
          {!h.helixCheck ? 'Has not run yet' : (
            <>
              <p className="tabular-nums">{new Date(h.helixCheck.at).toLocaleString()}: {n(h.helixCheck.checked)} checked, {n(h.helixCheck.missing)} not found on Twitch, {n(h.helixCheck.renamed.length)} renamed</p>
              {h.helixCheck.error && <p className="text-red-300">{h.helixCheck.error}</p>}
              {h.helixCheck.renamed.length > 0 && (
                <ul className="space-y-0.5">
                  {h.helixCheck.renamed.map(r => (
                    <li key={r.to}><Link href={`/admin/users/${encodeURIComponent(r.to)}`} className="underline hover:text-white">{r.from} to {r.to}</Link></li>
                  ))}
                </ul>
              )}
              {h.helixCheck.needsStaff.length > 0 && (
                <>
                  <p className="text-amber-300 mt-1">Needs staff (merge by hand):</p>
                  <ul className="space-y-0.5">
                    {h.helixCheck.needsStaff.map(s => (
                      <li key={s.id}><Link href={`/admin/users/${encodeURIComponent(s.login)}`} className="underline hover:text-white">{s.login}</Link> is now {s.twitchLogin} on Twitch: {s.why}</li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </dd>
      </dl>
    </Panel>
  );
}
