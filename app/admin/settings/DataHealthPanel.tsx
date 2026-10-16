import { formatBytes, loadDataHealth, BLOB_WARN_BYTES, BLOB_HIGH_BYTES, type HealthLevel } from '@/lib/data-health';
import { getActiveSeason } from '@/lib/kv';
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
        <div className="overflow-x-auto">
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
      )}
      <dl className="grid grid-cols-[10rem_1fr] gap-y-1 text-sm">
        <dt className="text-gray-500">Open trade offers</dt>
        <dd className="text-gray-300 tabular-nums">{n(h.trades.openCount)} ({formatBytes(h.trades.openBytes)})</dd>
        <dt className="text-gray-500">Trade history</dt>
        <dd className="text-gray-300 tabular-nums">{n(h.trades.historyCount)} kept ({formatBytes(h.trades.historyBytes)}), capped at 400</dd>
        <dt className="text-gray-500">Activity log</dt>
        <dd className="text-gray-300 tabular-nums">{n(h.activityEvents)} events, capped at 500</dd>
      </dl>
    </Panel>
  );
}
