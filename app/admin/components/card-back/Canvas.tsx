'use client';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FlipCard } from '@/app/components/FlipCard';
import type { FlipBack } from '@/lib/flip-back';
import type { CardBackStyle } from '@/lib/card-back';
import { makeFree, patchElements, snapAxis, snapTargets, type Box } from '@/lib/card-back-edit';

/** The width of the print page's card in px: the classic stack's type is a fixed size, so it is converted to a share of this width. */
export const PRINT_W = 260;

export type Boxes = Record<string, Box & { fontPx: number }>;

interface Drag {
  mode: 'move' | 'width' | 'height' | 'scale' | 'rotate' | 'marquee';
  sx: number; sy: number;
  ids: string[];
  base: CardBackStyle;
  moved: boolean;
  pending: string[]; // stack elements to take out of the stack at the first movement
  primary?: string;
  extra?: boolean;
}

/**
 * The editor's canvas: the real back (drawn by FlipCard from the layout engine) with a transparent layer over it holding one box per element.
 * Drag a box to move it (an element still in the stack is taken out of it), drag the right-hand handle to change its width, Shift-drag the corner
 * to scale its text, drag the round handle to rotate. Snap guides show the card centre and edges, other elements and a 2 % grid (Alt = free).
 * Arrow keys nudge by 0.5 % (Shift 2 %). Drag on empty space to select several; click it to select the background.
 */
