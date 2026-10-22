'use client';
import { COLUMN_DEFAULT, COLUMN_MAX, COLUMN_MIN, COLUMN_STEP } from './workspace-math';

/** The drag handle on a right column's left edge (xl and up). Pointer drag, arrow keys (Shift = 4x), Home / End, double-click resets. `width` is in rem. */
export function ColumnResizer({ width, onChange }: { width: number; onChange: (rem: number) => void }) {
  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget, x0 = e.clientX, w0 = width, px = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    el.setPointerCapture(e.pointerId);
    const move = (m: PointerEvent) => onChange(w0 + (x0 - m.clientX) / px);
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  };
  const key = (e: React.KeyboardEvent) => {
    const d = (e.shiftKey ? 4 : 1) * COLUMN_STEP;
    const to = e.key === 'ArrowLeft' ? width + d : e.key === 'ArrowRight' ? width - d : e.key === 'Home' ? COLUMN_MIN : e.key === 'End' ? COLUMN_MAX : null;
    if (to === null) return;
    e.preventDefault();
    onChange(to);
  };
  return (
    <div role="separator" aria-orientation="vertical" aria-label="Resize the side panels" aria-valuenow={Math.round(width)} aria-valuemin={COLUMN_MIN} aria-valuemax={COLUMN_MAX}
      tabIndex={0} onPointerDown={down} onKeyDown={key} onDoubleClick={() => onChange(COLUMN_DEFAULT)} title="Drag to resize, double-click to reset"
      className="hidden xl:block absolute -left-2 top-0 bottom-0 w-2 cursor-col-resize z-10 hover:bg-yellow-500/30 focus-visible:bg-yellow-500/40 outline-none" style={{ touchAction: 'none' }} />
  );
}
