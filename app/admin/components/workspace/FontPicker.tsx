'use client';
// A font picker for the editors (ROADMAP 38.11 b). Generic: it gets the fonts, the value, a sample text and callbacks, and imports nothing from
// the overlay or the card back. Each row is set in its own face (loaded when the row scrolls into view), with a search box, category tabs, the
// last 5 used and starred favourites (localStorage, shared by both editors). Hovering or arrowing onto a row calls `onPreview(id)`; leaving,
// closing or picking calls `onPreview(null)`, so the editor can show the font without an undo step.
import { useEffect, useId, useMemo, useRef, useState } from 'react';

export interface PickerFont { id: string; label: string; css: string; category: string }

const RECENT_KEY = 'tcg:font-recent';
const FAV_KEY = 'tcg:font-fav';
const readIds = (key: string): string[] => {
  try { const v = JSON.parse(localStorage.getItem(key) ?? '[]'); return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []; } catch { return []; }
};
const writeIds = (key: string, ids: string[]) => { try { localStorage.setItem(key, JSON.stringify(ids)); } catch { /* storage blocked */ } };

export function FontPicker({ fonts, value, onChange, sample, categories, onNeedFont, onPreview, label = 'Font', extra }: {
  fonts: PickerFont[];
  value: string;
  onChange: (id: string) => void;
  /** The layer's actual text; each row shows a short piece of it (the font name when empty). */
  sample?: string;
  categories: readonly string[];
  /** Called once per font when its row first scrolls into view (the editor starts loading the file). */
  onNeedFont?: (id: string) => void;
  onPreview?: (id: string | null) => void;
  label?: string;
  /** Extra non-font choices shown first (e.g. "Overlay font" meaning inherit). */
  extra?: PickerFont[];
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('All');
  const [recent, setRecent] = useState<string[]>([]);
  const [fav, setFav] = useState<string[]>([]);
  const [hi, setHi] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const seen = useRef(new Set<string>());
  const io = useRef<IntersectionObserver | null>(null);
  const uid = useId();

  useEffect(() => { setRecent(readIds(RECENT_KEY)); setFav(readIds(FAV_KEY)); }, [open]);

  const all = useMemo(() => [...(extra ?? []), ...fonts], [extra, fonts]);
  const byId = useMemo(() => new Map(all.map(f => [f.id, f])), [all]);
  const current = byId.get(value) ?? all[0];

  // The rows in order: recent and favourites first (on the All tab with no search), then the matching fonts.
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const match = (f: PickerFont) => (!needle || f.label.toLowerCase().includes(needle)) && (tab === 'All' || tab === 'Favourites' ? true : f.category === tab);
    const out: { key: string; font: PickerFont; group: string }[] = [];
    const lead = !needle && tab === 'All';
    if (lead) {
      for (const id of recent) { const f = byId.get(id); if (f && id !== 'inherit') out.push({ key: `r-${id}`, font: f, group: 'Recently used' }); }
    }
    if (lead || tab === 'Favourites') {
      for (const id of fav) { const f = byId.get(id); if (f && match(f)) out.push({ key: `f-${id}`, font: f, group: 'Favourites' }); }
    }
    if (tab !== 'Favourites') for (const f of all) if (match(f)) out.push({ key: `a-${f.id}`, font: f, group: f.id === 'inherit' ? '' : 'All fonts' });
    return out;
  }, [all, byId, q, tab, recent, fav]);

  const hiId = open ? rows[Math.min(hi, rows.length - 1)]?.font.id : undefined;
  useEffect(() => { onPreview?.(open && hiId && hiId !== value ? hiId : null); }, [open, hiId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onPreview?.(null), []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  // Load a font's file only when its row is on screen.
  useEffect(() => {
    if (!open || typeof IntersectionObserver === 'undefined') return;
    io.current = new IntersectionObserver(entries => {
      for (const en of entries) {
        const id = (en.target as HTMLElement).dataset.fontId;
        if (en.isIntersecting && id && !seen.current.has(id)) { seen.current.add(id); onNeedFont?.(id); }
      }
    }, { root: list.current, rootMargin: '80px' });
    list.current?.querySelectorAll('[data-font-id]').forEach(el => io.current!.observe(el));
    return () => io.current?.disconnect();
  }, [open, rows, onNeedFont]);

  useEffect(() => { list.current?.querySelector(`#${CSS.escape(`${uid}-${hi}`)}`)?.scrollIntoView({ block: 'nearest' }); }, [hi, uid]);

  const pick = (id: string) => {
    if (id !== 'inherit') { const next = [id, ...recent.filter(x => x !== id)].slice(0, 5); setRecent(next); writeIds(RECENT_KEY, next); }
    onChange(id);
    setOpen(false);
  };
  const star = (id: string) => { const next = fav.includes(id) ? fav.filter(x => x !== id) : [...fav, id]; setFav(next); writeIds(FAV_KEY, next); };
  const close = () => setOpen(false);
  const shown = (f: PickerFont) => (sample && sample.trim() ? sample.trim().slice(0, 28) : f.label);
  const tabs = ['All', 'Favourites', ...categories];

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(rows.length - 1, h + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(0, h - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); const r = rows[Math.min(hi, rows.length - 1)]; if (r) pick(r.font.id); }
  };

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => { setOpen(o => !o); setHi(0); setQ(''); setTab('All'); }}
        className="select select-sm w-full text-left"
        style={{ fontFamily: current?.css }}
      >
        {current?.label}
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-72 max-w-[85vw] rounded-lg border border-gray-700 bg-gray-950 shadow-xl" onKeyDown={onKey}>
          <div className="p-2 space-y-2 border-b border-gray-800">
            <input
              autoFocus
              type="search"
              role="combobox"
              aria-expanded
              aria-controls={`${uid}-list`}
              aria-activedescendant={rows.length ? `${uid}-${Math.min(hi, rows.length - 1)}` : undefined}
              aria-label={`Search ${label.toLowerCase()}s`}
              placeholder="Search fonts"
              value={q}
              onChange={e => { setQ(e.target.value); setHi(0); }}
              className="input input-sm w-full"
            />
            <div className="flex flex-wrap gap-1" role="tablist" aria-label="Font categories">
              {tabs.map(t => (
                <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => { setTab(t); setHi(0); }}
                  className={`px-2 py-0.5 text-[11px] font-semibold rounded-md border ${tab === t ? 'bg-yellow-500/15 border-yellow-500/50 text-yellow-300' : 'bg-gray-800 border-gray-700 text-gray-300 hover:text-white'}`}>{t}</button>
              ))}
            </div>
          </div>
          <div ref={list} id={`${uid}-list`} role="listbox" aria-label={label} className="max-h-72 overflow-y-auto py-1" onMouseLeave={() => setHi(Math.max(0, rows.findIndex(r => r.font.id === value)))}>
            {rows.length === 0 && <p className="px-3 py-4 text-xs text-gray-500">{tab === 'Favourites' ? 'Star a font to keep it here.' : 'No font matches.'}</p>}
            {rows.map((r, i) => {
              const f = r.font;
              const head = i === 0 || rows[i - 1].group !== r.group;
              return (
                <div key={r.key}>
                  {head && r.group && <div className="px-3 pt-2 pb-0.5 text-[10px] uppercase tracking-wider text-gray-500">{r.group}</div>}
                  <div className={`flex items-center ${i === hi ? 'bg-white/10' : ''}`} onMouseEnter={() => setHi(i)}>
                    <div
                      id={`${uid}-${i}`}
                      role="option"
                      aria-selected={f.id === value}
                      data-font-id={f.id}
                      onClick={() => pick(f.id)}
                      className="flex-1 min-w-0 px-3 py-1.5 cursor-pointer"
                    >
                      <div className="text-[10px] text-gray-500 truncate">{f.label}{f.id === value ? ' (current)' : ''}</div>
                      <div className="text-lg leading-tight text-white truncate" style={{ fontFamily: f.css }}>{shown(f)}</div>
                    </div>
                    {f.id !== 'inherit' && (
                      <button type="button" tabIndex={-1} aria-pressed={fav.includes(f.id)} aria-label={`${fav.includes(f.id) ? 'Unstar' : 'Star'} ${f.label}`} onClick={() => star(f.id)}
                        className={`px-2 text-base ${fav.includes(f.id) ? 'text-yellow-400' : 'text-gray-600 hover:text-gray-300'}`}>{fav.includes(f.id) ? '★' : '☆'}</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
