'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_LAYOUT, LAYOUT_PRESETS, sanitizeLayout, type OverlayLayout } from '@/lib/overlay-layout';

// Live editor for the overlay's stage size, scale and position. The preview is the real overlay page
// (/overlay.html?preview) in an iframe sized to the design stage and shrunk to fit this panel, so what you
// see — including anything that would be cut off — is what OBS shows. Layout changes are sent to it by
// postMessage; "preview" mode never touches the real queue or collections.

export function OverlayLayoutEditor({
  initial,
  action,
}: {
  initial: OverlayLayout;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [layout, setLayout] = useState<OverlayLayout>(initial);
  const [ready, setReady] = useState(false);
  const [boxWidth, setBoxWidth] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const dirty = JSON.stringify(sanitizeLayout(layout)) !== JSON.stringify(initial);
  const set = (patch: Partial<OverlayLayout>) => setLayout(l => ({ ...l, ...patch }));

  // Fit the (large) design stage into the panel.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxWidth(el.clientWidth));
    ro.observe(el);
    setBoxWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // The iframe can finish loading before React hydrates (so its onLoad never reaches us): check on mount too.
  useEffect(() => {
    if (frameRef.current?.contentDocument?.readyState === 'complete') setReady(true);
  }, []);

  const post = useCallback((message: object) => {
    frameRef.current?.contentWindow?.postMessage(message, window.location.origin);
  }, []);

  // Push every change into the preview. The sanitized copy is what would actually be saved.
  useEffect(() => {
    if (ready) post({ type: 'layout', layout: sanitizeLayout(layout) });
  }, [layout, ready, post]);

  const shown = sanitizeLayout(layout);
  const previewScale = boxWidth > 0 ? boxWidth / shown.width : 0.3;

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: layout.offsetX, oy: layout.offsetY };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    set({
      offsetX: Math.round(d.ox + (e.clientX - d.x) / previewScale),
      offsetY: Math.round(d.oy + (e.clientY - d.y) / previewScale),
    });
  };
  const onPointerUp = () => { drag.current = null; };

  const field = 'block w-24 rounded-md bg-gray-950 border border-gray-700 px-2 py-1 text-sm text-white focus:border-yellow-500 focus:outline-none';
  const btn = 'px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors';

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1">
        <p className="text-sm text-gray-300 font-semibold">Browser source size</p>
        <p className="text-sm text-gray-400">
          Set the OBS browser source to{' '}
          <code className="text-yellow-400">{shown.width}</code> × <code className="text-yellow-400">{shown.height}</code>.
          The overlay is drawn at this size and scaled to fit if your source differs, so nothing gets cut off.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {LAYOUT_PRESETS.map(p => (
          <button
            key={p.label}
            type="button"
            onClick={() => set({ width: p.width, height: p.height })}
            className={`${btn} border ${shown.width === p.width && shown.height === p.height ? 'border-yellow-500 text-yellow-400' : 'border-gray-700 text-gray-300 hover:border-gray-500'}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <label className="space-y-1 text-gray-400">Width
          <input name="width" type="number" min={320} max={3840} value={layout.width} onChange={e => set({ width: Number(e.target.value) })} className={field} />
        </label>
        <label className="space-y-1 text-gray-400">Height
          <input name="height" type="number" min={240} max={2160} value={layout.height} onChange={e => set({ height: Number(e.target.value) })} className={field} />
        </label>
        <label className="space-y-1 text-gray-400">Offset X
          <input name="offsetX" type="number" value={layout.offsetX} onChange={e => set({ offsetX: Number(e.target.value) })} className={field} />
        </label>
        <label className="space-y-1 text-gray-400">Offset Y
          <input name="offsetY" type="number" value={layout.offsetY} onChange={e => set({ offsetY: Number(e.target.value) })} className={field} />
        </label>
      </div>

      <label className="block text-sm text-gray-400 space-y-1">
        Size — <span className="text-white">{Math.round(layout.scale * 100)}%</span>
        <input
          name="scale"
          type="range"
          min={0.3}
          max={1.5}
          step={0.01}
          value={layout.scale}
          onChange={e => set({ scale: Number(e.target.value) })}
          className="block w-full accent-yellow-500"
        />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => post({ type: 'pack' })} disabled={!ready} className={`${btn} bg-yellow-500 text-gray-950 hover:bg-yellow-400 disabled:opacity-40`}>▶ Play pack opening</button>
        <button type="button" onClick={() => post({ type: 'collection' })} disabled={!ready} className={`${btn} border border-gray-700 text-gray-200 hover:border-gray-500 disabled:opacity-40`}>Show collection</button>
        <button type="button" onClick={() => setLayout(DEFAULT_LAYOUT)} className={`${btn} text-gray-400 hover:text-white`}>Reset</button>
      </div>

      {/* Preview: checkerboard = transparent, as in OBS. Drag to move the overlay. */}
      <div
        ref={boxRef}
        className="relative w-full overflow-hidden rounded-lg border border-gray-700 touch-none select-none"
        style={{
          height: shown.height * previewScale,
          backgroundColor: '#1a1d23',
          backgroundImage: 'conic-gradient(#262a32 25%, transparent 0 50%, #262a32 0 75%, transparent 0)',
          backgroundSize: '24px 24px',
        }}
      >
        <iframe
          ref={frameRef}
          src="/overlay.html?preview"
          title="Overlay preview"
          onLoad={() => setReady(true)}
          style={{
            width: shown.width,
            height: shown.height,
            border: 0,
            background: 'transparent',
            colorScheme: 'light', // a dark-scheme parent makes iframes opaque white; the overlay is transparent
            transform: `scale(${previewScale})`,
            transformOrigin: 'top left',
            pointerEvents: 'none',
          }}
        />
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="absolute inset-0 cursor-move"
          aria-label="Drag to move the overlay"
        />
      </div>
      <p className="text-xs text-gray-500">The frame is your browser source. Anything outside it is cut off on stream. Drag the preview to reposition.</p>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={!dirty} className={`${btn} bg-yellow-500 text-gray-950 hover:bg-yellow-400 disabled:opacity-40`}>Save layout</button>
        {dirty && <span className="text-xs text-yellow-500">Unsaved changes</span>}
      </div>
    </form>
  );
}
