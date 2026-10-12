'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { Icon } from '@/app/components/Icon';
import { Spinner } from '../components/PendingButton';
import { FLAG_LABEL, tradesToCsv, type FlagKind, type TradeRow } from '@/lib/trade-insights';
import { blockViewerTradingAction, cancelOneTradeAction, extendOpenTradesAction } from '../trade-actions';

const field = 'rounded-lg bg-gray-950 border border-gray-700 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-yellow-500';
const STATUSES = ['open', 'accepted', 'declined', 'cancelled', 'expired', 'countered', 'failed'] as const;
const STATUS_STYLE: Record<string, string> = {
  open: 'text-sky-300 border-sky-400/30 bg-sky-500/10',
  accepted: 'text-emerald-300 border-emerald-400/30 bg-emerald-500/10',
  declined: 'text-gray-300 border-gray-600 bg-gray-800/60',
  cancelled: 'text-gray-400 border-gray-700',
  expired: 'text-gray-500 border-gray-700',
  countered: 'text-violet-300 border-violet-400/30 bg-violet-500/10',
  failed: 'text-red-300 border-red-400/30 bg-red-500/10',
};
const FLAG_STYLE: Record<FlagKind, string> = {
  lopsided: 'text-amber-300 border-amber-400/30 bg-amber-500/10',
  repeat: 'text-orange-300 border-orange-400/30 bg-orange-500/10',
  burst: 'text-red-300 border-red-400/30 bg-red-500/10',
  newbie: 'text-cyan-300 border-cyan-400/30 bg-cyan-500/10',
};

const when = (t?: number) => (t ? new Date(t).toLocaleString() : '—');
function left(expiresAt: number, now: number): string {
  const m = Math.ceil((expiresAt - now) / 60_000);
  if (m <= 0) return 'ended';
  if (m < 60) return `${m}m left`;
  return m < 2880 ? `${Math.floor(m / 60)}h left` : `${Math.floor(m / 1440)}d left`;
}

