'use client';
import { Icon } from '@/app/components/Icon';
import { useEffect, useRef, useState } from 'react';
import { useSlashFocus } from '../../components/use-slash-focus';

/**
 * Search + rarity filter for the (server-rendered) cards table. Rows opt in with `data-card`, `data-search` (lowercase
 * name and number) and `data-stars`; we toggle `hidden` instead of re-rendering so each row keeps its forms and dialogs.
 */
export function CardFilter({ total, stars }: { total: number; stars: number[] }) {
  const [query, setQuery] = useState('');
  const [star, setStar] = useState(0); // 0 = all
  const [shown, setShown] = useState(total);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = query.trim().toLowerCase();
    let count = 0;
    document.querySelectorAll<HTMLElement>('[data-card]').forEach(row => {
      const match = (!q || (row.dataset.search ?? '').includes(q)) && (star === 0 || Number(row.dataset.stars) === star);
      row.hidden = !match;
      if (match) count++;
    });
    setShown(count);
  }, [query, star]);

  useSlashFocus(inputRef);

  if (total < 6) return null; // not worth a filter for a handful of cards

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative flex-1 min-w-48 max-w-xs">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm pointer-events-none"><Icon name="search" /></span>
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') setQuery(''); }}
          placeholder="Search cards…  ( / )"
          aria-label="Search cards"
          className="w-full bg-gray-950 border border-gray-700 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-hidden focus:border-yellow-500 transition-colors"
        />
      </div>
      <div role="group" aria-label="Filter by rarity" className="flex items-center gap-1">
        {[0, ...stars].map(s => (
          <button
            key={s}
            type="button"
            aria-pressed={star === s}
            onClick={() => setStar(s)}
            className={`px-2.5 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${
              star === s ? 'border-yellow-500 bg-yellow-500/10 text-yellow-300' : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white'
            }`}
          >
            {s === 0 ? 'All' : `${s}★`}
          </button>
        ))}
      </div>
      <span className="text-xs text-gray-500 tabular-nums">{query.trim() || star ? `${shown} of ${total}` : `${total} cards`}</span>
      {shown === 0 && <span className="text-xs text-amber-400">No cards match</span>}
    </div>
  );
}
