'use client';
import { Icon, type IconName } from '@/app/components/Icon';

// A column of collapsible panels (Properties, Layers, History ...) shared by the editors; it knows nothing about their content.
// Add a panel by adding one entry. Open panels share the height by `weight` and scroll inside; collapsed ones are just a title bar (28 px).
// Which are collapsed is owned by the caller (`useColumnLayout` keeps it in localStorage). `onRail` adds a button to the first header that folds the column.

export interface PanelDef { id: string; title: string; icon: IconName; content: React.ReactNode; weight?: number; hidden?: boolean }

export function PanelStack({ panels, collapsed, onToggle, onRail }: { panels: PanelDef[]; collapsed: string[]; onToggle: (id: string) => void; onRail?: () => void }) {
  return (
    <div className="min-h-0 h-full flex flex-col rounded-xl border border-gray-800 bg-gray-900/80 overflow-hidden">
      {panels.filter(p => !p.hidden).map((p, i) => {
        const open = !collapsed.includes(p.id);
        return (
          <section key={p.id} aria-label={p.title} style={open ? { flexGrow: p.weight ?? 1 } : undefined} className={`flex flex-col border-b border-gray-800/80 last:border-0 ${open ? 'basis-0 min-h-0' : 'shrink-0'}`}>
            <div className="h-7 shrink-0 flex items-center bg-gray-950/40 hover:bg-white/5">
              <button type="button" onClick={() => onToggle(p.id)} aria-expanded={open} className="flex-1 min-w-0 h-full flex items-center gap-1.5 px-2 text-left">
                <Icon name="chevronRight" className={`w-3 h-3 text-gray-500 transition-transform ${open ? 'rotate-90' : ''}`} />
                <Icon name={p.icon} className="text-gray-400" />
                <span className="text-xs font-semibold text-gray-200 truncate">{p.title}</span>
              </button>
              {i === 0 && onRail && (
                <button type="button" onClick={onRail} aria-label="Collapse the side panels to icons" title="Collapse to icons" className="hidden xl:flex h-full px-2 items-center text-gray-500 hover:text-white">
                  <Icon name="chevronRight" className="w-3 h-3" />
                </button>
              )}
            </div>
            {open && <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">{p.content}</div>}
          </section>
        );
      })}
    </div>
  );
}
