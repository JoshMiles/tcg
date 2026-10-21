'use client';
import { useEffect, useRef } from 'react';
import { useOverlayEditor } from './OverlayEditorContext';

// The undo stack, oldest first. Click a step to jump there; steps after the current one (the redo side) are greyed.
export function HistoryPanel() {
  const { historyLabels, historyIndex, jumpTo } = useOverlayEditor();
  const end = useRef<HTMLLIElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [historyLabels]);
  return (
    <ol className="p-1 text-xs">
      {historyLabels.map((label, i) => (
        <li key={i} ref={i === historyLabels.length - 1 ? end : undefined}>
          <button
            type="button"
            onClick={() => jumpTo(i)}
            aria-current={i === historyIndex ? 'step' : undefined}
            className={`w-full text-left px-2 py-1 rounded truncate ${i === historyIndex ? 'bg-yellow-400/15 text-yellow-200 font-semibold' : i > historyIndex ? 'text-gray-600 hover:bg-white/5' : 'text-gray-300 hover:bg-white/5'}`}
          >
            {label}
          </button>
        </li>
      ))}
    </ol>
  );
}
