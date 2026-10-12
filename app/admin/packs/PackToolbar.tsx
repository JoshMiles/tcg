'use client';
import { Icon } from '@/app/components/Icon';
import { useEffect, useRef, useState } from 'react';

type Filter = 'all' | 'live' | 'inactive' | 'draft';
type Sort = 'default' | 'name' | 'cards' | 'weight';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'live', label: 'Live' },
  { id: 'inactive', label: 'Inactive' },
  { id: 'draft', label: 'Drafts' },
];
const SORTS: { id: Sort; label: string }[] = [
  { id: 'default', label: 'Drafts first, then newest' },
  { id: 'name', label: 'Name A–Z' },
  { id: 'cards', label: 'Most cards' },
  { id: 'weight', label: 'Highest draw weight' },
];

/**
 * Search, status filter and sort for the (server-rendered) pack grid. Pack tiles opt in with `data-pack` plus
 * `data-search`, `data-status` (live | inactive | draft), `data-order`, `data-name`, `data-cards` and `data-weight`.
 * We toggle `hidden` and the CSS `order` rather than re-rendering, so each tile keeps its forms and confirm dialogs.
 * Press "/" anywhere to jump to the search box.
 */
export function PackToolbar({ counts }: { counts: Record<Filter, number> }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('default');
  const [shown, setShown] = useState(counts.all);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = query.trim().toLowerCase();
    const tiles = [...document.querySelectorAll<HTMLElement>('[data-pack]')];
    let count = 0;
    for (const t of tiles) {
      const match = (!q || (t.dataset.search ?? '').includes(q)) && (filter === 'all' || t.dataset.status === filter);
      t.hidden = !match;
      if (match) count++;
    }
    const num = (t: HTMLElement, k: string) => Number(t.dataset[k] ?? 0);
    const sorted = [...tiles].sort((a, b) => {
      if (sort === 'name') return (a.dataset.name ?? '').localeCompare(b.dataset.name ?? '');
      if (sort === 'cards') return num(b, 'cards') - num(a, 'cards');
      if (sort === 'weight') return num(b, 'weight') - num(a, 'weight');
      return num(a, 'order') - num(b, 'order');
    });
    sorted.forEach((t, i) => { t.style.order = String(i); });
    setShown(count);
  }, [query, filter, sort]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
      if (e.key === '/' && !typing) { e.preventDefault(); inputRef.current?.focus(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[14rem] max-w-sm">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm pointer-events-none"><Icon name="search" /></span>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') setQuery(''); }}
            placeholder="Search packs or seasons…  ( / )"
            aria-label="Search packs"
            className="w-full bg-gray-950 border border-gray-700 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500 transition-colors"
          />
        </div>

        <div role="group" aria-label="Filter by status" className="flex items-center gap-1">
          {FILTERS.filter(f => f.id === 'all' || counts[f.id] > 0).map(f => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${
                filter === f.id ? 'border-yellow-500 bg-yellow-500/10 text-yellow-300' : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white'
              }`}
            >
              {f.label} <span className="text-xs opacity-70 tabular-nums">{counts[f.id]}</span>
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-xs text-gray-500 ml-auto">
          Sort
          <select
            value={sort}
            onChange={e => setSort(e.target.value as Sort)}
            className="bg-gray-950 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-yellow-500"
          >
            {SORTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
      </div>

      {shown === 0 && (
        <p className="text-sm text-amber-400">
          No packs match{query.trim() ? ` “${query.trim()}”` : ''}{filter !== 'all' ? ` in ${FILTERS.find(f => f.id === filter)?.label}` : ''}.{' '}
          <button type="button" onClick={() => { setQuery(''); setFilter('all'); }} className="underline hover:text-amber-200">Clear filters</button>
        </p>
      )}
    </div>
  );
}
