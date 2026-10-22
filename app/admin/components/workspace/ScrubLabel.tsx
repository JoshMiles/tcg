'use client';
import type { ReactNode } from 'react';
import { scrubValue } from './workspace-math';

/** A number field's label you can drag sideways to change the value (Shift = x10), as in Photoshop. A click without a drag does nothing. */
export function ScrubLabel({ value, onChange, step = 1, min, max, children }: { value: number; onChange: (n: number) => void; step?: number; min?: number; max?: number; children: ReactNode }) {
  const down = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (e.button !== 0) return;
    const el = e.currentTarget, x0 = e.clientX, v0 = value;
    let moved = false;
    el.setPointerCapture(e.pointerId);
    const move = (m: PointerEvent) => {
      if (!moved && Math.abs(m.clientX - x0) < 3) return;
      moved = true;
      onChange(scrubValue(v0, m.clientX - x0, step, m.shiftKey, min, max));
    };
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  };
  return <span onPointerDown={down} title="Drag sideways to change (Shift = x10)" className="cursor-ew-resize select-none" style={{ touchAction: 'none' }}>{children}</span>;
}
