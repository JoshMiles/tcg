'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_LAYOUT, DEFAULT_PLACEMENT, LAYOUT_PRESETS, sanitizeLayout,
  type LayoutMode, type OverlayLayout, type Placement,
} from '@/lib/overlay-layout';

// Live editor for where the overlay sits on the OBS browser source. The preview is the real overlay page
// (/overlay.html?preview) in an iframe sized to the design stage and shrunk to fit this panel, so what you see —
// including anything that would be cut off — is what OBS shows. It shows a still of the pack opening or of the
// collection view (whichever you're editing) so it can be sized and moved; "Play" runs the real animation and the
// still comes back afterwards. The two views are placed independently; the browser source size is shared.
// Changes are sent to the preview by postMessage, and "preview" mode never touches the real queue or collections.

const MODES: { id: LayoutMode; label: string; icon: string; hint: string }[] = [
  { id: 'pack', label: 'Pack opening', icon: '🎴', hint: 'The pack tearing open and the revealed card.' },
  { id: 'collection', label: 'Collection', icon: '📋', hint: 'The "show collection" view: a viewer\'s card grid.' },
];

export function OverlayLayoutEditor({
  initial,
  action,
}: {
  initial: OverlayLayout;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [layout, setLayout] = useState<OverlayLayout>(initial);
  const [mode, setMode] = useState<LayoutMode>('pack');
  const [ready, setReady] = useState(false);
  // Bumped every time the preview document finishes loading, so the layout is re-sent to the *real* page (an iframe starts
  // as a blank page that already reads as "complete", so a one-off "ready" flag can fire before the overlay exists).
  const [loadedCount, setLoadedCount] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [boxWidth, setBoxWidth] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const shown = sanitizeLayout(layout);
  const dirty = JSON.stringify(shown) !== JSON.stringify(initial);
  const placement = layout[mode];
  const setSize = (patch: Partial<Pick<OverlayLayout, 'width' | 'height'>>) => setLayout(l => ({ ...l, ...patch }));
  // `patch` may be a function of the latest placement, so rapid key presses never work from stale state.
  const setPlacement = (patch: Partial<Placement> | ((p: Placement) => Partial<Placement>), which: LayoutMode = mode) =>
    setLayout(l => ({ ...l, [which]: { ...l[which], ...(typeof patch === 'function' ? patch(l[which]) : patch) } }));

  // Fit the (large) design stage into the panel.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxWidth(el.clientWidth));
    ro.observe(el);
    setBoxWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // The iframe can finish loading before React hydrates (so its onLoad never reaches us): check on mount too,
  // but only count it if it is the overlay and not the initial blank page.
  useEffect(() => {
    const d = frameRef.current?.contentDocument;
    if (d && d.readyState === 'complete' && d.location.href !== 'about:blank') { setReady(true); setLoadedCount(c => c + 1); }
  }, []);

  const post = useCallback((message: object) => {
    frameRef.current?.contentWindow?.postMessage(message, window.location.origin);
  }, []);

  // Push every change into the preview. The sanitized copy is what would actually be saved.
  useEffect(() => {
    if (ready) post({ type: 'layout', layout: sanitizeLayout(layout) });
  }, [layout, ready, loadedCount, post]);

  // Show the still for whichever view is being edited.
  useEffect(() => {
    if (ready) post({ type: 'static', mode });
  }, [mode, ready, loadedCount, post]);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const previewScale = boxWidth > 0 ? boxWidth / shown.width : 0.3;

  const play = () => {
    if (!ready || playing) return;
    setPlaying(true);
    post({ type: mode }); // 'pack' | 'collection': plays the real animation, the still returns afterwards
    // A pack opening takes ~11s end to end, a collection ~5s; re-enable the button when it's surely done.
    setTimeout(() => setPlaying(false), mode === 'pack' ? 12500 : 6500);
  };

  // ── Dragging and keyboard nudging move the view being edited ──
  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: placement.offsetX, oy: placement.offsetY };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    setPlacement({
      offsetX: Math.round(d.ox + (e.clientX - d.x) / previewScale),
      offsetY: Math.round(d.oy + (e.clientY - d.y) / previewScale),
    });
  };
  const onPointerUp = () => { drag.current = null; };
  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 1;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const m = moves[e.key];
    if (!m) return;
    e.preventDefault();
    setPlacement(p => ({ offsetX: p.offsetX + m[0], offsetY: p.offsetY + m[1] }));
  };

  const field = 'block w-24 rounded-md bg-gray-950 border border-gray-700 px-2 py-1 text-sm text-white focus:border-yellow-500 focus:outline-none';
  const btn = 'px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors';
  const current = MODES.find(m => m.id === mode)!;
  const moved = (p: Placement) => p.scale !== 1 || p.offsetX !== 0 || p.offsetY !== 0;

  return (
    <form action={action} className="space-y-5">
      {/* Every value is posted, whichever view is being edited. */}
      <input type="hidden" name="width" value={layout.width} />
      <input type="hidden" name="height" value={layout.height} />
      {MODES.map(m => (
        <span key={m.id}>
          <input type="hidden" name={`${m.id}_scale`} value={layout[m.id].scale} />
          <input type="hidden" name={`${m.id}_offsetX`} value={layout[m.id].offsetX} />
          <input type="hidden" name={`${m.id}_offsetY`} value={layout[m.id].offsetY} />
        </span>
      ))}

      {/* Browser source size (shared) */}
      <div className="rounded-lg bg-gray-950/60 border border-gray-800 p-3 space-y-3">
        <div className="space-y-1">
          <p className="text-sm text-gray-300 font-semibold">Browser source size <span className="text-gray-600 font-normal">· shared by both views</span></p>
          <p className="text-sm text-gray-400">
            Set the OBS browser source to <code className="text-yellow-400">{shown.width}</code> × <code className="text-yellow-400">{shown.height}</code>.
            The overlay is drawn at this size and scaled to fit if your source differs, so nothing gets cut off.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {LAYOUT_PRESETS.map(p => (
            <button
              key={p.label}
              type="button"
              onClick={() => setSize({ width: p.width, height: p.height })}
              className={`${btn} border ${shown.width === p.width && shown.height === p.height ? 'border-yellow-500 text-yellow-400' : 'border-gray-700 text-gray-300 hover:border-gray-500'}`}
            >
              {p.label}
            </button>
          ))}
          <label className="space-y-1 text-xs text-gray-500 ml-2">Width
            <input type="number" min={320} max={3840} value={layout.width} onChange={e => setSize({ width: Number(e.target.value) })} className={field} />
          </label>
          <label className="space-y-1 text-xs text-gray-500">Height
            <input type="number" min={240} max={2160} value={layout.height} onChange={e => setSize({ height: Number(e.target.value) })} className={field} />
          </label>
        </div>
      </div>

      {/* Which view are we placing? */}
      <div className="space-y-3">
        <div role="tablist" aria-label="View to position" className="flex flex-wrap gap-2">
          {MODES.map(m => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={mode === m.id}
              onClick={() => setMode(m.id)}
              className={`${btn} border flex items-center gap-2 ${mode === m.id ? 'border-yellow-500 bg-yellow-500/10 text-yellow-300' : 'border-gray-700 text-gray-300 hover:border-gray-500'}`}
            >
              <span aria-hidden>{m.icon}</span> {m.label}
              {moved(layout[m.id]) && <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" title="Adjusted from the default" />}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500">
          Editing <strong className="text-gray-300">{current.label}</strong> — {current.hint} Its size and position are independent of the other view.
        </p>

        <div className="flex flex-wrap items-end gap-4 text-sm">
          <label className="space-y-1 text-gray-400 flex-1 min-w-[14rem]">
            Size — <span className="text-white">{Math.round(placement.scale * 100)}%</span>
            <input
              type="range"
              min={0.3}
              max={1.5}
              step={0.01}
              value={placement.scale}
              onChange={e => setPlacement({ scale: Number(e.target.value) })}
              className="block w-full accent-yellow-500"
            />
          </label>
          <label className="space-y-1 text-gray-400">Offset X
            <input type="number" value={placement.offsetX} onChange={e => setPlacement({ offsetX: Number(e.target.value) })} className={field} />
          </label>
          <label className="space-y-1 text-gray-400">Offset Y
            <input type="number" value={placement.offsetY} onChange={e => setPlacement({ offsetY: Number(e.target.value) })} className={field} />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setPlacement({ offsetX: 0, offsetY: 0 })} className={`${btn} border border-gray-700 text-gray-200 hover:border-gray-500`}>Center</button>
          <button type="button" onClick={() => setPlacement({ ...DEFAULT_PLACEMENT })} className={`${btn} text-gray-400 hover:text-white`}>Reset {current.label.toLowerCase()}</button>
          <button
            type="button"
            onClick={play}
            disabled={!ready || playing}
            className={`${btn} ml-auto bg-yellow-500 text-gray-950 hover:bg-yellow-400 disabled:opacity-40`}
          >
            {playing ? '… playing' : mode === 'pack' ? '▶ Play pack opening' : '▶ Play collection'}
          </button>
        </div>
      </div>

      {/* Preview: checkerboard = transparent, as in OBS. Drag (or use the arrow keys) to move the view being edited. */}
      <div
        ref={boxRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="relative w-full overflow-hidden rounded-lg border border-gray-700 touch-none select-none outline-none focus-visible:border-yellow-500"
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
          onLoad={() => { setReady(true); setLoadedCount(c => c + 1); }}
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
        {/* Centre guides: where the middle of the browser source is */}
        <div className="absolute inset-y-0 left-1/2 w-px bg-yellow-400/25 pointer-events-none" />
        <div className="absolute inset-x-0 top-1/2 h-px bg-yellow-400/25 pointer-events-none" />
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="absolute inset-0 cursor-move"
          aria-label={`Drag to move the ${current.label.toLowerCase()}`}
        />
        {!ready && <p className="absolute inset-0 flex items-center justify-center text-sm text-gray-500">Loading preview…</p>}
      </div>
      <p className="text-xs text-gray-500">
        The frame is your browser source and the faint cross is its centre; anything outside the frame is cut off on stream. Drag the preview to reposition,
        or click it and use the arrow keys (hold Shift for bigger steps).
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={!dirty} className={`${btn} bg-yellow-500 text-gray-950 hover:bg-yellow-400 disabled:opacity-40`}>Save layout</button>
        <button type="button" disabled={!dirty} onClick={() => setLayout(initial)} className={`${btn} text-gray-400 hover:text-white disabled:opacity-40`}>Revert changes</button>
        <button type="button" onClick={() => setLayout(DEFAULT_LAYOUT)} className={`${btn} text-gray-500 hover:text-red-300`}>Reset everything</button>
        {dirty && <span className="text-xs text-yellow-500">Unsaved changes</span>}
      </div>
    </form>
  );
}
