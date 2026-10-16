'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Icon, type IconName } from '@/app/components/Icon';
import { PUBLIC_PAGES, cleanQuery, rankSearch, type SearchItem, type SearchKind } from '@/lib/site-search';
import { isTypingTarget } from '@/lib/shortcuts';
import { getRarity } from '@/lib/rarity';

export const OPEN_SEARCH_EVENT = 'tcg:site-search';

const GROUPS: { kind: SearchKind; title: string; icon: IconName }[] = [
  { kind: 'copy', title: 'Card print', icon: 'cards' },
  { kind: 'player', title: 'Collectors', icon: 'user' },
  { kind: 'card', title: 'Cards', icon: 'cards' },
  { kind: 'page', title: 'Pages', icon: 'compass' },
];

/** The top bar's search button (an icon on phones, a labelled field-like button on wide screens). */
export function SearchButton({ className = '' }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_SEARCH_EVENT))}
      aria-label="Search collectors, cards and pages"
      title="Search (press /)"
      className={`inline-flex items-center gap-2 rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-colors ${className}`}
    >
      <Icon name="search" className="w-[1.05rem] h-[1.05rem]" />
      <span className="hidden 2xl:inline text-sm">Search</span>
      <kbd className="hidden 2xl:inline text-[10px] font-sans font-bold text-gray-500 border border-gray-700 rounded px-1.5 py-px">/</kbd>
    </button>
  );
}

/**
 * Site-wide search: press "/" or Ctrl/⌘+K anywhere (or tap the search button) to find a collector, a card or a page.
 * Collectors and cards come from /api/search; pages are matched in the browser so they appear instantly.
 */
export function SiteSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [remote, setRemote] = useState<SearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  const close = useCallback(() => {
    setOpen(false); setQuery(''); setRemote([]); setIndex(0);
    returnFocus.current?.focus?.();
  }, []);
  const openIt = useCallback(() => { returnFocus.current = document.activeElement as HTMLElement | null; setOpen(true); }, []);

  useEffect(() => {
    window.addEventListener(OPEN_SEARCH_EVENT, openIt);
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(o => { if (!o) returnFocus.current = document.activeElement as HTMLElement | null; return !o; }); return; }
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !isTypingTarget(e.target)) { e.preventDefault(); openIt(); }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener(OPEN_SEARCH_EVENT, openIt); window.removeEventListener('keydown', onKey); };
  }, [openIt]);

  // Ask the server for collectors and cards, a moment after typing stops; only the newest answer is used.
  useEffect(() => {
    const q = cleanQuery(query);
    if (!open || !q) { setRemote([]); setLoading(false); return; }
    setLoading(true);
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctl.signal, cache: 'no-store' })
        .then(r => (r.ok ? r.json() : { results: [] }))
        .then(d => { setRemote(Array.isArray(d.results) ? d.results : []); setLoading(false); })
        .catch(e => { if (e?.name !== 'AbortError') setLoading(false); });
    }, 150);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [query, open]);

  const results = useMemo<SearchItem[]>(() => {
    const q = cleanQuery(query);
    // Nothing typed yet: offer the main pages as shortcuts.
    if (!q) return PUBLIC_PAGES.filter(p => ['page:leaderboard', 'page:collection', 'page:cards', 'page:trade', 'page:account'].includes(p.id));
    const pages = rankSearch(PUBLIC_PAGES, q, 3);
    const entities = remote.filter(r => r.kind !== 'page');
    return [...entities.filter(r => r.kind === 'copy'), ...entities.filter(r => r.kind === 'player'), ...entities.filter(r => r.kind === 'card'), ...pages];
  }, [query, remote]);
  useEffect(() => setIndex(0), [results.length, query]);
  useEffect(() => { listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' }); }, [index]);

  const go = (it: SearchItem) => { close(); router.push(it.href); };

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setIndex(i => Math.min(results.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex(i => Math.max(0, i - 1)); }
    else if (e.key === 'Enter' && results[index]) { e.preventDefault(); go(results[index]); }
    else if (e.key === 'Enter' && cleanQuery(query)) { e.preventDefault(); close(); router.push(`/u/${encodeURIComponent(cleanQuery(query).toLowerCase())}`); }
  }

  if (!open || typeof document === 'undefined') return null;
  let lastKind = '';
  const q = cleanQuery(query);

  return createPortal(
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label="Search">
      <div className="absolute inset-0 bg-gray-950/70 backdrop-blur-sm" onClick={close} />
      <div className="relative mx-auto mt-[10vh] w-[calc(100%-2rem)] max-w-xl tcg-panel rounded-2xl shadow-2xl shadow-black/60 overflow-hidden">
        <div className="flex items-center gap-3 px-4 border-b border-gray-800">
          <Icon name="search" className="text-gray-500 shrink-0" />
          <input
            autoFocus value={query} onChange={e => setQuery(e.target.value)} onKeyDown={onInputKey}
            placeholder="Find a collector, a card or a page…" aria-label="Search" autoComplete="off"
            role="combobox" aria-expanded="true" aria-controls="site-search-list"
            className="flex-1 bg-transparent py-4 text-sm text-white placeholder-gray-600 focus:outline-none"
          />
          {loading && <span className="text-xs text-gray-600">…</span>}
          <kbd className="text-[10px] font-sans font-bold text-gray-500 border border-gray-700 rounded px-1.5 py-px">Esc</kbd>
        </div>
        <ul id="site-search-list" ref={listRef} className="max-h-[55vh] overflow-y-auto py-2" role="listbox">
          {!q && <li className="px-5 pt-1 pb-2 text-[10px] uppercase tracking-wider font-extrabold text-gray-600">Jump to</li>}
          {q && results.length === 0 && !loading && (
            <li className="px-5 py-6 text-center text-sm text-gray-500">
              No match for “{q}”.<br /><span className="text-xs text-gray-600">Press Enter to open <span className="text-gray-400">/u/{q.toLowerCase()}</span> anyway.</span>
            </li>
          )}
          {results.map((it, i) => {
            const grp = GROUPS.find(g => g.kind === it.kind)!;
            const head = q && it.kind !== lastKind ? grp.title : null;
            lastKind = it.kind;
            const rar = it.kind === 'card' && it.stars ? getRarity(it.stars) : null;
            return (
              <li key={it.id} role="option" aria-selected={i === index}>
                {head && <p className="px-5 pt-2 pb-1 text-[10px] uppercase tracking-wider font-extrabold text-gray-600">{head}</p>}
                <button
                  type="button" data-active={i === index} onMouseMove={() => setIndex(i)} onClick={() => go(it)}
                  className={`w-full flex items-center gap-3 px-5 py-2 text-left text-sm transition-colors ${i === index ? 'bg-yellow-500/10 text-yellow-100' : 'text-gray-300'}`}
                >
                  {it.image ? <img src={it.image} alt="" width={24} height={34} className="w-6 h-8 object-cover rounded shrink-0" /> : <Icon name={grp.icon} className={i === index ? 'text-yellow-400' : 'text-gray-500'} />}
                  <span className="flex-1 truncate">{it.label}</span>
                  {rar && <span className={`text-xs ${rar.text}`}>{'★'.repeat(it.stars!)}</span>}
                  {it.hint && <span className="text-xs text-gray-600 truncate max-w-[9rem]">{it.hint}</span>}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center gap-4 px-5 py-2.5 border-t border-gray-800 text-[11px] text-gray-500">
          <span>↑ ↓ move</span><span>↵ open</span><span className="ml-auto">Collectors and cards from the active season</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
