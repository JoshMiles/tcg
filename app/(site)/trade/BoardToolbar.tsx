'use client';
import { useEffect, useState } from 'react';
import { Icon } from '@/app/components/Icon';

type Filter = 'all' | 'take' | 'wanted' | 'new' | 'spare';
type Sort = 'newest' | 'expiring' | 'gain';

const FILTERS: { id: Filter; label: string; signedIn?: boolean }[] = [
  { id: 'all', label: 'All' },
  { id: 'take', label: 'I can take', signedIn: true },
  { id: 'wanted', label: 'Has a card I want', signedIn: true },
  { id: 'new', label: 'Has a card I lack', signedIn: true },
  { id: 'spare', label: 'Asks for my spares', signedIn: true },
];

/**
 * Search, filter and sort for the (server-rendered) board. Each listing opts in with `data-board` plus `data-search`, `data-take`,
 * `data-wanted`, `data-new`, `data-spare` ("1" or "0"), `data-gain`, `data-created` and `data-expires`. We toggle `hidden` and the CSS
 * `order` instead of re-rendering, so every listing keeps its buttons and state.
 */
export function BoardToolbar({ total, signedIn }: { total: number; signedIn: boolean }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('newest');
  const [shown, setShown] = useState(total);

  useEffect(() => {
    const needle = q.trim().toLowerCase();
    const items = [...document.querySelectorAll<HTMLElement>('[data-board]')];
    let count = 0;
    for (const el of items) {
      const d = el.dataset;
      const match = (!needle || (d.search ?? '').includes(needle))
        && (filter === 'all' || (filter === 'take' && d.take === '1') || (filter === 'wanted' && d.wanted === '1') || (filter === 'new' && d.new === '1') || (filter === 'spare' && d.spare === '1'));
      el.hidden = !match;
      if (match) count++;
    }
    const num = (el: HTMLElement, k: string) => Number(el.dataset[k] ?? 0);
    [...items].sort((a, b) => sort === 'expiring' ? num(a, 'expires') - num(b, 'expires') : sort === 'gain' ? num(b, 'gain') - num(a, 'gain') : num(b, 'created') - num(a, 'created'))
      .forEach((el, i) => { el.style.order = String(i); });
    setShown(count);
  }, [q, filter, sort, total]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-56 max-w-sm">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm pointer-events-none"><Icon name="search" /></span>
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search a card or collector" aria-label="Search the board" className="w-full bg-gray-950 border border-gray-700 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-hidden focus:border-yellow-500" />
        </div>
        <label className="ml-auto flex items-center gap-2 text-xs text-gray-500">Sort
          <select value={sort} onChange={e => setSort(e.target.value as Sort)} className="bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-gray-200">
            <option value="newest">Newest</option>
            <option value="expiring">Ending soon</option>
            {signedIn && <option value="gain">Best for me (points)</option>}
          </select>
        </label>
      </div>
      <div role="group" aria-label="Filter the board" className="flex flex-wrap gap-1.5">
        {FILTERS.filter(f => !f.signedIn || signedIn).map(f => (
          <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)} className={`px-3 py-1 rounded-full text-xs font-bold border transition-colors ${filter === f.id ? 'bg-yellow-500 text-gray-950 border-yellow-500' : 'border-gray-700 text-gray-300 hover:text-white'}`}>{f.label}</button>
        ))}
      </div>
      {shown === 0 && total > 0 && <p className="rind rounded-2xl p-6 text-center text-sm text-gray-400">No listing matches. Try another filter.</p>}
    </div>
  );
}
