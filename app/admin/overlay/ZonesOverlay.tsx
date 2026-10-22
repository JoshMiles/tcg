'use client';

import { useRef } from 'react';
import { Icon } from '@/app/components/Icon';
import { useOverlayEditor } from './OverlayEditorContext';

/** Twitch UI zones (webcam, chat, alerts): hatched editor-only boxes over the preview. The name bar drags a zone, the corner resizes it. */
export function ZonesOverlay() {
  const { zones, setZones, fit, layout } = useOverlayEditor();
  const drag = useRef<{ id: string; resize: boolean; x: number; y: number; z: { x: number; y: number; w: number; h: number } } | null>(null);
  const begin = (id: string, resize: boolean) => (e: React.PointerEvent) => {
    const z = zones.find(q => q.id === id);
    if (!z) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id, resize, x: e.clientX, y: e.clientY, z };
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !fit) return;
    const dx = Math.round((e.clientX - d.x) / fit), dy = Math.round((e.clientY - d.y) / fit);
    const { z } = d;
    setZones(all => all.map(q => q.id !== d.id ? q : d.resize
      ? { ...q, w: Math.max(20, Math.min(layout.width - z.x, z.w + dx)), h: Math.max(20, Math.min(layout.height - z.y, z.h + dy)) }
      : { ...q, x: Math.max(0, Math.min(layout.width - z.w, z.x + dx)), y: Math.max(0, Math.min(layout.height - z.h, z.y + dy)) }));
  };
  const end = () => { drag.current = null; };
  return (
    <div aria-hidden={false} className="absolute inset-0 z-10 pointer-events-none">
      {zones.map(z => (
        <div
          key={z.id}
          className="absolute border border-dashed border-fuchsia-400/80"
          style={{ left: z.x * fit, top: z.y * fit, width: z.w * fit, height: z.h * fit, backgroundImage: 'repeating-linear-gradient(45deg, rgba(232,121,249,.22) 0 6px, transparent 6px 12px)' }}
        >
          <div className="flex items-center gap-1 bg-fuchsia-950/80 text-fuchsia-100 text-[10px] pointer-events-auto">
            <span onPointerDown={begin(z.id, false)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} title="Drag to move" className="cursor-move px-1 touch-none"><Icon name="move" /></span>
            <input
              value={z.name}
              maxLength={40}
              aria-label="Zone name"
              onChange={e => setZones(all => all.map(q => (q.id === z.id ? { ...q, name: e.target.value } : q)))}
              onKeyDown={e => e.stopPropagation()}
              className="min-w-0 flex-1 bg-transparent outline-none"
            />
            <button type="button" aria-label={`Delete ${z.name}`} title="Delete zone" onClick={() => setZones(all => all.filter(q => q.id !== z.id))} className="px-1 hover:text-white"><Icon name="x" /></button>
          </div>
          <span onPointerDown={begin(z.id, true)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} title="Drag to resize" className="absolute bottom-0 right-0 w-3 h-3 cursor-nwse-resize bg-fuchsia-400 pointer-events-auto touch-none" />
        </div>
      ))}
    </div>
  );
}
