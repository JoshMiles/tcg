'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Icon } from '@/app/components/Icon';
import { STATIC_ITEMS, rankItems, type PaletteItem } from '@/lib/palette';
import { ALL_SHORTCUTS, IDLE, isTypingTarget, stepSequence, type SeqState } from '@/lib/shortcuts';
import { Dialog } from './Dialog';
import { NewPackDialog } from './NewPackButton';

const OPEN_EVENT = 'tcg:palette';

/** The sidebar's "Search" button; opens the palette (which listens for the event). */
export function PaletteButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
      title="Search and jump to anything (Ctrl/⌘ + K)"
      className="aside-item w-full flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white/4 hover:bg-white/8 border border-white/6 text-gray-400 hover:text-white text-sm transition-colors"
    >
      <Icon name="search" className="shrink-0" />
      <span className="aside-label flex-1 text-left truncate">Search…</span>
      <kbd className="aside-label text-[10px] font-sans font-bold text-gray-500 border border-gray-700 rounded-sm px-1.5 py-px">⌘K</kbd>
    </button>
  );
}

const KeyCap = ({ k }: { k: string }) => <kbd className="min-w-6 whitespace-nowrap text-center text-[11px] font-sans font-bold text-gray-300 bg-gray-800 border border-gray-700 rounded-md px-1.5 py-0.5">{k}</kbd>;

/**
 * Admin-wide keyboard layer, mounted once: Ctrl/⌘+K opens the command palette, "g" then a letter jumps to a page, "?" lists the
 * shortcuts. Everything except Ctrl/⌘+K and Esc is ignored while typing in a field or holding a modifier.
 */
