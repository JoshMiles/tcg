'use client';
// A row under a colour field (ROADMAP 38.21): the active packs' accents, the site theme, the 8 latest colours used (localStorage),
// the staff-wide saved swatches (KV) and an eyedropper where the browser has one. Shared by both editors.
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/app/components/Icon';

interface Sets { packs: string[]; theme: string[]; saved: string[] }
const RECENT_KEY = 'tcg:recent-colours';
const HEX = /^#[0-9a-f]{6}$/i;
let loaded: Promise<Sets | null> | null = null;
const load = () => (loaded ??= fetch('/api/admin/swatches').then(r => (r.ok ? r.json() : null)).catch(() => null));

const readRecent = (): string[] => { try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'); return Array.isArray(v) ? v.filter(c => typeof c === 'string' && HEX.test(c)).slice(0, 8) : []; } catch { return []; } };
const writeRecent = (c: string) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify([c, ...readRecent().filter(x => x !== c)].slice(0, 8))); } catch { /* storage blocked */ } };

declare global { interface Window { EyeDropper?: new () => { open(): Promise<{ sRGBHex: string }> } } }

export function Swatches({ value, onPick }: { value: string; onPick: (v: string) => void }) {
  const [sets, setSets] = useState<Sets | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [eye, setEye] = useState(false);
  const first = useRef(true);
  const row = useRef<HTMLSpanElement>(null);
  useEffect(() => { load().then(setSets); setRecent(readRecent()); setEye(!!window.EyeDropper); }, []);
  // A colour counts as used once it has stopped changing for a moment, and only if this field has focus (a new selection changes the value too).
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (!HEX.test(value)) return;
    const t = setTimeout(() => {
      if (!row.current?.parentElement?.contains(document.activeElement)) return;
      writeRecent(value.toLowerCase()); setRecent(readRecent());
    }, 800);
    return () => clearTimeout(t);
  }, [value]);

  const persist = (saved: string[]) => {
    if (!sets) return;
    const next = { ...sets, saved };
    setSets(next);
    loaded = Promise.resolve(next); // later colour fields mounted in this session start from the new list
    fetch('/api/admin/swatches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ saved }) }).catch(() => {});
  };
  const cur = HEX.test(value) ? value.toLowerCase() : null;
  const dot = (c: string, kind: string, onRemove?: () => void) => (
    <button key={kind + c} type="button" title={`${kind} ${c}${onRemove ? ' (right-click to remove)' : ''}`} aria-label={`${kind} ${c}`} onClick={() => onPick(c)}
      onContextMenu={onRemove && (e => { e.preventDefault(); onRemove(); })} style={{ background: c }} className="w-4 h-4 rounded-sm border border-gray-600 hover:border-white" />
  );
  const saved = sets?.saved ?? [];
  return (
    <span ref={row} className="flex flex-wrap items-center gap-1" role="group" aria-label="Swatches">
      {recent.map(c => dot(c, 'Recent'))}
      {sets?.packs.map(c => dot(c, 'Pack'))}
      {sets?.theme.map(c => dot(c, 'Theme'))}
      {saved.map(c => dot(c, 'Saved', () => persist(saved.filter(x => x !== c))))}
      {sets && cur && !saved.includes(cur) && saved.length < 24 && (
        <button type="button" aria-label="Save this colour as a swatch" title="Save this colour as a swatch" onClick={() => persist([...saved, cur])} className="w-4 h-4 flex items-center justify-center rounded-sm border border-dashed border-gray-500 text-gray-400 hover:text-white text-xs"><Icon name="plus" /></button>
      )}
      {eye && (
        <button type="button" aria-label="Pick a colour from the screen" title="Pick a colour from the screen" className="p-0.5 text-gray-300 hover:text-white"
          onClick={() => { new window.EyeDropper!().open().then(r => onPick(r.sRGBHex.toLowerCase())).catch(() => {}); }}><Icon name="pipette" /></button>
      )}
    </span>
  );
}
