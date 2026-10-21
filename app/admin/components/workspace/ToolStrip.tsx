'use client';
import { Icon, type IconName } from '@/app/components/Icon';

// A vertical strip of tools (one active at a time) shared by the editors; it knows nothing about what a tool does.
export interface ToolDef { id: string; label: string; icon: IconName; shortcut: string }

export function ToolStrip({ tools, active, onSelect, label = 'Tools' }: { tools: ToolDef[]; active: string; onSelect: (id: string) => void; label?: string }) {
  return (
    <div role="toolbar" aria-label={label} aria-orientation="vertical" className="shrink-0 flex flex-col gap-1 rounded-xl bg-gray-900/80 border border-gray-800 p-1 self-start">
      {tools.map(t => (
        <button
          key={t.id}
          type="button"
          onClick={() => onSelect(t.id)}
          aria-pressed={active === t.id}
          aria-label={t.label}
          title={`${t.label} (${t.shortcut})`}
          className={`w-8 h-8 flex items-center justify-center rounded-lg ${active === t.id ? 'bg-yellow-500/20 text-yellow-300' : 'text-gray-400 hover:bg-white/10 hover:text-white'}`}
        >
          <Icon name={t.icon} className="w-4 h-4" />
        </button>
      ))}
    </div>
  );
}
