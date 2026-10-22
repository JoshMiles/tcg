'use client';
import { useEffect, useState } from 'react';
import { COLUMN_DEFAULT, clampColumn } from './workspace-math';

// State of a resizable, collapsible right column of panels: its width (rem), whether it is folded to an icon strip, and which panels
// are collapsed. Kept in localStorage under `key` (an editor aid; storage may be blocked, then the defaults apply).
// `resetColumnLayout()` (a menu item) puts every column back to its defaults.

export interface ColumnState { width: number; railed: boolean; collapsed: string[] }
const RESET = 'tcg:workspace-reset';
export const resetColumnLayout = () => window.dispatchEvent(new Event(RESET));

export function useColumnLayout(key: string, defaultCollapsed: string[] = []) {
  const base: ColumnState = { width: COLUMN_DEFAULT, railed: false, collapsed: defaultCollapsed };
  const [s, setS] = useState<ColumnState>(base);
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(key) ?? 'null');
      if (v && typeof v === 'object') setS({
        width: clampColumn(Number(v.width ?? COLUMN_DEFAULT)),
        railed: v.railed === true,
        collapsed: Array.isArray(v.collapsed) ? v.collapsed.filter((x: unknown): x is string => typeof x === 'string') : defaultCollapsed,
      });
    } catch { /* storage blocked or corrupt */ }
    const reset = () => { setS(base); try { localStorage.removeItem(key); } catch { /* ignore */ } };
    window.addEventListener(RESET, reset);
    return () => window.removeEventListener(RESET, reset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const update = (patch: (p: ColumnState) => Partial<ColumnState>) => setS(p => {
    const next = { ...p, ...patch(p) };
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  });
  return {
    ...s,
    setWidth: (rem: number) => update(() => ({ width: clampColumn(rem) })),
    setRailed: (railed: boolean) => update(() => ({ railed })),
    toggle: (id: string) => update(p => ({ collapsed: p.collapsed.includes(id) ? p.collapsed.filter(x => x !== id) : [...p.collapsed, id] })),
    /** Unfold the column with this panel open. */
    reveal: (id: string) => update(p => ({ railed: false, collapsed: p.collapsed.filter(x => x !== id) })),
  };
}
