'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@/app/components/Icon';
import { toolBox } from '@/lib/overlay-custom';
import { LayerMenu } from './LayerMenu';
import { useOverlayEditor } from './OverlayEditorContext';
import { RulerBar } from './RulerBar';

export function PreviewStage() {
  const {
    boxRef,
    frameRef,
    frameW,
    frameH,
    bg,
    bgImage,
    dragging,
    onKeyDown,
    shownLayout,
    fit,
    setReady,
    setLoadedCount,
    showGrid,
    showThirds,
    showSafe,
    showSaved,
    ready,
    isPack,
    hintSignal,
    activeTool,
    zoomStep,
    showRulers,
    guides,
    setGuides,
    guidesLocked,
    addCustomAt,
  } = useOverlayEditor();

  // Rulers and the user's guides are drawn here, not in the widget: where the stage sits inside the scroll box, measured on scroll / resize / zoom.
  const stageRef = useRef<HTMLDivElement>(null);
  const [m, setM] = useState({ ox: 0, oy: 0, bw: 0, bh: 0 });
  const measure = useCallback(() => {
    const b = boxRef.current;
    const st = stageRef.current;
    if (!b || !st) return;
    const br = b.getBoundingClientRect();
    const sr = st.getBoundingClientRect();
    const q = (n: number) => Math.round(n * 10) / 10;
    const n = { ox: q(sr.left + st.clientLeft - br.left), oy: q(sr.top + st.clientTop - br.top), bw: q(br.width), bh: q(br.height) };
    setM(p => (p.ox === n.ox && p.oy === n.oy && p.bw === n.bw && p.bh === n.bh ? p : n));
  }, [boxRef]);
  useEffect(() => {
    measure();
    const b = boxRef.current;
    b?.addEventListener('scroll', measure);
    const ro = new ResizeObserver(measure);
    if (b) ro.observe(b);
    if (stageRef.current) ro.observe(stageRef.current);
    return () => { b?.removeEventListener('scroll', measure); ro.disconnect(); };
  }, [measure, boxRef, fit, frameW, frameH, showRulers]);

  // A guide drag (new from a ruler, or an existing line): axis 'x' = a vertical line at design x. Not an undo step. Letting go off the
  // stage or back on the ruler deletes it.
  const drag = useRef<{ axis: 'x' | 'y'; i: number } | null>(null);
  const posOf = (axis: 'x' | 'y', e: React.PointerEvent) => {
    const st = stageRef.current;
    if (!st) return 0;
    const r = st.getBoundingClientRect();
    return Math.round(((axis === 'x' ? e.clientX - r.left : e.clientY - r.top) - (axis === 'x' ? st.clientLeft : st.clientTop)) / fit);
  };
  const setAt = (axis: 'x' | 'y', i: number, v: number) => setGuides(g => ({ ...g, [axis]: g[axis].map((n, j) => (j === i ? v : n)) }));
  const beginGuide = (axis: 'x' | 'y', i: number, e: React.PointerEvent<HTMLElement>) => {
    drag.current = { axis, i };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* no active pointer */ }
    e.preventDefault();
  };
  const newGuide = (axis: 'x' | 'y') => (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    const v = posOf(axis, e);
    const i = guides[axis].length;
    setGuides(g => ({ ...g, [axis]: [...g[axis], v] }));
    beginGuide(axis, i, e);
  };
  const moveGuide = (e: React.PointerEvent) => {
    if (drag.current) setAt(drag.current.axis, drag.current.i, posOf(drag.current.axis, e));
  };
  const endGuide = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    const b = boxRef.current;
    if (!d || !b) return;
    const v = posOf(d.axis, e);
    const br = b.getBoundingClientRect();
    const off = v < 0 || v > (d.axis === 'x' ? shownLayout.width : shownLayout.height) || (d.axis === 'x' ? e.clientX < br.left : e.clientY < br.top);
    if (off) setGuides(g => ({ ...g, [d.axis]: g[d.axis].filter((_, j) => j !== d.i) }));
  };
  // The Text tool: a press-drag-release on the sheet draws a box (a plain click makes the default one) and adds a text layer there.
  const [rub, setRub] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const drawing = activeTool === 'text' || activeTool === 'shape';
  const rubAt = (e: React.PointerEvent, from?: { x0: number; y0: number } | null) => {
    const p = { x: posOf('x', e), y: posOf('y', e) };
    if (!from || !e.shiftKey || activeTool !== 'shape') return p;
    const dx = p.x - from.x0, dy = p.y - from.y0, s = Math.max(Math.abs(dx), Math.abs(dy)); // Shift keeps the box square
    return { x: from.x0 + (dx < 0 ? -s : s), y: from.y0 + (dy < 0 ? -s : s) };
  };
  // Hand / Zoom put a clear sheet over the preview so presses never reach the widget; the Alt key flips Zoom to zoom out.
  const [panning, setPanning] = useState(false);
  const [zoomOut, setZoomOut] = useState(false);
  // First-use hint: gone for good once dismissed (localStorage may be blocked, then it just shows again next time).
  const HINT_KEY = 'tcg:overlay-editor-hint';
  const [hintGone, setHintGone] = useState(true);
  useEffect(() => {
    try { setHintGone(localStorage.getItem(HINT_KEY) === '1'); } catch { setHintGone(false); }
  }, []);
  // Help > Show the editing hint again.
  useEffect(() => {
    if (!hintSignal) return;
    setHintGone(false);
    try { localStorage.removeItem(HINT_KEY); } catch { /* ignore */ }
  }, [hintSignal]);
  const dismissHint = () => {
    setHintGone(true);
    try { localStorage.setItem(HINT_KEY, '1'); } catch { /* ignore */ }
  };

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      {showRulers && (
        <div className="flex" onPointerMove={moveGuide} onPointerUp={endGuide} onPointerCancel={endGuide}>
          <div className="w-5 h-5 shrink-0 bg-gray-900" />
          <div className="flex-1 min-w-0"><RulerBar axis="x" origin={m.ox} fit={fit} len={m.bw} onPointerDown={newGuide('y')} /></div>
        </div>
      )}
      <div className="flex-1 min-h-0 flex">
      {showRulers && (
        <div className="shrink-0" onPointerMove={moveGuide} onPointerUp={endGuide} onPointerCancel={endGuide}>
          <RulerBar axis="y" origin={m.oy} fit={fit} len={m.bh} onPointerDown={newGuide('x')} />
        </div>
      )}
    <div
      ref={boxRef}
      data-canvas
      className="relative flex-1 min-w-0 rounded-xl border border-gray-800 bg-gray-950/70 overflow-auto flex [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div
        ref={stageRef}
        className="relative overflow-hidden rounded-md border border-gray-700 shrink-0 m-auto outline-hidden focus-visible:border-yellow-500"
        tabIndex={0}
        onKeyDown={onKeyDown}
        style={{
          width: frameW,
          height: frameH,
          ...(bg === 'image' && bgImage
            ? { backgroundColor: '#000', backgroundImage: `url(${bgImage})`, backgroundSize: '100% 100%' }
            : bg === 'dark'
              ? { backgroundColor: '#07080b' }
              : bg === 'light'
                ? { backgroundColor: '#e5e7eb' }
                : bg === 'green'
                  ? { backgroundColor: '#00b140' }
                  : {
                      backgroundColor: '#1a1d23',
                      backgroundImage:
                        'conic-gradient(#262a32 25%, transparent 0 50%, #262a32 0 75%, transparent 0)',
                      backgroundSize: '24px 24px',
                    }),
        }}
      >
        <iframe
          ref={frameRef}
          src="/overlay.html?preview&editor"
          title="Overlay preview"
          onLoad={() => {
            setReady(true);
            setLoadedCount(c => c + 1);
          }}
          style={{
            width: shownLayout.width,
            height: shownLayout.height,
            border: 0,
            background: 'transparent',
            colorScheme: 'light',
            transform: `scale(${fit})`,
            transformOrigin: 'top left',
          }}
        />
        {activeTool !== 'move' && (
          <div
            aria-hidden
            className="absolute inset-0 z-10 touch-none"
            style={{ cursor: drawing ? (isPack ? 'not-allowed' : 'crosshair') : activeTool === 'hand' ? (panning ? 'grabbing' : 'grab') : zoomOut ? 'zoom-out' : 'zoom-in' }}
            onPointerDown={e => {
              if (drawing) {
                if (isPack || e.button !== 0) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                const p = rubAt(e, rub);
                setRub({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
                return;
              }
              if (activeTool !== 'hand') return;
              e.currentTarget.setPointerCapture(e.pointerId);
              setPanning(true);
            }}
            onPointerMove={e => {
              if (rub) { const p = rubAt(e, rub); setRub(r => r && { ...r, x1: p.x, y1: p.y }); return; }
              setZoomOut(e.altKey);
              if (panning) boxRef.current?.scrollBy(-e.movementX, -e.movementY);
            }}
            onPointerUp={e => {
              setPanning(false);
              if (!rub) return;
              const p = rubAt(e, rub);
              setRub(null);
              addCustomAt(activeTool === 'shape' ? 'shape' : 'text', toolBox(activeTool === 'shape' ? 'shape' : 'text', rub.x0, rub.y0, p.x, p.y, shownLayout.width, shownLayout.height));
            }}
            onPointerCancel={() => { setPanning(false); setRub(null); }}
            onClick={e => {
              if (activeTool === 'zoom') zoomStep(e.altKey ? -1 : 1, e.clientX, e.clientY);
            }}
          />
        )}
        {rub && (
          <div
            aria-hidden
            className="absolute z-20 border border-dashed border-yellow-400 bg-yellow-400/10 pointer-events-none"
            style={{ left: Math.min(rub.x0, rub.x1) * fit, top: Math.min(rub.y0, rub.y1) * fit, width: Math.abs(rub.x1 - rub.x0) * fit, height: Math.abs(rub.y1 - rub.y0) * fit }}
          />
        )}
        {/* Guides (never part of the overlay, only drawn over the preview) */}
        {showGrid && (
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage:
                'linear-gradient(to right, rgba(255,255,255,.10) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,.10) 1px, transparent 1px)',
              backgroundSize: '10% 10%',
            }}
          />
        )}
        {showThirds && (
          <>
            <div aria-hidden className="absolute inset-y-0 left-1/3 w-px bg-sky-400/40 pointer-events-none" />
            <div aria-hidden className="absolute inset-y-0 left-2/3 w-px bg-sky-400/40 pointer-events-none" />
            <div aria-hidden className="absolute inset-x-0 top-1/3 h-px bg-sky-400/40 pointer-events-none" />
            <div aria-hidden className="absolute inset-x-0 top-2/3 h-px bg-sky-400/40 pointer-events-none" />
          </>
        )}
        {showSafe && (
          <>
            <div aria-hidden className="absolute inset-[5%] border border-dashed border-amber-300/50 pointer-events-none">
              <span className="absolute top-0 left-1 text-[9px] text-amber-300/70">action safe</span>
            </div>
            <div aria-hidden className="absolute inset-[10%] border border-dashed border-rose-300/50 pointer-events-none">
              <span className="absolute top-0 left-1 text-[9px] text-rose-300/70">title safe</span>
            </div>
          </>
        )}
        <div aria-hidden className="absolute inset-0 pointer-events-none">
          {(['x', 'y'] as const).flatMap(axis => guides[axis].map((v, i) => (
            <div
              key={axis + i}
              data-guide={axis}
              onPointerDown={e => beginGuide(axis, i, e)}
              onPointerMove={moveGuide}
              onPointerUp={endGuide}
              onPointerCancel={endGuide}
              className={`absolute ${guidesLocked ? 'pointer-events-none' : 'pointer-events-auto'} ${axis === 'x' ? 'inset-y-0 w-2 -ml-1 cursor-col-resize' : 'inset-x-0 h-2 -mt-1 cursor-row-resize'}`}
              style={axis === 'x' ? { left: v * fit } : { top: v * fit }}
            >
              <div className={`absolute bg-cyan-400/80 pointer-events-none ${axis === 'x' ? 'inset-y-0 left-1/2 w-px' : 'inset-x-0 top-1/2 h-px'}`} />
            </div>
          )))}
        </div>
        {showSaved && (
          <span className="absolute top-2 left-2 rounded-md bg-gray-950/85 border border-yellow-500/50 px-2 py-0.5 text-[11px] font-bold text-yellow-300 pointer-events-none">
            Showing the saved look
          </span>
        )}
        {dragging && (
          <>
            {/* Centre guides: the middle of the browser source */}
            <div className="absolute inset-y-0 left-1/2 w-px bg-yellow-400/25 pointer-events-none" />
            <div className="absolute inset-x-0 top-1/2 h-px bg-yellow-400/25 pointer-events-none" />
          </>
        )}
        {!hintGone && !isPack && ready && (
          <p className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-md bg-gray-950/90 border border-gray-700 px-2.5 py-1 text-[11px] text-gray-300">
            Click anything to edit it, drag to move it
            <button type="button" onClick={dismissHint} aria-label="Dismiss hint" className="text-gray-500 hover:text-white">
              <Icon name="x" />
            </button>
          </p>
        )}
        {!ready && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-gray-500">Loading preview…</p>
        )}
      </div>
      <LayerMenu />
    </div>
      </div>
    </div>
  );
}
