'use client';
import { useEffect, useState } from 'react';
import { Icon, type IconName } from '@/app/components/Icon';

// A column of collapsible panels (Properties, Layers, History ...) shared by the editors; it knows nothing about their content.
// Add a panel by adding one entry. Open panels share the height by `weight` and scroll inside; collapsed ones are just a title bar.
// Which are collapsed is kept in localStorage under `storageKey` (an editor aid; storage may be blocked).

export interface PanelDef { id: string; title: string; icon: IconName; content: React.ReactNode; weight?: number; hidden?: boolean }

export function PanelStack({ panels, storageKey }: { panels: PanelDef[]; storageKey: string }) {
  const [collapsed, setCollapsed] = useState<string[]>([]);
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
      if (Array.isArray(v)) setCollapsed(v.filter((x): x is string => typeof x === 'string'));
    } catch { /* storage blocked or corrupt */ }
  }, [storageKey]);
  const toggle = (id: string) => setCollapsed(prev => {
    const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  });
  return (
    <div className="min-h-0 h-full flex flex-col rounded-xl border border-gray-800 bg-gray-900/80 overflow-hidden">
      {panels.filter(p => !p.hidden).map(p => {
        const open = !collapsed.includes(p.id);
        return (
          <section key={p.id} aria-label={p.title} style={open ? { flexGrow: p.weight ?? 1 } : undefined} className={`flex flex-col border-b border-gray-800/80 last:border-0 ${open ? 'basis-0 min-h-0' : 'shrink-0'}`}>
            <button type="button" onClick={() => toggle(p.id)} aria-expanded={open} className="w-full shrink-0 flex items-center gap-2 px-3 py-1.5 text-left hover:bg-white/5 bg-gray-950/40">
              <Icon name="chevronRight" className={`w-3 h-3 text-gray-500 transition-transform ${open ? 'rotate-90' : ''}`} />
              <Icon name={p.icon} className="text-gray-400" />
              <span className="text-sm font-semibold text-gray-200">{p.title}</span>
            </button>
            {open && <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">{p.content}</div>}
          </section>
        );
      })}
    </div>
  );
}
