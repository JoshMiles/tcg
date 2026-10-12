'use client';
import { useRouter } from 'next/navigation';
import { UserInput } from '@/app/components/UserInput';
import { useState, useTransition } from 'react';
import { Spinner } from '../components/PendingButton';
import { cancelOpenTradesAction, extendOpenTradesAction, setSeasonTradingAction, type TradeActionResult } from '../trade-actions';

const field = 'rounded-lg bg-gray-950 border border-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500';
const btn = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold border border-gray-700 text-gray-200 hover:border-gray-500 hover:bg-white/5 disabled:opacity-50 transition-colors';

export interface ControlSeason { id: string; name: string; frozen: boolean; open: number }

/** Bulk admin controls: per-season trading switch, extend everything open, cancel & refund by scope. */
export function TradeControls({ seasons, openTotal }: { seasons: ControlSeason[]; openTotal: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<TradeActionResult | null>(null);
  const [hours, setHours] = useState('24');
  const [scope, setScope] = useState('all');
  const [viewer, setViewer] = useState('');
  const run = (fn: () => Promise<TradeActionResult>) => startTransition(async () => { setResult(await fn()); router.refresh(); });

  const scopeCount = scope === 'all' ? openTotal : scope === 'viewer' ? null : seasons.find(s => s.id === scope)?.open ?? 0;
  const cancel = () => {
    const label = scope === 'all' ? 'every open offer' : scope === 'viewer' ? `every open offer involving ${viewer || '…'}` : `every open offer in ${seasons.find(s => s.id === scope)?.name}`;
    if (scope === 'viewer' && !viewer.trim()) return;
    if (!window.confirm(`Cancel ${label}${scopeCount !== null ? ` (${scopeCount})` : ''}? The escrowed cards go back to their owners and each offerer is notified.`)) return;
    run(() => cancelOpenTradesAction(scope === 'all' ? {} : scope === 'viewer' ? { username: viewer } : { seasonId: scope }));
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-white">Trading by season</h3>
        <ul className="divide-y divide-gray-800/60 rounded-lg border border-gray-800 overflow-hidden">
          {seasons.map(s => (
            <li key={s.id} className="px-4 py-2.5 flex items-center gap-3 text-sm">
              <span className="text-gray-200">{s.name}</span>
              <span className="text-xs text-gray-500">{s.open} open</span>
              <span className={`text-[11px] font-bold rounded-full border px-2 py-0.5 ${s.frozen ? 'text-amber-300 border-amber-400/30 bg-amber-500/10' : 'text-emerald-300 border-emerald-400/30 bg-emerald-500/10'}`}>{s.frozen ? 'closed' : 'open'}</span>
              <button type="button" disabled={pending} onClick={() => run(() => setSeasonTradingAction(s.id, !s.frozen))} className="ml-auto text-xs font-semibold text-yellow-400 hover:text-yellow-300 disabled:opacity-50">{s.frozen ? 'Reopen trading' : 'Close trading'}</button>
            </li>
          ))}
          {seasons.length === 0 && <li className="px-4 py-3 text-sm text-gray-600">No published seasons.</li>}
        </ul>
        <p className="text-xs text-gray-600">Closing stops new offers and accepts in that season; open offers stay until they end or are cancelled. Ending a season closes it automatically.</p>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-white">Extend open offers</h3>
        <div className="flex items-center gap-2">
          <input type="number" min={1} max={336} value={hours} onChange={e => setHours(e.target.value)} aria-label="Hours to add" className={`${field} w-24`} />
          <span className="text-xs text-gray-500">hours</span>
          <button type="button" disabled={pending || openTotal === 0} onClick={() => run(() => extendOpenTradesAction(Number(hours)))} className={btn}>{pending && <Spinner />}Extend all {openTotal}</button>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-white">Cancel &amp; refund</h3>
        <div className="flex flex-wrap items-center gap-2">
          <select value={scope} onChange={e => setScope(e.target.value)} aria-label="Scope" className={field}>
            <option value="all">Every open offer ({openTotal})</option>
            {seasons.map(s => <option key={s.id} value={s.id}>In {s.name} ({s.open})</option>)}
            <option value="viewer">Involving a viewer…</option>
          </select>
          {scope === 'viewer' && <UserInput value={viewer} onValueChange={setViewer} placeholder="username" aria-label="Viewer" className={`${field} w-44`} />}
          <button type="button" disabled={pending || (scopeCount === 0) || (scope === 'viewer' && !viewer.trim())} onClick={cancel} className={`${btn} hover:border-red-400/60 hover:text-red-200`}>{pending && <Spinner />}Cancel offers</button>
        </div>
      </div>
      {result && <p role="status" className={`text-sm rounded-lg px-3 py-2 border ${result.ok ? 'text-green-300 bg-green-500/10 border-green-400/30' : 'text-amber-200 bg-amber-500/10 border-amber-400/30'}`}>{result.message}</p>}
    </div>
  );
}
