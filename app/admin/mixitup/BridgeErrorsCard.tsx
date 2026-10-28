import { Panel } from '../components/ui';
import { PART_LABEL, type BridgeErrorRow } from '@/lib/bridge-errors-core';
import { LocalTime } from './LocalTime';

export interface ErrorsView { rows: (BridgeErrorRow & { ago: string })[]; days: { day: string; count: number }[] }

/** Mix It Up → Connection: the last 50 failures TCG Bridge reported, newest first (ROADMAP 57.9). */
export function BridgeErrorsCard({ errors }: { errors: ErrorsView }) {
  const week = errors.days.reduce((a, d) => a + d.count, 0);
  return (
    <Panel id="bridge-errors" title="TCG Bridge errors" icon="warning" hint="The app reports a failed job, an OBS or Mix It Up call that did not work, or a connection it could not get back. The last 50 are kept. Several errors in a short burst post once to the System Discord channel.">
      <p className="text-xs text-gray-500 tabular-nums">Last 7 days: {week === 0 ? 'none' : errors.days.filter(d => d.count > 0).map(d => `${d.day} ${d.count}`).join(', ')}</p>
      {errors.rows.length === 0 ? <p className="text-sm text-gray-400">No errors reported.</p> : (
        <div className="overflow-x-auto">
          <table className="table table-sm w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-gray-500">
                <th className="py-1.5 pr-3 font-bold">Time</th>
                <th className="py-1.5 pr-3 font-bold">PC</th>
                <th className="py-1.5 pr-3 font-bold">Part</th>
                <th className="py-1.5 pr-3 font-bold">Message</th>
                <th className="py-1.5 pr-3 font-bold">Version</th>
                <th className="py-1.5 font-bold">Commit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60">
              {errors.rows.map(r => (
                <tr key={`${r.at}:${r.part}:${r.message}`} className="align-top">
                  <td className="py-2 pr-3 whitespace-nowrap"><LocalTime at={r.at} ago={r.ago} /></td>
                  <td className="py-2 pr-3 text-gray-300">{r.pc || '-'}</td>
                  <td className="py-2 pr-3 text-gray-300 whitespace-nowrap">{PART_LABEL[r.part]}</td>
                  <td className="py-2 pr-3 text-white wrap-break-word">{r.message}</td>
                  <td className="py-2 pr-3 text-gray-400 tabular-nums">{r.version || '-'}</td>
                  <td className="py-2 text-gray-400 font-mono text-xs">{r.commit || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
