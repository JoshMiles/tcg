'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/app/components/Icon';
import { cleanQuery, type SearchItem } from '@/lib/site-search';
import { profileHref } from '@/lib/profile-url';

/** A search box that suggests collectors as you type (same source as the site search) and opens the profile you pick or type. */
export function CollectorFinder() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchItem[]>([]);
  const [index, setIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const query = cleanQuery(q);
    if (!query) { setHits([]); return; }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: ctl.signal, cache: 'no-store' })
        .then(r => (r.ok ? r.json() : { results: [] }))
        .then(d => setHits((Array.isArray(d.results) ? d.results : []).filter((r: SearchItem) => r.kind === 'player')))
        .catch(() => { /* suggestions are optional */ });
    }, 150);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q]);
  useEffect(() => setIndex(-1), [hits]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const pick = hits[index];
    const name = cleanQuery(q).toLowerCase();
    if (pick) router.push(pick.href); else if (name) router.push(profileHref(name));
  }
  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown' && hits.length) { e.preventDefault(); setIndex(i => Math.min(hits.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp' && hits.length) { e.preventDefault(); setIndex(i => Math.max(-1, i - 1)); }
  }

  return (
    <form onSubmit={submit} className="relative">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Icon name="search" className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            ref={inputRef} value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKey} autoFocus autoComplete="off" spellCheck={false}
            placeholder="Twitch username…" aria-label="Twitch username" role="combobox" aria-expanded={hits.length > 0} aria-controls="finder-list"
            className="w-full bg-gray-950 border border-gray-700 rounded-xl pl-11 pr-4 py-3.5 text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500 focus:shadow-glow transition"
          />
        </div>
        <button type="submit" className="px-6 tcg-btn rounded-xl text-sm shrink-0">Go →</button>
      </div>
      {hits.length > 0 && (
        <ul id="finder-list" role="listbox" className="absolute z-10 left-0 right-[5.5rem] mt-2 rounded-xl border border-gray-700 bg-gray-900 shadow-card p-1.5">
          {hits.map((h, i) => (
            <li key={h.id} role="option" aria-selected={i === index}>
              <button type="button" onClick={() => router.push(h.href)} onMouseMove={() => setIndex(i)} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm ${i === index ? 'bg-yellow-500/10 text-yellow-100' : 'text-gray-300'}`}>
                <Icon name="user" className="text-gray-500" /><span className="font-mono">{h.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
