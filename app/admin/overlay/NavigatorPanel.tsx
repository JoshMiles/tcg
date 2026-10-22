'use client';
import { useEffect, useState } from 'react';
import { useOverlayEditor } from './OverlayEditorContext';

// Mini-map of the canvas scroll area while zoomed past fit: the box is the visible part, drag it to pan, the slider zooms.
export function NavigatorPanel() {
  const { boxRef, zoom, zoomTo, fitBase } = useOverlayEditor();
  const [v, setV] = useState({ sw: 1, sh: 1, cw: 1, ch: 1, l: 0, t: 0 });
  useEffect(() => {
    const b = boxRef.current;
    if (!b) return;
    const read = () => setV({ sw: b.scrollWidth, sh: b.scrollHeight, cw: b.clientWidth, ch: b.clientHeight, l: b.scrollLeft, t: b.scrollTop });
    read();
    b.addEventListener('scroll', read);
    const ro = new ResizeObserver(read);
    ro.observe(b);
    return () => { b.removeEventListener('scroll', read); ro.disconnect(); };
  }, [boxRef, zoom]);
  const pan = (e: React.PointerEvent<HTMLDivElement>) => {
    const b = boxRef.current;
    if (!b || !(e.buttons & 1)) return;
    const r = e.currentTarget.getBoundingClientRect();
    b.scrollLeft = ((e.clientX - r.left) / r.width) * v.sw - v.cw / 2;
    b.scrollTop = ((e.clientY - r.top) / r.height) * v.sh - v.ch / 2;
  };
  const max = Math.log(Math.max(8 / (fitBase || 1), 1.01));
  return (
    <div className="p-2 space-y-2">
      <div
        className="relative w-full overflow-hidden rounded border border-gray-700 bg-gray-800 cursor-pointer touch-none"
        style={{ aspectRatio: `${v.sw} / ${v.sh}` }}
        onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); pan(e); }}
        onPointerMove={pan}
      >
        <div
          className="absolute border-2 border-yellow-400 bg-yellow-400/10 pointer-events-none"
          style={{ left: `${(v.l / v.sw) * 100}%`, top: `${(v.t / v.sh) * 100}%`, width: `${(v.cw / v.sw) * 100}%`, height: `${(v.ch / v.sh) * 100}%` }}
        />
      </div>
      <input
        type="range"
        aria-label="Zoom"
        className="w-full"
        min={0}
        max={max}
        step="any"
        value={Math.min(Math.log(zoom), max)}
        onChange={e => zoomTo(Math.exp(Number(e.target.value)))}
      />
    </div>
  );
}
