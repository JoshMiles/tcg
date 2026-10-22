'use client';

import { useEffect, useState } from 'react';
import { measureGaps, type DesignBox } from '@/lib/overlay-layout';
import { useOverlayEditor } from './OverlayEditorContext';

type Pointer = { x: number; y: number; over?: DesignBox; sel?: DesignBox };

// The preview frame reports the pointer (design px) on every move; kept out of the editor context so a mouse move re-renders only these.
function usePreviewPointer(): Pointer | null {
  const { frameRef } = useOverlayEditor();
  const [p, setP] = useState<Pointer | null>(null);
  useEffect(() => {
    const on = (e: MessageEvent) => {
      const d = e.data;
      if (e.source !== frameRef.current?.contentWindow || d?.type !== 'pointer' || !Number.isFinite(d.x) || !Number.isFinite(d.y)) return;
      setP(d.x < 0 ? null : { x: d.x, y: d.y, over: d.over, sel: d.sel });
    };
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
  }, [frameRef]);
  return p;
}

/** The status bar readout: pointer X / Y in design px. */
export function PointerReadout() {
  const p = usePreviewPointer();
  return <span title="The pointer, in design pixels (hold Alt over a part to measure from the selection)" className="tabular-nums">{p ? `X ${Math.round(p.x)}  Y ${Math.round(p.y)}` : 'X -  Y -'}</span>;
}

/** Alt over an unselected part: red gap lines and px numbers between it and the selection (editor only, never saved). Not in pack scope. */
export function MeasureOverlay() {
  const { fit, isPack } = useOverlayEditor();
  const p = usePreviewPointer();
  if (isPack || !p?.over || !p.sel) return null;
  return (
    <div aria-hidden className="absolute inset-0 z-20 pointer-events-none">
      {[p.sel, p.over].map((b, i) => (
        <div key={i} className="absolute border border-red-500/70" style={{ left: b.x * fit, top: b.y * fit, width: b.w * fit, height: b.h * fit }} />
      ))}
      {measureGaps(p.sel, p.over).map((g, i) => (
        <div key={i}>
          <div className="absolute bg-red-500" style={{ left: g.x1 * fit, top: g.y1 * fit, width: Math.max(1, (g.x2 - g.x1) * fit), height: Math.max(1, (g.y2 - g.y1) * fit) }} />
          <span className="absolute -translate-x-1/2 -translate-y-1/2 rounded bg-red-500 px-1 text-[10px] font-bold text-white" style={{ left: ((g.x1 + g.x2) / 2) * fit, top: ((g.y1 + g.y2) / 2) * fit }}>{g.px}</span>
        </div>
      ))}
    </div>
  );
}