export function AdminKeyboard({ overlayKey }: { overlayKey?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const [newPack, setNewPack] = useState(false);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const [dynamicItems, setDynamicItems] = useState<PaletteItem[]>([]);
  const [loadedAt, setLoadedAt] = useState(0);
  const seq = useRef<SeqState>(IDLE);
  const listRef = useRef<HTMLUListElement>(null);

  const close = useCallback(() => { setOpen(false); setQuery(''); setIndex(0); }, []);

  // Open from anywhere (button or Ctrl/⌘+K) and refresh the records at most every 30 seconds.
  useEffect(() => {
    const openIt = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, openIt);
    return () => window.removeEventListener(OPEN_EVENT, openIt);
  }, []);
  useEffect(() => {
    if (!open || Date.now() - loadedAt < 30_000) return;
    let cancelled = false;
    fetch('/api/admin/palette', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!cancelled && d?.items) { setDynamicItems(d.items); setLoadedAt(Date.now()); } })
      .catch(() => { /* pages and actions still work without the records */ });
    return () => { cancelled = true; };
  }, [open, loadedAt]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(o => !o); return; }
      if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
      if (e.key === '?') { e.preventDefault(); setHelp(h => !h); return; }
      if (e.key.length !== 1) return;
      const r = stepSequence(seq.current, e.key, Date.now());
      seq.current = r.state;
      if (r.go) { e.preventDefault(); router.push(r.go); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router]);

  const results = useMemo(() => rankItems([...STATIC_ITEMS, ...dynamicItems], query, 40), [dynamicItems, query]);
  useEffect(() => setIndex(0), [query]);
  useEffect(() => { listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' }); }, [index, results]);

  function run(item: PaletteItem) {
    close();
    if (item.href) { router.push(item.href); return; }
    switch (item.action) {
      case 'new-pack': setNewPack(true); break;
      case 'copy-overlay': navigator.clipboard?.writeText(`${window.location.origin}/overlay.html${overlayKey ? `?key=${overlayKey}` : ''}`).catch(() => {}); break;
      case 'open-preview': window.open('/overlay.html', '_blank'); break;
      case 'exit-sandbox': postForm('/api/sandbox/exit?to=/admin/sandbox'); break;
      case 'logout': postForm('/api/auth/logout'); break;
    }
  }

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setIndex(i => Math.min(results.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex(i => Math.max(0, i - 1)); }
    else if (e.key === 'Enter' && results[index]) { e.preventDefault(); run(results[index]); }
  }

  // Group headings, but only when the group changes in the (already ranked) list.
  let lastGroup = '';
  const goShortcuts = ALL_SHORTCUTS.filter(s => s.group === 'Go to');
  const anywhere = ALL_SHORTCUTS.filter(s => s.group === 'Anywhere');

  return (
    <>
      {open && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-80" role="dialog" aria-modal="true" aria-label="Command palette">
          <div className="absolute inset-0 bg-gray-950/70 backdrop-blur-xs" onClick={close} />
          <div className="relative mx-auto mt-[12vh] w-[calc(100%-2rem)] max-w-xl card rounded-2xl shadow-2xl shadow-black/60 overflow-hidden">
            <div className="flex items-center gap-3 px-4 border-b border-gray-800">
              <Icon name="search" className="text-gray-500 shrink-0" />
              <input
                autoFocus value={query} onChange={e => setQuery(e.target.value)} onKeyDown={onInputKey}
                placeholder="Search pages, packs, seasons, viewers, actions…" aria-label="Search the admin"
                className="flex-1 bg-transparent py-4 text-sm text-white placeholder-gray-600 focus:outline-hidden"
              />
              <kbd className="text-[10px] font-sans font-bold text-gray-500 border border-gray-700 rounded-sm px-1.5 py-px">Esc</kbd>
            </div>
            <ul ref={listRef} className="max-h-[50vh] overflow-y-auto py-2" role="listbox">
              {results.length === 0 && <li className="px-5 py-8 text-center text-sm text-gray-500">Nothing matches “{query}”.</li>}
              {results.map((it, i) => {
                const head = it.group !== lastGroup ? it.group : null;
                lastGroup = it.group;
                return (
                  <li key={it.id} role="option" aria-selected={i === index}>
                    {head && <p className="px-5 pt-2 pb-1 text-[10px] uppercase tracking-wider font-extrabold text-gray-600">{head}</p>}
                    <button
                      type="button" data-active={i === index} onMouseMove={() => setIndex(i)} onClick={() => run(it)}
                      className={`w-full flex items-center gap-3 px-5 py-2 text-left text-sm transition-colors ${i === index ? 'bg-yellow-500/10 text-yellow-100' : 'text-gray-300'}`}
                    >
                      <Icon name={it.icon} className={i === index ? 'text-yellow-400' : 'text-gray-500'} />
                      <span className="flex-1 truncate">{it.label}</span>
                      {it.hint && <span className="text-xs text-gray-600 truncate max-w-40">{it.hint}</span>}
                      {it.keys && <span className="flex gap-1">{it.keys.map(k => <KeyCap key={k} k={k} />)}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="flex items-center gap-4 px-5 py-2.5 border-t border-gray-800 text-[11px] text-gray-500">
              <span><KeyCap k="↑" /> <KeyCap k="↓" /> move</span><span><KeyCap k="↵" /> open</span>
              <button type="button" onClick={() => { close(); setHelp(true); }} className="ml-auto hover:text-gray-300">All shortcuts <KeyCap k="?" /></button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      <NewPackDialog open={newPack} onClose={() => setNewPack(false)} />

      <Dialog open={help} onClose={() => setHelp(false)} title="Keyboard shortcuts" size="md">
        <div className="p-6 grid gap-6 sm:grid-cols-2">
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wider font-extrabold text-gray-500">Anywhere</p>
            {anywhere.map(s => <ShortcutRow key={s.label} keys={s.keys} label={s.label} />)}
          </div>
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wider font-extrabold text-gray-500">Go to (press g, then…)</p>
            {goShortcuts.map(s => <ShortcutRow key={s.label} keys={s.keys.slice(1)} label={s.label} />)}
          </div>
        </div>
      </Dialog>
    </>
  );
}

function ShortcutRow({ keys, label }: { keys: string[]; label: string }) {
  return <div className="flex items-center justify-between gap-3 text-sm text-gray-300"><span>{label}</span><span className="flex gap-1">{keys.map(k => <KeyCap key={k} k={k} />)}</span></div>;
}

/** POSTs to an endpoint by submitting a throwaway form (the logout and sandbox-exit routes redirect, so a fetch won't do). */
function postForm(action: string) {
  const f = document.createElement('form');
  f.method = 'POST'; f.action = action;
  document.body.appendChild(f);
  f.submit();
}