export function TradeLog({ rows, seasons, initialFlaggedOnly = false }: { rows: TradeRow[]; seasons: { id: string; name: string }[]; initialFlaggedOnly?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<Set<string>>(new Set());
  const [kind, setKind] = useState('');
  const [season, setSeason] = useState('');
  const [flaggedOnly, setFlaggedOnly] = useState(initialFlaggedOnly);
  const [openId, setOpenId] = useState<string | null>(null);
  const [limit, setLimit] = useState(40);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  useEffect(() => setNow(Date.now()), []);
  useEffect(() => {
    if (!openId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenId(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openId]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(r =>
      (status.size === 0 || status.has(r.status)) &&
      (!kind || r.kind === kind) &&
      (!season || r.seasonId === season) &&
      (!flaggedOnly || r.flags.length > 0) &&
      (!needle || `${r.from} ${r.to ?? ''} ${r.takenBy ?? ''} ${r.cardNames} ${r.note ?? ''}`.toLowerCase().includes(needle)),
    );
  }, [rows, q, status, kind, season, flaggedOnly]);

  const selected = rows.find(r => r.id === openId) ?? null;
  const toggle = (s: string) => setStatus(prev => { const n = new Set(prev); if (n.has(s)) n.delete(s); else n.add(s); return n; });
  const run = (fn: () => Promise<{ ok: boolean; message: string } | void>, ok = 'Done.') => startTransition(async () => { const r = await fn(); setMsg(r ? r.message : ok); router.refresh(); });

  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([tradesToCsv(shown)], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = `trades-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search viewer, card or note…" aria-label="Search trades" className={`${field} w-64`} />
        <select value={kind} onChange={e => setKind(e.target.value)} aria-label="Kind" className={field}><option value="">Direct + board</option><option value="direct">Direct offers</option><option value="listing">Board listings</option></select>
        {seasons.length > 1 && <select value={season} onChange={e => setSeason(e.target.value)} aria-label="Season" className={field}><option value="">All seasons</option>{seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
        <button type="button" onClick={() => setFlaggedOnly(f => !f)} aria-pressed={flaggedOnly} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${flaggedOnly ? 'bg-amber-500/15 border-amber-400/50 text-amber-200' : 'border-gray-700 text-gray-400 hover:text-white'}`}><Icon name="warning" className="mr-1" />Flagged only</button>
        <button type="button" onClick={exportCsv} disabled={shown.length === 0} className="ml-auto px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-700 text-gray-300 hover:text-white disabled:opacity-40"><Icon name="download" className="mr-1" />Export {shown.length}</button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {STATUSES.map(s => <button key={s} type="button" onClick={() => toggle(s)} aria-pressed={status.has(s)} className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors ${status.has(s) ? STATUS_STYLE[s] : 'border-gray-800 text-gray-500 hover:text-gray-300'}`}>{s}<span className="ml-1 font-normal opacity-70">{rows.filter(r => r.status === s).length}</span></button>)}
        {(status.size > 0 || kind || season || flaggedOnly || q) && <button type="button" onClick={() => { setStatus(new Set()); setKind(''); setSeason(''); setFlaggedOnly(false); setQ(''); }} className="px-2.5 py-1 text-[11px] text-gray-500 hover:text-white underline underline-offset-2">Clear filters</button>}
      </div>
      {msg && <p role="status" className="text-sm rounded-lg px-3 py-2 border text-green-300 bg-green-500/10 border-green-400/30">{msg}</p>}

      {shown.length === 0 ? <p className="text-sm text-gray-500 py-6 text-center">No trades match.</p> : (
        <ul className="divide-y divide-gray-800/60 rounded-xl border border-gray-800 overflow-hidden bg-gray-900/40">
          {shown.slice(0, limit).map(r => (
            <li key={r.id}>
              <button type="button" onClick={() => setOpenId(r.id)} className={`w-full text-left px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm hover:bg-white/5 transition-colors ${openId === r.id ? 'bg-white/5' : ''}`}>
                <span className={`text-[11px] font-bold rounded-full border px-2 py-0.5 ${STATUS_STYLE[r.status] ?? ''}`}>{r.status}</span>
                <span className="text-gray-200 font-medium">{r.from}</span>
                <span className="text-gray-600">{r.to ? '→' : '→ board'}</span>
                {(r.to || r.takenBy) && <span className="text-gray-200 font-medium">{r.to ?? r.takenBy}</span>}
                <span className="text-gray-500 text-xs truncate max-w-[28rem]">{r.giveText} <span className="text-gray-700">for</span> {r.getText}</span>
                <span className="flex gap-1">{r.flags.map(f => <span key={f.kind} title={f.label} className={`text-[10px] font-bold rounded-full border px-1.5 ${FLAG_STYLE[f.kind]}`}>{FLAG_LABEL[f.kind]}</span>)}</span>
                <span className="ml-auto text-xs text-gray-600 tabular-nums">{r.open && now ? left(r.expiresAt, now) : when(r.resolvedAt ?? r.createdAt)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {shown.length > limit && <button type="button" onClick={() => setLimit(l => l + 60)} className="text-xs text-yellow-400 hover:text-yellow-300">Show more ({shown.length - limit} left)</button>}

      {selected && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/50 backdrop-blur-[2px]" onClick={() => setOpenId(null)}>
          <aside role="dialog" aria-label="Trade detail" onClick={e => e.stopPropagation()} className="w-full max-w-md h-full overflow-auto bg-gray-950 border-l border-gray-800 p-6 space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className={`text-[11px] font-bold rounded-full border px-2 py-0.5 ${STATUS_STYLE[selected.status] ?? ''}`}>{selected.status}</span>
                <h3 className="font-display text-xl font-bold text-white mt-2">{selected.from} {selected.to ? `→ ${selected.to}` : selected.takenBy ? `→ ${selected.takenBy}` : '→ board'}</h3>
                <p className="text-xs text-gray-500">{selected.kind === 'listing' ? 'Board listing' : 'Direct offer'} · {selected.seasonName}</p>
              </div>
              <button type="button" onClick={() => setOpenId(null)} aria-label="Close" className="p-1 text-gray-500 hover:text-white"><Icon name="x" /></button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border border-gray-800 p-3"><p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1">{selected.from} gives</p><p className="text-gray-200">{selected.giveText}</p><p className="text-xs text-yellow-300 mt-1 tabular-nums">{Math.round(selected.givePts).toLocaleString()} pts</p></div>
              <div className="rounded-lg border border-gray-800 p-3"><p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1">wants back</p><p className="text-gray-200">{selected.getText}</p><p className="text-xs text-yellow-300 mt-1 tabular-nums">{Math.round(selected.getPts).toLocaleString()} pts</p></div>
            </div>
            <p className="text-[11px] text-gray-600">Points are at today&apos;s card values, not the values when the offer was made.</p>

            {selected.flags.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-white">Worth a look</p>
                {selected.flags.map(f => <p key={f.kind} className={`text-xs rounded-lg border px-3 py-1.5 ${FLAG_STYLE[f.kind]}`}><strong>{FLAG_LABEL[f.kind]}:</strong> {f.label}</p>)}
              </div>
            )}

            <dl className="text-sm space-y-1.5">
              <div className="flex justify-between gap-4"><dt className="text-gray-500">Offered</dt><dd className="text-gray-300">{when(selected.createdAt)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-gray-500">{selected.open ? 'Expires' : 'Ended'}</dt><dd className="text-gray-300">{when(selected.open ? selected.expiresAt : selected.resolvedAt)}</dd></div>
              {selected.resolvedBy && <div className="flex justify-between gap-4"><dt className="text-gray-500">Resolved by</dt><dd className="text-gray-300">{selected.resolvedBy}</dd></div>}
              {selected.reason && <div className="flex justify-between gap-4"><dt className="text-gray-500">Reason</dt><dd className="text-gray-300 text-right">{selected.reason}</dd></div>}
              {selected.note && <div className="flex justify-between gap-4"><dt className="text-gray-500">Note</dt><dd className="text-gray-300 text-right">&ldquo;{selected.note}&rdquo;</dd></div>}
              {selected.counterOf && <div className="flex justify-between gap-4"><dt className="text-gray-500">Counter to</dt><dd><button type="button" onClick={() => setOpenId(selected.counterOf!)} className="text-yellow-400 hover:text-yellow-300 text-xs">that offer</button></dd></div>}
            </dl>

            <div className="flex flex-wrap gap-2 pt-1">
              {[selected.from, selected.to ?? selected.takenBy].filter((u): u is string => !!u).map(u => (
                <Link key={u} href={`/admin/users/${encodeURIComponent(u)}`} className="px-3 py-1.5 rounded-lg border border-gray-700 text-xs font-semibold text-gray-300 hover:text-white">Open {u}</Link>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 border-t border-gray-800 pt-4">
              {selected.open && (
                <>
                  <button type="button" disabled={pending} onClick={() => run(async () => { const r = await cancelOneTradeAction(selected.id); setOpenId(null); return r; })} className="px-3 py-1.5 rounded-lg border border-red-500/40 text-red-300 text-xs font-semibold hover:bg-red-500/10 disabled:opacity-50">{pending && <Spinner />}Cancel &amp; refund</button>
                  <button type="button" disabled={pending} onClick={() => run(() => extendOpenTradesAction(24, [selected.id]))} className="px-3 py-1.5 rounded-lg border border-gray-700 text-xs font-semibold text-gray-300 hover:text-white disabled:opacity-50">Extend 24h</button>
                </>
              )}
              <button
                type="button"
                disabled={pending}
                onClick={() => { if (window.confirm(`Stop ${selected.from} trading? Their open offers are cancelled and the cards returned. You can lift this on their user page.`)) run(() => blockViewerTradingAction(selected.from, `Blocked from trade ${selected.id.slice(0, 8)}`)); }}
                className="px-3 py-1.5 rounded-lg border border-gray-700 text-xs font-semibold text-gray-300 hover:text-amber-200 hover:border-amber-400/50 disabled:opacity-50"
              >
                <Icon name="ban" className="mr-1" />Block {selected.from} from trading
              </button>
            </div>
            {msg && <p role="status" className="text-xs text-green-300">{msg}</p>}
          </aside>
        </div>
      )}
    </div>
  );
}