export function Canvas({ style, back, width, selection, onSelect, onGesture, onChange, onBoxes }: {
  style: CardBackStyle;
  back: FlipBack;
  width: number;
  /** Ids of the selected elements, or `bg` for the background. */
  selection: Set<string>;
  onSelect: (ids: Set<string>) => void;
  /** Called once when an edit gesture starts (so the whole drag is one undo step); `key` coalesces repeated nudges. */
  onGesture: (key?: string) => void;
  onChange: (next: CardBackStyle) => void;
  onBoxes?: (b: Boxes) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [boxes, setBoxes] = useState<Boxes>({});
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });
  const [marquee, setMarquee] = useState<Box | null>(null);
  const drag = useRef<Drag | null>(null);
  const boxesRef = useRef(boxes);
  boxesRef.current = boxes;

  const measure = useCallback(() => {
    const card = wrap.current?.querySelector('.flip-card');
    if (!card) return;
    const cr = card.getBoundingClientRect();
    if (!cr.width) return;
    const out: Boxes = {};
    card.querySelectorAll<HTMLElement>('[data-back-id]').forEach(el => {
      const r = el.getBoundingClientRect();
      out[el.dataset.backId!] = { l: ((r.left - cr.left) / cr.width) * 100, t: ((r.top - cr.top) / cr.height) * 100, w: (r.width / cr.width) * 100, h: (r.height / cr.height) * 100, fontPx: parseFloat(getComputedStyle(el).fontSize) || 12 };
    });
    const round = (b: Boxes) => JSON.stringify(Object.fromEntries(Object.entries(b).map(([k, v]) => [k, [v.l, v.t, v.w, v.h, v.fontPx].map(n => Math.round(n * 10) / 10)])));
    if (round(out) !== round(boxesRef.current)) { setBoxes(out); onBoxes?.(out); }
  }, [onBoxes]);
  useLayoutEffect(() => {
    measure();
    const f = () => measure();
    document.fonts?.addEventListener?.('loadingdone', f);
    return () => document.fonts?.removeEventListener?.('loadingdone', f);
  });

  const cardRect = () => wrap.current!.querySelector('.flip-card')!.getBoundingClientRect();
  const pct = (e: { clientX: number; clientY: number }) => { const r = cardRect(); return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100, r }; };

  function selectOnDown(id: string, shift: boolean): string[] {
    const next = new Set(selection);
    next.delete('bg');
    if (shift) { if (next.has(id)) next.delete(id); else next.add(id); } else if (!next.has(id)) { next.clear(); next.add(id); }
    onSelect(next);
    return [...next];
  }

  function start(e: React.PointerEvent, id: string, mode: Drag['mode']) {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const ids = mode === 'move' ? selectOnDown(id, e.shiftKey) : [id];
    const els = style.elements.filter(x => ids.includes(x.id) && !x.locked);
    drag.current = { mode, sx: e.clientX, sy: e.clientY, ids: els.map(x => x.id), base: style, moved: false, pending: els.filter(x => x.place === 'stack').map(x => x.id), primary: id, extra: e.shiftKey };
  }

  function move(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const { x: px, y: py, r } = pct(e);
    if (d.mode === 'marquee') {
      const s = { x: ((d.sx - r.left) / r.width) * 100, y: ((d.sy - r.top) / r.height) * 100 };
      setMarquee({ l: Math.min(s.x, px), t: Math.min(s.y, py), w: Math.abs(px - s.x), h: Math.abs(py - s.y) });
      d.moved = Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 3;
      return;
    }
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 3) return;
      d.moved = true;
      onGesture();
      if (d.pending.length) {
        let s = d.base;
        for (const id of d.pending) { const b = boxesRef.current[id]; if (b) s = makeFree(s, id, b, b.fontPx, PRINT_W); }
        d.base = s; onChange(s);
      }
    }
    const dx = ((e.clientX - d.sx) / r.width) * 100, dy = ((e.clientY - d.sy) / r.height) * 100;
    const baseEl = (id: string) => d.base.elements.find(x => x.id === id)!;
    if (d.mode === 'move') {
      const prim = baseEl(d.ids.includes(d.primary!) ? d.primary! : d.ids[0]);
      if (!prim) return;
      const bb = boxesRef.current[prim.id];
      const h = bb?.h ?? 6;
      const others = Object.entries(boxesRef.current).filter(([id]) => !d.ids.includes(id)).map(([, b]) => b);
      const t = snapTargets(others);
      let nx = prim.x + dx, ny = prim.y + dy, gx: number[] = [], gy: number[] = [];
      if (!e.altKey) {
        const sx = snapAxis([nx - prim.w / 2, nx, nx + prim.w / 2], t.x);
        const sy = snapAxis([ny - h / 2, ny, ny + h / 2], t.y);
        nx += sx.delta; ny += sy.delta; if (sx.guide !== null) gx = [sx.guide]; if (sy.guide !== null) gy = [sy.guide];
      }
      setGuides({ x: gx, y: gy });
      const ddx = nx - prim.x, ddy = ny - prim.y;
      onChange(patchElements(d.base, d.ids, el => ({ x: baseEl(el.id).x + ddx, y: baseEl(el.id).y + ddy })));
    } else {
      const id = d.ids[0];
      const el = id ? baseEl(id) : null;
      if (!el) return;
      const cx = el.x, cy = el.y;
      if (d.mode === 'width' || (d.mode === 'scale' && !e.shiftKey)) onChange(patchElements(d.base, [id], { w: Math.abs(px - cx) * 2 }));
      else if (d.mode === 'height') onChange(patchElements(d.base, [id], { h: Math.abs(py - cy) * 2 }));
      else if (d.mode === 'scale') {
        const s0 = pct({ clientX: d.sx, clientY: d.sy });
        const k = Math.hypot((px - cx) * r.width, (py - cy) * r.height) / Math.max(4, Math.hypot((s0.x - cx) * r.width, (s0.y - cy) * r.height));
        onChange(el.kind === 'qr' || el.kind === 'logo' ? patchElements(d.base, [id], { w: el.w * k }) : patchElements(d.base, [id], { size: el.size * k }));
      } else if (d.mode === 'rotate') {
        let a = (Math.atan2((py - cy) * r.height, (px - cx) * r.width) * 180) / Math.PI + 90;
        if (a > 180) a -= 360;
        a = Math.max(-45, Math.min(45, a));
        onChange(patchElements(d.base, [id], { rotate: Math.abs(a) < 3 ? 0 : a }));
      }
    }
  }

  function end(e: React.PointerEvent) {
    const d = drag.current;
    drag.current = null;
    setGuides({ x: [], y: [] });
    if (!d) return;
    if (d.mode === 'marquee') {
      if (!d.moved) { onSelect(new Set(['bg'])); } else {
        const { x, y, r } = pct(e);
        const s = { x: ((d.sx - r.left) / r.width) * 100, y: ((d.sy - r.top) / r.height) * 100 };
        const m = { l: Math.min(s.x, x), t: Math.min(s.y, y), r: Math.max(s.x, x), b: Math.max(s.y, y) };
        const hit = style.elements.filter(el => { const b = boxes[el.id]; return b && b.l < m.r && b.l + b.w > m.l && b.t < m.b && b.t + b.h > m.t; }).map(el => el.id);
        onSelect(e.shiftKey ? new Set([...selection, ...hit]) : new Set(hit));
      }
      setMarquee(null);
    }
  }

  function bgDown(e: React.PointerEvent) {
    if (e.target !== e.currentTarget) return;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    drag.current = { mode: 'marquee', sx: e.clientX, sy: e.clientY, ids: [], base: style, moved: false, pending: [] };
  }

  function key(e: React.KeyboardEvent) {
    const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const a = arrows[e.key];
    const ids = style.elements.filter(el => selection.has(el.id) && el.place === 'free' && !el.locked).map(el => el.id);
    if (!a || ids.length === 0) return;
    e.preventDefault();
    const step = e.shiftKey ? 2 : 0.5;
    onGesture('nudge');
    onChange(patchElements(style, ids, el => ({ x: el.x + a[0] * step, y: el.y + a[1] * step })));
  }

  const only = selection.size === 1 && !selection.has('bg') ? style.elements.find(el => selection.has(el.id)) : undefined;
  const fb = useMemo(() => ({ ...back, style }), [back, style]);

  return (
    <div ref={wrap} className="relative select-none outline-hidden focus-visible:ring-2 focus-visible:ring-yellow-500/60 rounded-xl" style={{ width }} tabIndex={0} onKeyDown={key} aria-label="Card back canvas. Arrow keys move the selected element.">
      <FlipCard bare back={fb}>{null}</FlipCard>
      <div className="absolute inset-0 touch-none" onPointerDown={bgDown} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
        {guides.x.map(g => <div key={`x${g}`} className="absolute top-0 bottom-0 w-px bg-pink-400/80 pointer-events-none" style={{ left: `${g}%` }} />)}
        {guides.y.map(g => <div key={`y${g}`} className="absolute left-0 right-0 h-px bg-pink-400/80 pointer-events-none" style={{ top: `${g}%` }} />)}
        {marquee && <div className="absolute border border-sky-400 bg-sky-400/10 pointer-events-none" style={{ left: `${marquee.l}%`, top: `${marquee.t}%`, width: `${marquee.w}%`, height: `${marquee.h}%` }} />}
        {style.elements.map(el => {
          const b = boxes[el.id];
          if (!b || !el.show) return null;
          const sel = selection.has(el.id);
          return (
            <div key={el.id} data-box={el.id} role="button" tabIndex={-1} aria-label={`${el.kind} element${sel ? ', selected' : ''}`}
              onPointerDown={e => start(e, el.id, 'move')}
              className={`absolute ${sel ? 'border border-yellow-400 bg-yellow-400/10' : 'border border-transparent hover:border-sky-300/70'} ${el.locked ? 'cursor-not-allowed' : 'cursor-move'}`}
              style={{ left: `${b.l}%`, top: `${b.t}%`, width: `${b.w}%`, height: `${b.h}%` }}>
              {only?.id === el.id && el.place === 'free' && !el.locked && (
                <>
                  <span onPointerDown={e => start(e, el.id, 'width')} className="absolute top-1/2 -right-2 -translate-y-1/2 w-3 h-5 rounded-xs bg-yellow-400 border border-gray-900 cursor-ew-resize" title="Drag to change the width" />
                  {el.kind !== 'logo' && el.kind !== 'qr' && <span onPointerDown={e => start(e, el.id, 'height')} className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-5 h-3 rounded-xs bg-yellow-400 border border-gray-900 cursor-ns-resize" title="Drag to set a fixed height" />}
                  <span onPointerDown={e => start(e, el.id, 'scale')} className="absolute -bottom-2 -right-2 w-3.5 h-3.5 rounded-xs bg-yellow-400 border border-gray-900 cursor-nwse-resize" title="Drag to change the width, Shift-drag to scale the text" />
                  <span onPointerDown={e => start(e, el.id, 'rotate')} className="absolute -top-6 left-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-yellow-400 border border-gray-900 cursor-grab" title="Drag to rotate" />
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
