'use client';
import { useEffect, useRef, useState } from 'react';
import { saveDashboardNotesAction } from './actions';

/** A scratchpad that saves itself shortly after you stop typing. */
export function NotesWidget({ initial }: { initial: string }) {
  const [text, setText] = useState(initial);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const first = useRef(true);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setState('saving');
    const t = setTimeout(() => {
      saveDashboardNotesAction(text).then(() => setState('saved')).catch(() => setState('error'));
    }, 900);
    return () => clearTimeout(t);
  }, [text]);

  return (
    <div className="space-y-1.5 h-full flex flex-col">
      <textarea
        value={text}
        onChange={e => setText(e.target.value.slice(0, 4000))}
        placeholder="Reminders, ideas, things to announce…"
        aria-label="Notes"
        className="textarea w-full flex-1 min-h-32 resize-y"
      />
      <p className="text-[11px] text-gray-600 h-3">Shared with all staff{state === 'saving' ? '. Saving…' : state === 'saved' ? '. Saved' : state === 'error' ? '. Could not save' : ''}</p>
    </div>
  );
}
