'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { PendingButton } from '@/app/components/PendingButton';

/** The browser's own "Leave site?" question while `dirty` (a reload, a closed tab, a typed address). */
export function useLeaveWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
}

/** "Unsaved changes", announced when it appears. The live region is always in the page, so a screen reader hears the text arrive. */
export function UnsavedMarker({ dirty }: { dirty: boolean }) {
  return (
    <span role="status" className="mr-auto min-h-5">
      {dirty && <span className="rounded-full border border-amber-500/40 bg-amber-950/40 px-2.5 py-0.5 text-xs font-semibold text-amber-200">Unsaved changes</span>}
    </span>
  );
}

/** The foot of a card: the marker, Discard (when something changed) and the card's Save. `onDiscard` is for a card that keeps its own state. */
export function CardFoot({ dirty, onDiscard, save }: { dirty: boolean; onDiscard: () => void; save: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-3 border-t border-gray-800 pt-4">
      <UnsavedMarker dirty={dirty} />
      <button type="button" onClick={onDiscard} disabled={!dirty} className="btn btn-sm btn-outline">Discard</button>
      {save}
    </div>
  );
}

/**
 * A What viewers get card's form (ROADMAP 63.3): one Save for the card, an "Unsaved changes" marker once any field changes, Discard to put the saved values
 * back, and the browser's warning when leaving with changes. Discard remounts the fields so their saved values (and any state that follows them) come back.
 * Test and Delete buttons inside the card submit the same form; the page that comes back shows the saved state.
 */
export function CardForm({ action, saveLabel = 'Save', children }: { action: (formData: FormData) => void | Promise<void>; saveLabel?: string; children: ReactNode }) {
  const [dirty, setDirty] = useState(false);
  const [round, setRound] = useState(0);
  useLeaveWarning(dirty);
  return (
    <form action={action} onInput={() => setDirty(true)} onChange={() => setDirty(true)} onSubmit={() => setDirty(false)} className="space-y-5">
      <div key={round} className="space-y-5">{children}</div>
      <CardFoot dirty={dirty} onDiscard={() => { setRound(n => n + 1); setDirty(false); }} save={<PendingButton type="submit" className="btn btn-primary btn-sm">{saveLabel}</PendingButton>} />
    </form>
  );
}

/** The "How?" toggle: a button with `aria-expanded` that shows the long explanation under the card's one-line hint. */
export function HowToggle({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-controls="card-how" className="link text-sm font-semibold">How?</button>
      {open && <div id="card-how" className="mt-2 basis-full rounded-xl border border-gray-800 bg-gray-950/50 p-4 text-xs text-gray-400 leading-relaxed space-y-2">{children}</div>}
    </>
  );
}
