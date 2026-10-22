'use client';
import { useEffect, useRef, type ReactNode, type RefObject } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';
const CLOSE_DISTANCE = 80; // px dragged down
const CLOSE_SPEED = 0.6; // px per ms, a quick flick

/**
 * A modal sheet that slides up from the bottom (phones). Esc, a tap on the backdrop or a swipe down on the handle closes it;
 * focus moves in, stays inside while open and returns to `returnFocusRef` on close. Render it only below the breakpoint you need.
 */
export function BottomSheet({ open, onClose, label, returnFocusRef, children }: { open: boolean; onClose: () => void; label: string; returnFocusRef?: RefObject<HTMLElement | null>; children: ReactNode }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; t: number; dy: number } | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    panel?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); closeRef.current(); return; }
      if (e.key !== 'Tab' || !panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const first = items[0], last = items[items.length - 1];
      const at = document.activeElement;
      if (!first || !last) { e.preventDefault(); return; }
      if (e.shiftKey && (at === first || at === panel)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus(); }
      else if (!panel.contains(at)) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    const back = returnFocusRef?.current;
    return () => { document.removeEventListener('keydown', onKey); back?.focus(); };
  }, [open, returnFocusRef]);

  if (!open) return null;

  const move = (dy: number) => { if (panelRef.current) panelRef.current.style.transform = dy > 0 ? `translateY(${dy}px)` : ''; };
  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="sheet-backdrop absolute inset-0 bg-gray-950/60" onClick={() => onClose()} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className="sheet-panel relative w-full max-h-[85dvh] flex flex-col overflow-hidden rounded-t-2xl border-t border-yellow-500/20 bg-gray-950 shadow-card outline-none"
      >
        <div
          className="shrink-0 flex justify-center py-3 touch-none cursor-grab"
          onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { y: e.clientY, t: e.timeStamp, dy: 0 }; if (panelRef.current) panelRef.current.style.transition = 'none'; }}
          onPointerMove={e => { const d = drag.current; if (!d) return; d.dy = e.clientY - d.y; move(d.dy); }}
          onPointerUp={e => {
            const d = drag.current; drag.current = null;
            if (panelRef.current) panelRef.current.style.transition = '';
            if (d && (d.dy > CLOSE_DISTANCE || (d.dy > 20 && d.dy / (e.timeStamp - d.t) > CLOSE_SPEED))) onClose(); else move(0);
          }}
          onPointerCancel={() => { drag.current = null; move(0); }}
        >
          <span className="h-1.5 w-10 rounded-full bg-gray-600" aria-hidden />
        </div>
        <div className="overflow-y-auto overscroll-contain pb-[calc(1rem+env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]">{children}</div>
      </div>
    </div>
  );
}
