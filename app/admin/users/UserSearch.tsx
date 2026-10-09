'use client';
import { useEffect, useRef, useState } from 'react';

/**
 * Filters the (server-rendered) user rows by username / display name. Rows opt in with a
 * `data-search` attribute holding their lowercase searchable text; we toggle `hidden` on them
 * rather than re-rendering the list, so each row keeps its own open/closed state and forms.
 * Press "/" anywhere on the page to jump to the box.
 */
export function UserSearch({ total }: { total: number }) {
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(total);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = query.trim().toLowerCase();
    let count = 0;
    document.querySelectorAll<HTMLElement>('[data-search]').forEach(row => {
      const match = !q || (row.dataset.search ?? '').includes(q);
      row.hidden = !match;
      if (match) count++;
    });
    setShown(count);
  }, [query]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (e.key === '/' && !typing) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="px-6 py-3 border-b border-gray-800 flex items-center gap-3">
      <div className="relative flex-1 max-w-sm">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm pointer-events-none">🔍</span>
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') setQuery(''); }}
          placeholder="Search collectors…  ( / )"
          aria-label="Search collectors"
          className="w-full bg-gray-950 border border-gray-700 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500 transition-colors"
        />
      </div>
      <span className="text-xs text-gray-500 tabular-nums">
        {query.trim() ? `${shown} of ${total}` : `${total} collector${total !== 1 ? 's' : ''}`}
      </span>
      {query.trim() && shown === 0 && <span className="text-xs text-amber-400">No collectors match “{query.trim()}”</span>}
    </div>
  );
}
