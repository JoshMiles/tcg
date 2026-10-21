'use client';

// Document tabs above a canvas (one per thing being edited); knows nothing about what they are.
// The first tab is never closable. `add` is a native select of the tabs that are not open yet (keyboard reachable).

export interface DocTab { id: string; label: string; dirty?: boolean; closable?: boolean }

export function DocTabs({ tabs, active, onSelect, onClose, add }: { tabs: DocTab[]; active: string; onSelect: (id: string) => void; onClose: (id: string) => void; add?: { label: string; options: { id: string; label: string }[]; onAdd: (id: string) => void } }) {
  return (
    <div role="tablist" aria-label="Editing" className="flex flex-wrap items-end gap-1">
      {tabs.map(t => (
        <div key={t.id} className={`flex items-center rounded-t-lg border border-b-0 text-sm ${active === t.id ? 'border-yellow-500/60 bg-gray-900 text-yellow-300' : 'border-gray-800 bg-gray-950/60 text-gray-400 hover:text-gray-200'}`}>
          <button type="button" role="tab" aria-selected={active === t.id} onClick={() => onSelect(t.id)} className={`px-3 py-1 font-semibold max-w-48 truncate ${t.closable ? 'pr-1' : ''}`}>
            {t.label}
            {t.dirty && <span role="img" aria-label="unsaved changes" className="ml-1.5 text-yellow-400">●</span>}
          </button>
          {t.closable && (
            <button type="button" onClick={() => onClose(t.id)} aria-label={`Close ${t.label}`} className="pr-2 pl-1 text-gray-500 hover:text-white">×</button>
          )}
        </div>
      ))}
      {add && add.options.length > 0 && (
        <select
          value=""
          aria-label={add.label}
          onChange={e => e.target.value && add.onAdd(e.target.value)}
          className="select select-xs w-16 mb-1"
        >
          <option value="">+</option>
          {add.options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      )}
    </div>
  );
}
