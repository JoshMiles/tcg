'use client';
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from 'react';
import { Icon } from '@/app/components/Icon';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';
const CLOSE_DISTANCE = 80; // px dragged down
const CLOSE_SPEED = 0.6; // px per ms, a quick flick

/**
 * The grab handle: drag it down to close. It must be a direct child of the panel it moves (the panel is its parent element).
 * Dialogs that become sheets on phones add `sheet-mobile` to their panel and put this first inside it with `sticky top-0 z-20 md:hidden`.
 */
export function SheetHandle({ onClose, className = 'shrink-0' }: { onClose: () => void; className?: string }) {
  const drag = useRef<{ y: number; t: number; dy: number } | null>(null);
  const panel = (e: { currentTarget: HTMLElement }) => e.currentTarget.parentElement as HTMLElement;
  const move = (el: HTMLElement, dy: number) => { el.style.transform = dy > 0 ? `translateY(${dy}px)` : ''; };
  return (
    <div
      className={`flex justify-center py-3 touch-none cursor-grab ${className}`}
      onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { y: e.clientY, t: e.timeStamp, dy: 0 }; panel(e).style.transition = 'none'; }}
      onPointerMove={e => { const d = drag.current; if (!d) return; d.dy = e.clientY - d.y; move(panel(e), d.dy); }}
      onPointerUp={e => {
        const d = drag.current; drag.current = null;
        const el = panel(e);
        el.style.transition = '';
        if (d && (d.dy > CLOSE_DISTANCE || (d.dy > 20 && d.dy / (e.timeStamp - d.t) > CLOSE_SPEED))) onClose(); else move(el, 0);
      }}
      onPointerCancel={e => { drag.current = null; move(panel(e), 0); }}
    >
      <span className="h-1.5 w-10 rounded-full bg-gray-600" aria-hidden />
    </div>
  );
}

const PHONE = '(max-width: 767px)';
/** True below the `md` breakpoint. False on the server and first paint, so it never causes a hydration mismatch. */
export function useIsPhone() {
  return useSyncExternalStore(
    cb => { const m = window.matchMedia(PHONE); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); },
    () => window.matchMedia(PHONE).matches,
    () => false,
  );
}

/** Wraps an inline filter / sort block: unchanged from `md` up; on phones it sits behind a "Filters" button and opens in a sheet. */
export function FilterSheet({ active = false, children }: { active?: boolean; children: ReactNode }) {
  const phone = useIsPhone();
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  if (!phone) return <>{children}</>;
  return (
    <>
      <button ref={btn} type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className="inline-flex items-center gap-1.5 rounded-xl border border-gray-700 px-3 py-1.5 text-sm font-semibold text-gray-200 hover:text-white">
        <Icon name="filter" />Filters{active && <span className="h-2 w-2 rounded-full bg-yellow-400" role="img" aria-label="active" />}
      </button>
      <BottomSheet open={open} onClose={() => setOpen(false)} label="Filters" returnFocusRef={btn}>
        <div className="flex flex-col items-stretch gap-3 pb-2">
          {children}
          <button type="button" onClick={() => setOpen(false)} className="btn btn-primary rounded-xl">Done</button>
        </div>
      </BottomSheet>
    </>
  );
}

/**
 * A modal sheet that slides up from the bottom (phones). Esc, a tap on the backdrop or a swipe down on the handle closes it;
 * focus moves in, stays inside while open and returns to `returnFocusRef` on close. Render it only below the breakpoint you need.
 */
export function BottomSheet({ open, onClose, label, returnFocusRef, children }: { open: boolean; onClose: () => void; label: string; returnFocusRef?: RefObject<HTMLElement | null>; children: ReactNode }) {
  const panelRef = useRef<HTMLDivElement>(null);
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
        <SheetHandle onClose={onClose} />
        <div className="overflow-y-auto overscroll-contain pb-[calc(1rem+env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]">{children}</div>
      </div>
    </div>
  );
}
