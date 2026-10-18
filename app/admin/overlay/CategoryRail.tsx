'use client';
import { Icon } from '@/app/components/Icon';
import type { RailItem } from './editor-types';

// The property panel's category rail. `countOf` is the badge number, `activeId` the highlighted category (or null while searching).
export function CategoryRail({ rail, countOf, activeId, onSelect }: { rail: RailItem[]; countOf: (id: string) => number; activeId: string | null; onSelect: (id: string) => void }) {
  return (
    <nav aria-label="Property categories" className="w-[4.5rem] shrink-0 border-r border-gray-800 bg-gray-950/50 flex flex-col py-2 gap-1">
      {rail.map(g => {
        const n = countOf(g.id);
        const active = activeId === g.id;
        return (
          <button
            key={g.id}
            type="button"
            onClick={() => onSelect(g.id)}
            aria-current={active ? 'page' : undefined}
            title={g.description}
            className={`relative mx-1.5 rounded-lg py-2 flex flex-col items-center gap-0.5 text-[11px] font-semibold transition-colors ${active ? 'bg-yellow-500/15 text-yellow-300' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}
          >
            <Icon name={g.icon} className="w-[1.15rem] h-[1.15rem]" />
            {g.label}
            {n > 0 && <span className="absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full bg-yellow-500 text-gray-950 text-[10px] font-bold leading-4 text-center">{n}</span>}
          </button>
        );
      })}
    </nav>
  );
}
