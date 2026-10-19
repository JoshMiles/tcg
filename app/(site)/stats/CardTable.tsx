'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Icon } from '@/app/components/Icon';

export interface StatCard { number: number; name: string; stars: number; hex: string; label: string; thumb?: string; copies: number; collectors: number }
type Key = 'number' | 'name' | 'stars' | 'copies' | 'collectors';

/** Every card in the season with how often it was pulled and how many collectors hold it. Click a heading to sort, type to search. */
export function CardTable({ cards, collectors }: { cards: StatCard[]; collectors: number }) {
  const [q, setQ] = useState('');
  const [key, setKey] = useState<Key>('copies');
  const [dir, setDir] = useState<1 | -1>(-1);
  const [all, setAll] = useState(false);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = cards.filter(c => !needle || c.name.toLowerCase().includes(needle) || String(c.number) === needle.replace('#', ''));
    return [...filtered].sort((a, b) => {
      const av = a[key], bv = b[key];
      const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return cmp * dir || a.number - b.number;
    });
  }, [cards, q, key, dir]);

  const head = (k: Key, label: string, right = false) => (
    <th scope="col" aria-sort={key === k ? (dir === 1 ? 'ascending' : 'descending') : 'none'} className={`p-0 font-bold ${right ? 'text-right' : 'text-left'}`}>
      {/* The button fills the whole heading cell, so the whole cell sorts. */}
      <button type="button" onClick={() => { if (key === k) setDir(d => (d === 1 ? -1 : 1)); else { setKey(k); setDir(k === 'name' || k === 'number' ? 1 : -1); } }} className={`flex w-full items-center gap-1 py-2 px-3 uppercase tracking-wider hover:text-white ${right ? 'justify-end' : 'justify-start'}`}>
        {label}{key === k && <Icon name={dir === 1 ? 'arrowUp' : 'arrowDown'} className="w-3 h-3" />}
      </button>
    </th>
  );
  const shown = all ? rows : rows.slice(0, 10);

  return (
    <section className="rind rounded-2xl p-5 space-y-3 lg:col-span-2 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold text-white">Every card</h2>
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search name or #" aria-label="Search cards" className="input input-sm w-56 max-w-full" />
      </div>
      <div className="overflow-x-auto">
        <table className="table table-sm w-full text-sm">
          <thead className="text-[11px] text-gray-500 bg-gray-950/50"><tr>{head('number', '#')}{head('name', 'Card')}{head('stars', 'Rarity')}{head('copies', 'Editions', true)}{head('collectors', 'Collectors', true)}</tr></thead>
          <tbody className="divide-y divide-gray-800/70">
            {shown.map(c => (
              <tr key={c.number} className="hover:bg-white/2">
                <td className="py-2 px-3 text-gray-500 tabular-nums">{c.number}</td>
                <td className="py-2 px-3">
                  <Link href={`/cards?card=${c.number}`} className="flex items-center gap-3 text-white hover:text-yellow-200">
                    {c.thumb ? <img src={c.thumb} alt="" loading="lazy" className="w-7 h-10 object-cover rounded-sm" style={{ boxShadow: `0 0 0 1.5px ${c.hex}` }} /> : <span className="w-7 h-10 rounded-sm bg-gray-800" />}
                    <span className="truncate font-semibold">{c.name}</span>
                  </Link>
                </td>
                <td className="py-2 px-3 whitespace-nowrap" style={{ color: c.hex }}>{'★'.repeat(c.stars)} <span className="text-xs hidden sm:inline">{c.label}</span></td>
                <td className="py-2 px-3 text-right tabular-nums text-gray-200">{c.copies.toLocaleString()}</td>
                <td className="py-2 px-3 text-right tabular-nums text-gray-400">{c.collectors}{collectors > 0 ? <span className="text-gray-600"> · {Math.round((c.collectors / collectors) * 100)}%</span> : null}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-gray-500">No card matches.</td></tr>}
          </tbody>
        </table>
      </div>
      {rows.length > 10 && <button type="button" onClick={() => setAll(a => !a)} className="text-sm text-yellow-400 hover:text-yellow-300 font-semibold">{all ? 'Show fewer' : `Show all ${rows.length} cards`}</button>}
    </section>
  );
}
