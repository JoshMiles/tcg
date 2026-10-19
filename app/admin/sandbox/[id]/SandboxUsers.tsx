'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/app/components/Icon';
import { ConfirmButton } from '../../components/ConfirmButton';
import { PendingButton } from '../../components/PendingButton';
import type { SandboxUserRow } from '@/lib/sandbox-tools';

type Sort = 'copies' | 'rank' | 'name' | 'new';
const SHOWN = 100;

/** The Users tab: search, sort, tick viewers to clear or delete them, log in as one, or jump to giving them cards. */
export function SandboxUsers({ id, rows, loginAs, clear, remove }: {
  id: string; rows: SandboxUserRow[];
  loginAs: (f: FormData) => Promise<void>; clear: (f: FormData) => Promise<void>; remove: (f: FormData) => Promise<void>;
}) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('copies');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [all, setAll] = useState(false);

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    const l = rows.filter(r => !t || r.username.includes(t));
    const by: Record<Sort, (a: SandboxUserRow, b: SandboxUserRow) => number> = {
      copies: (a, b) => b.copies - a.copies || a.username.localeCompare(b.username),
      rank: (a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || a.username.localeCompare(b.username),
      name: (a, b) => a.username.localeCompare(b.username),
      new: (a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0),
    };
    return [...l].sort(by[sort]);
  }, [rows, q, sort]);
  const shown = all ? list : list.slice(0, SHOWN);
  const toggle = (u: string) => setPicked(p => { const n = new Set(p); n.has(u) ? n.delete(u) : n.add(u); return n; });
  const names = [...picked];
  const hidden = <>{names.map(n => <input key={n} type="hidden" name="username" value={n} />)}</>;

  if (rows.length === 0) return <p className="card rounded-2xl p-8 text-center text-sm text-gray-500">No viewers yet. Add a test user below, or set up a scenario on the Simulate tab.</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search viewers…" aria-label="Search viewers" className="input w-56 pl-9" />
        </div>
        <select value={sort} onChange={e => setSort(e.target.value as Sort)} aria-label="Sort" className="select select-sm">
          <option value="copies">Most prints</option><option value="rank">Best rank</option><option value="name">Name</option><option value="new">Newest</option>
        </select>
        <span className="text-xs text-gray-500">{list.length} of {rows.length}</span>
        {picked.size > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-gray-300"><strong>{picked.size}</strong> selected</span>
            <form action={clear}>{hidden}
              <ConfirmButton title="Clear these collections?" confirmLabel="Clear" message={<>Remove every card from <strong className="text-white">{picked.size} viewer{picked.size === 1 ? '' : 's'}</strong> but keep their profiles? You can undo it from the Activity tab.</>} className="px-3 py-1.5 text-sm font-semibold rounded-lg border border-gray-700 text-gray-200 hover:border-gray-500">Clear cards</ConfirmButton>
            </form>
            <form action={remove}>{hidden}
              <ConfirmButton title="Delete these viewers?" confirmLabel="Delete" message={<>Delete <strong className="text-white">{picked.size} viewer{picked.size === 1 ? '' : 's'}</strong> and their cards and profiles from this sandbox? You can undo it from the Activity tab.</>} className="px-3 py-1.5 text-sm font-bold rounded-lg text-red-300 border border-red-500/30 hover:bg-red-950/40">Delete</ConfirmButton>
            </form>
            <button onClick={() => setPicked(new Set())} className="text-sm text-gray-400 hover:text-white">Clear selection</button>
          </div>
        )}
      </div>

      <div className="card rounded-2xl overflow-x-auto">
        <table className="table table-sm w-full text-sm min-w-160">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-gray-500 border-b border-gray-800">
              <th className="w-10 pl-4 py-2.5 text-left"><input type="checkbox" aria-label="Select all shown" checked={shown.length > 0 && shown.every(r => picked.has(r.username))} onChange={e => setPicked(e.target.checked ? new Set(shown.map(r => r.username)) : new Set())} className="accent-yellow-400" /></th>
              <th className="py-2.5 text-left">Viewer</th>
              <th className="py-2.5 text-right">Rank</th><th className="py-2.5 text-right">Score</th><th className="py-2.5 text-right">Prints</th><th className="py-2.5 text-right">Unique</th>
              <th className="pr-4 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/60">
            {shown.map(r => (
              <tr key={r.username} className={picked.has(r.username) ? 'bg-yellow-500/5' : 'hover:bg-white/2'}>
                <td className="pl-4 py-2"><input type="checkbox" aria-label={`Select ${r.username}`} checked={picked.has(r.username)} onChange={() => toggle(r.username)} className="accent-yellow-400" /></td>
                <td className="py-2 font-mono text-gray-100">{r.username}{r.complete && <Icon name="cheese" className="ml-1.5 text-yellow-400" />}</td>
                <td className="py-2 text-right tabular-nums text-gray-400">{r.rank ? `#${r.rank}` : '-'}</td>
                <td className="py-2 text-right tabular-nums text-yellow-300">{r.score !== null ? r.score.toLocaleString() : '-'}</td>
                <td className="py-2 text-right tabular-nums text-gray-300">{r.copies}</td>
                <td className="py-2 text-right tabular-nums text-gray-400">{r.unique}</td>
                <td className="pr-4 py-2">
                  <div className="flex items-center justify-end gap-1.5">
                    <Link href={`/admin/sandbox/${id}?tab=drive&user=${encodeURIComponent(r.username)}`} className="px-2.5 py-1 text-xs rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300">Give / pull</Link>
                    <form action={loginAs}><input type="hidden" name="username" value={r.username} />
                      <PendingButton className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-gray-700 text-gray-300 hover:border-yellow-500/60 hover:text-yellow-300" title="Log this browser in as this viewer on the website (sandbox only)">Log in as →</PendingButton>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-gray-500">No viewers match.</td></tr>}
          </tbody>
        </table>
      </div>
      {list.length > SHOWN && !all && <button onClick={() => setAll(true)} className="text-sm text-gray-400 hover:text-white">Show all {list.length}</button>}
    </div>
  );
}
