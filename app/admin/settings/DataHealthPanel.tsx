import { formatBytes, loadDataHealth, BLOB_WARN_BYTES, BLOB_HIGH_BYTES, type HealthLevel } from '@/lib/data-health';
import { getActiveSeason } from '@/lib/kv';
import { releaseStuckEscrowAction } from '../trade-actions';
import { PendingButton } from '../components/PendingButton';
import { Panel, Chip } from '../components/ui';

const TONE: Record<HealthLevel, 'green' | 'amber' | 'red'> = { ok: 'green', warn: 'amber', high: 'red' };
const LABEL: Record<HealthLevel, string> = { ok: 'Fine', warn: 'Growing', high: 'Large' };

const n = (v: number) => v.toLocaleString();

/** How big the stored game data is. A measurement only: it decides whether the one-value-per-season collection storage needs redesigning. */
export async function DataHealthPanel() {
  const active = await getActiveSeason().catch(() => null);
  const h = await loadDataHealth(active?.id ?? null);
  return (
    <Panel title="Data health" icon="database" hint={`Each season's collection is one stored value that is read and rewritten in full on every pull, trade and upgrade. It is flagged at ${formatBytes(BLOB_WARN_BYTES)} and again at ${formatBytes(BLOB_HIGH_BYTES)}. Trades and the activity log are capped, so they stay small. Measured just now; check your database plan's limit on the size of one request.`}>
      {h.seasons.length === 0 ? <p className="text-sm text-gray-500">No published seasons yet.</p> : (
        <>
        <ul className="sm:hidden space-y-2">
          {h.seasons.map(s => (
            <li key={s.id} className="rounded-lg border border-gray-800 bg-gray-950/40 p-3 space-y-1 text-sm">
              <p className="text-white font-semibold">{s.name} {s.active && <Chip tone="green">Active</Chip>}</p>
              <p className="text-gray-300 tabular-nums">{formatBytes(s.collection.bytes)} <Chip tone={TONE[s.level]}>{LABEL[s.level]}</Chip></p>
              <p className="text-xs text-gray-400">{n(s.collection.viewers)} viewers, {n(s.collection.entries)} entries{s.collection.largest ? `, largest ${n(s.collection.largest.entries)} (${s.collection.largest.username})` : ''}</p>
              <p className="text-xs text-gray-500 wrap-break-word">{s.ledger.tracking ? `Print ledger: ${n(s.ledger.live)} live, ${n(s.ledger.retired)} retired, ${n(s.ledger.editions)} editions` : 'Print ledger: not numbered yet'}</p>
            </li>
          ))}
        </ul>
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-gray-500">
                <th className="py-1.5 pr-3 font-bold">Season</th>
                <th className="py-1.5 pr-3 font-bold text-right">Collection size</th>
                <th className="py-1.5 pr-3 font-bold text-right">Viewers</th>
                <th className="py-1.5 pr-3 font-bold text-right">Entries</th>
                <th className="py-1.5 pr-3 font-bold text-right">Largest viewer</th>
                <th className="py-1.5 font-bold">Print ledger</th>
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
            Return prints puts back only what that offer still holds, then clears the flag. Running it again does not add the prints a second time.
            If the season was deleted, it refuses and the flag stays set. On a season whose prints are not numbered, use it only when the offerer is actually missing the cards.
          </p>
          <div className="flex flex-wrap gap-2">
            {h.trades.stuckEscrow.map(id => (
              <form key={id} action={releaseStuckEscrowAction.bind(null, id)}>
                <PendingButton type="submit" className="px-3 py-1.5 text-xs font-bold rounded-lg border border-red-400/40 text-red-100 hover:bg-red-900/40">
                  Return prints {id.slice(0, 8)}
                </PendingButton>
              </form>
            ))}
          </div>
        </div>
      )}
      <dl className="grid grid-cols-1 sm:grid-cols-[10rem_1fr] gap-y-0.5 sm:gap-y-1 text-sm">
        <dt className="text-gray-500">Open trade offers</dt>
        <dd className="text-gray-300 tabular-nums mb-1.5 sm:mb-0">{n(h.trades.openCount)} ({formatBytes(h.trades.openBytes)})</dd>
        <dt className="text-gray-500">Trade history</dt>
        <dd className="text-gray-300 tabular-nums mb-1.5 sm:mb-0">{n(h.trades.historyCount)} kept ({formatBytes(h.trades.historyBytes)}), capped at 400</dd>
        {h.trades.stuckEscrow.length > 0 && <>
          <dt className="text-red-400">Stuck in escrow</dt>
          <dd className="text-red-300 mb-1.5 sm:mb-0">{h.trades.stuckEscrow.join(', ')}: closed offers still marked escrowed. Use Return prints above.</dd>
        </>}
        <dt className="text-gray-500">Activity log</dt>
        <dd className="text-gray-300 tabular-nums mb-1.5 sm:mb-0">{n(h.activityEvents)} events, capped at 500</dd>
      </dl>
    </Panel>
  );
}
