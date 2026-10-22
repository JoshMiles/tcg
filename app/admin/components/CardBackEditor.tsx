'use client';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from 'react';
import { FlipCard } from '@/app/components/FlipCard';
import { Icon } from '@/app/components/Icon';
import { saveCardBackAction, resetCardBackAction, loadCardBackAction } from '../card-back-actions';
import { DEFAULT_CARD_BACK, isDefaultCardBack, resolveCardBack, type CardBackStyle } from '@/lib/card-back';
import { EDITOR_PRESETS, addMedia, addText, patchElements, tinyText, type Box } from '@/lib/card-back-edit';
import { pctToPt } from '@/lib/text-style';
import { sampleFlipBack, type FlipBack } from '@/lib/flip-back';
import { Canvas, PRINT_W, type Boxes } from './card-back/Canvas';
import { Layers } from './card-back/Layers';
import { Properties } from './card-back/Properties';
import { Menu, MenuBar, MenuItem, MenuSeparator } from './workspace/MenuBar';
import { PanelStack, type PanelDef } from './workspace/PanelStack';
import { ColumnResizer } from './workspace/ColumnResizer';
import { RulerBar } from './workspace/RulerBar';
import { StatusBar, StatusItem } from './workspace/StatusBar';
import { ToolStrip, type ToolDef } from './workspace/ToolStrip';
import { resetColumnLayout, useColumnLayout } from './workspace/useColumnLayout';

/**
 * The "Card back" section of a pack (ROADMAP 20.1, 20.3b): a live preview with presets, Copy from another pack, Reset and Save, and **Edit design**,
 * which opens the visual editor: a canvas to drag, resize, scale and rotate elements, a layers list, the properties of the selection, the same back at
 * three sizes, undo and redo. Self-contained (its own props and server actions, no assumption about the page around it).
 */
export interface CardBackEditorProps {
  packId: string;
  packName: string;
  /** Season name for the `{season}` token in the preview (any season the pack is in). */
  seasonName?: string;
  coverImageUrl?: string;
  /** The stored design; null = the classic look. */
  initial: CardBackStyle | null;
  /** A card of this pack for the sample print. */
  sample: { name: string; imageUrl: string; hex?: string };
  /** Other packs to copy a design from. */
  others: { id: string; name: string }[];
  /** `stacked` puts the preview above the controls (for a narrow panel); `wide` puts it beside them. */
  layout?: 'wide' | 'stacked';
}

const btn = 'px-3 py-2 text-sm font-bold rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white disabled:opacity-50';
const field = 'select select-sm';

type Tool = 'move' | 'hand' | 'zoom' | 'text' | 'shape' | 'image';
const TOOLS: (ToolDef & { id: Tool })[] = [
  { id: 'move', label: 'Move', icon: 'move', shortcut: 'V' },
  { id: 'hand', label: 'Hand', icon: 'hand', shortcut: 'H' },
  { id: 'zoom', label: 'Zoom', icon: 'zoomIn', shortcut: 'Z' },
  { id: 'text', label: 'Text', icon: 'text', shortcut: 'T' },
  { id: 'shape', label: 'Shape', icon: 'stop', shortcut: 'U' },
  { id: 'image', label: 'Image', icon: 'image', shortcut: 'I' },
];
/** Zoom is a multiple of "Fit" (1 = fit). */
const ZOOM_STEPS = [0.5, 0.75, 1, 1.5, 2, 3, 4];
const RULERS_KEY = 'tcg:card-back-rulers';

export function CardBackEditor({ packId, packName, seasonName, coverImageUrl, initial, sample, others, layout = 'wide' }: CardBackEditorProps) {
  const start = initial ?? DEFAULT_CARD_BACK;
  const [style, setStyleState] = useState<CardBackStyle>(start);
  const styleRef = useRef(start);
  const [saved, setSaved] = useState(JSON.stringify(start));
  const past = useRef<CardBackStyle[]>([]);
  const future = useRef<CardBackStyle[]>([]);
  const lastKey = useRef({ key: '', at: 0 });
  const [, tick] = useState(0);
  const [selection, setSelection] = useState<Set<string>>(new Set(['bg']));
  const [boxes, setBoxes] = useState<Boxes>({});
  const [open, setOpen] = useState(false);
  /** A style shown on the canvas without being part of the design (the font picker's hover). */
  const [preview, setPreview] = useState<CardBackStyle | null>(null);
  const [note, setNote] = useState('');
  const [from, setFrom] = useState('');
  const [pending, run] = useTransition();
  const scrollBox = useRef<HTMLDivElement>(null);
  const [fitW, setFitW] = useState(340);
  const [zoom, setZoom] = useState(1);
  const canvasW = Math.round(fitW * zoom);
  const [tool, setTool] = useState<Tool>('move');
  /** The box being drawn with the Shape or Image tool (top-left corner and size, in % of the card). */
  const [draw, setDraw] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [spaceDown, setSpaceDown] = useState(false); // Space held: a temporary Hand
  const activeTool: Tool = spaceDown ? 'hand' : tool;
  const [rulers, setRulers] = useState(false);
  const [sizes, setSizes] = useState(true);
  const [ruler, setRuler] = useState({ ox: 0, oy: 0, sx: 1, sy: 1, bw: 0, bh: 0 });
  const readout = useRef<HTMLSpanElement>(null);
  const pan = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);
  const zoomAnchor = useRef<{ fx: number; fy: number; cx: number; cy: number } | null>(null);
  const column = useColumnLayout('tcg:card-back-workspace');

  const dirty = JSON.stringify(style) !== saved;
  const setStyle = useCallback((s: CardBackStyle) => { styleRef.current = s; setStyleState(s); setNote(''); }, []);
  /** An edit that is one undo step (edits with the same `key` within a moment count as one). */
  const change = useCallback((next: CardBackStyle, key?: string) => {
    const now = Date.now();
    if (!(key && key === lastKey.current.key && now - lastKey.current.at < 800)) past.current = [...past.current.slice(-59), styleRef.current];
    lastKey.current = { key: key ?? '', at: now };
    future.current = [];
    setStyle(next); tick(n => n + 1);
  }, [setStyle]);
  /** The start of a drag (or a burst of nudges): the whole gesture is one undo step. */
  const gesture = useCallback((key?: string) => {
    const now = Date.now();
    if (key && key === lastKey.current.key && now - lastKey.current.at < 800) { lastKey.current.at = now; return; }
    past.current = [...past.current.slice(-59), styleRef.current]; future.current = []; lastKey.current = { key: key ?? '', at: now }; tick(n => n + 1);
  }, []);
  const undo = useCallback(() => { const p = past.current.pop(); if (!p) return; future.current.push(styleRef.current); lastKey.current = { key: '', at: 0 }; setStyle(p); tick(n => n + 1); }, [setStyle]);
  const redo = useCallback(() => { const f = future.current.pop(); if (!f) return; past.current.push(styleRef.current); lastKey.current = { key: '', at: 0 }; setStyle(f); tick(n => n + 1); }, [setStyle]);

  const live = useMemo(() => resolveCardBack(style, { packName, seasonName, cover: coverImageUrl })!, [style, packName, seasonName, coverImageUrl]);
  const hex = sample.hex ?? '#facc15';
  const back: FlipBack = useMemo(() => ({ ...sampleFlipBack(sample.name, hex), href: '#' }), [sample.name, hex]);
  const tiny = tinyText(style);

  useEffect(() => { try { setRulers(localStorage.getItem(RULERS_KEY) === '1'); } catch { /* storage blocked */ } }, []);
  const toggleRulers = () => setRulers(v => {
    try { localStorage.setItem(RULERS_KEY, v ? '0' : '1'); } catch { /* storage blocked */ }
    return !v;
  });

  // The ruler origins and scale, measured from the DOM (the box scrolls and the card zooms).
  const measureRuler = useCallback(() => {
    const b = scrollBox.current, c = b?.querySelector('.flip-card');
    if (!b || !c) return;
    const br = b.getBoundingClientRect(), cr = c.getBoundingClientRect();
    const r = (n: number) => Math.round(n * 10) / 10;
    const n = { ox: r(cr.left - br.left - b.clientLeft), oy: r(cr.top - br.top - b.clientTop), sx: cr.width / 100, sy: cr.height / 100, bw: b.clientWidth, bh: b.clientHeight };
    setRuler(p => (JSON.stringify(n) === JSON.stringify(p) ? p : n));
  }, []);
  /** Zoom to `z` (a multiple of Fit); the point under (cx, cy) in the viewport, default the box centre, stays put. */
  const zoomTo = (z: number, cx?: number, cy?: number) => {
    const b = scrollBox.current, c = b?.querySelector('.flip-card');
    const nz = Math.min(6, Math.max(0.25, z));
    if (b && c) {
      const br = b.getBoundingClientRect(), cr = c.getBoundingClientRect();
      const x = cx ?? br.left + b.clientWidth / 2, y = cy ?? br.top + b.clientHeight / 2;
      zoomAnchor.current = { fx: (x - cr.left) / cr.width, fy: (y - cr.top) / cr.height, cx: x, cy: y };
    }
    setZoom(nz);
  };
  const zoomStep = (dir: 1 | -1, cx?: number, cy?: number) => {
    const next = dir > 0 ? ZOOM_STEPS.find(s => s > zoom * 1.001) : [...ZOOM_STEPS].reverse().find(s => s < zoom / 1.001);
    if (next) zoomTo(next, cx, cy);
  };
  useLayoutEffect(() => {
    const a = zoomAnchor.current, b = scrollBox.current, c = b?.querySelector('.flip-card');
    zoomAnchor.current = null;
    if (!a || !b || !c) return;
    const cr = c.getBoundingClientRect();
    b.scrollLeft += cr.left + a.fx * cr.width - a.cx;
    b.scrollTop += cr.top + a.fy * cr.height - a.cy;
  }, [canvasW]);
  useLayoutEffect(() => { measureRuler(); });

  // The editor: the canvas width.
  useEffect(() => {
    const el = scrollBox.current;
    if (!open || !el) return;
    const ro = new ResizeObserver(() => { setFitW(Math.max(220, Math.min(380, el.clientWidth - 56))); measureRuler(); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, measureRuler]);

  // Escape, the undo keys, tools (V H Z T, Space = Hand while held) and zoom (Ctrl + - 0 1, Ctrl+R rulers). Reads through a ref so the listener is added once.
  const onKeyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  onKeyRef.current = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable;
    if (e.type === 'keyup') { if (e.key === ' ') setSpaceDown(false); return; }
    if (e.key === 'Escape' && !typing && !e.defaultPrevented) { setOpen(false); return; }
    if (typing) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (!(e.ctrlKey || e.metaKey)) {
      if (e.altKey) return;
      const tool = ({ v: 'move', h: 'hand', z: 'zoom', t: 'text', u: 'shape', i: 'image' } as Record<string, Tool>)[k];
      if (tool) { e.preventDefault(); setTool(tool); }
      else if (k === ' ' && !t.closest('button,a,summary,[role=menuitem]')) { e.preventDefault(); setSpaceDown(true); }
      return;
    }
    if (k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
    else if (k === 'y') { e.preventDefault(); redo(); }
    else if (k === 'r') { e.preventDefault(); toggleRulers(); }
    else if (k === '0') { e.preventDefault(); zoomTo(1); }
    else if (k === '1') { e.preventDefault(); zoomTo(PRINT_W / fitW); }
    else if (k === '=' || k === '+') { e.preventDefault(); zoomStep(1); }
    else if (k === '-') { e.preventDefault(); zoomStep(-1); }
  };
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => onKeyRef.current(e);
    const drop = () => setSpaceDown(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    window.addEventListener('blur', drop);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey); window.removeEventListener('blur', drop); };
  }, [open]);

  // Hand pans the box; the pointer readout in the status bar is written straight to the DOM (no re-render per move).
  const boxDown = (e: React.PointerEvent) => {
    const b = scrollBox.current;
    if (activeTool !== 'hand' || !b) return;
    b.setPointerCapture?.(e.pointerId);
    pan.current = { x: e.clientX, y: e.clientY, sl: b.scrollLeft, st: b.scrollTop };
  };
  const boxMove = (e: React.PointerEvent) => {
    const b = scrollBox.current, c = b?.querySelector('.flip-card');
    if (b && pan.current) { b.scrollLeft = pan.current.sl - (e.clientX - pan.current.x); b.scrollTop = pan.current.st - (e.clientY - pan.current.y); }
    if (!c || !readout.current) return;
    const r = c.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100, y = ((e.clientY - r.top) / r.height) * 100;
    readout.current.textContent = x < 0 || x > 100 || y < 0 || y > 100 ? 'X -  Y -'
      : `X ${x.toFixed(1)} % (${pctToPt(x)} pt)  Y ${y.toFixed(1)} % (${pctToPt((y * r.height) / r.width)} pt)`;
  };
  const sheetDown = (e: React.PointerEvent) => {
    const c = scrollBox.current?.querySelector('.flip-card');
    if (!c) return;
    if (activeTool === 'zoom') { zoomStep(e.altKey ? -1 : 1, e.clientX, e.clientY); return; }
    const r = c.getBoundingClientRect();
    const clamp = (n: number) => Math.min(100, Math.max(0, Math.round(n * 10) / 10));
    if (activeTool === 'shape' || activeTool === 'image') {
      // Drag to draw the box; a plain click makes a default-sized one.
      const kind = activeTool;
      const at = (ev: { clientX: number; clientY: number }) => ({ x: clamp(((ev.clientX - r.left) / r.width) * 100), y: clamp(((ev.clientY - r.top) / r.height) * 100) });
      const a = at(e);
      const box = (b: { x: number; y: number }) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });
      const move = (ev: PointerEvent) => setDraw(box(at(ev)));
      const up = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); setDraw(null);
        const d = box(at(ev)), click = d.w < 2 && d.h < 2;
        const w = click ? 40 : Math.max(2, d.w), h = click ? 20 : Math.max(2, d.h);
        const made = addMedia(styleRef.current, kind, { x: clamp(click ? a.x : d.x + d.w / 2), y: clamp(click ? a.y : d.y + d.h / 2), w, h });
        if (!made) { setNote('No room for another element'); return; }
        change(made.style); setSelection(new Set([made.id])); setTool('move');
      };
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
      return;
    }
    if (activeTool !== 'text') return;
    const made = addText(live);
    if (!made) { setNote('No room for another text'); return; }
    change(patchElements(made.style, [made.id], { x: clamp(((e.clientX - r.left) / r.width) * 100), y: clamp(((e.clientY - r.top) / r.height) * 100) }));
    setSelection(new Set([made.id]));
    setTool('move');
  };

  const exec = (fn: () => Promise<CardBackStyle>, done: string) => run(async () => {
    try { const next = await fn(); setStyle(next); setSaved(JSON.stringify(next)); past.current = []; future.current = []; setNote(done); }
    catch (err) { setNote(err instanceof Error ? err.message : 'That did not work'); }
  });
  const save = () => exec(() => saveCardBackAction(packId, style), 'Saved');
  const preset = (s: CardBackStyle) => { change(s); setSelection(new Set(['bg'])); };

  const panels: PanelDef[] = [
    { id: 'properties', title: 'Properties', icon: 'settings', weight: 2, content: <div className="p-3"><Properties style={live} selection={selection} boxes={boxes} cardW={canvasW} onChange={change} onPreview={setPreview} /></div> },
    { id: 'layers', title: 'Layers', icon: 'layers', weight: 1, content: <div className="p-3"><Layers style={live} selection={selection} boxes={boxes as Record<string, Box>} onSelect={setSelection} onChange={change} /></div> },
  ];

  const panelCard = (
    <FlipCard key={`${live.pattern}-${live.elements.length}`} defaultFlipped back={{ ...back, style: live }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={sample.imageUrl} alt={sample.name} className="w-full h-full object-cover rounded-xl border-2" style={{ borderColor: hex }} />
    </FlipCard>
  );

  const actions = (
    <div className="flex flex-wrap items-center gap-2 pt-1">
      <button type="button" onClick={() => setOpen(true)} className="px-4 py-2 btn btn-primary rounded-xl text-sm"><Icon name="palette" className="mr-1.5" />Edit design</button>
      <button type="button" disabled={pending || !dirty} onClick={save} className={`${btn} text-white! bg-gray-700`}>{pending ? 'Working…' : 'Save card back'}</button>
      <button type="button" disabled={pending || (isDefaultCardBack(style) && !dirty && !initial)} onClick={() => exec(resetCardBackAction.bind(null, packId), 'Back to the classic look')} className={btn}>Reset to default</button>
      {others.length > 0 && (
        <span className="inline-flex items-center gap-1.5">
          <select aria-label="Copy from another pack" value={from} onChange={e => setFrom(e.target.value)} className={field}>
            <option value="">Copy from another pack…</option>
            {others.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <button type="button" disabled={pending || !from} onClick={() => run(async () => { try { change(await loadCardBackAction(from)); setNote('Copied. Press Save to keep it.'); } catch { setNote('That did not work'); } })} className={btn}>Copy</button>
        </span>
      )}
      <span role="status" className="text-xs text-gray-400">{note || (dirty ? 'Unsaved changes' : '')}</span>
    </div>
  );

  return (
    <div id="card-back" className="card rounded-2xl overflow-hidden scroll-mt-20">
      <div className="px-5 py-4 border-b border-gray-800">
        <h3 className="text-sm font-semibold text-white">Card back</h3>
        <p className="text-xs text-gray-500 mt-0.5">How the back of an edition looks for cards from this pack. Until you save a design, it keeps the classic engraved plate.</p>
      </div>
      <div className={`p-5 grid gap-6 items-start ${layout === 'wide' ? 'lg:grid-cols-[240px_1fr]' : ''}`}>
        <div className="mx-auto w-full max-w-[220px]">{panelCard}</div>
        <div className="space-y-4 min-w-0">
          <div role="group" aria-label="Presets" className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-gray-400 mr-1">Start from</span>
            {EDITOR_PRESETS.map(p => <button key={p.id} type="button" onClick={() => preset(p.style)} className="px-2.5 py-1 text-xs font-bold rounded-lg border bg-gray-800 border-gray-700 text-gray-300 hover:text-white">{p.label}</button>)}
          </div>
          {actions}
        </div>
      </div>

      {open && (
        <div role="dialog" aria-modal="true" aria-label="Card back editor" className="fixed inset-0 z-50 bg-gray-950 flex flex-col gap-3 p-3">
          <div className="flex flex-col gap-1.5 rounded-xl bg-gray-900/80 border border-gray-800 px-3 py-1.5">
            <MenuBar
              end={
                <>
                  <button type="button" onClick={undo} disabled={past.current.length === 0} aria-label="Undo" title="Undo (Ctrl+Z)" className="p-2 rounded-lg border border-gray-700 text-gray-200 disabled:opacity-40"><Icon name="undo" /></button>
                  <button type="button" onClick={redo} disabled={future.current.length === 0} aria-label="Redo" title="Redo (Ctrl+Shift+Z)" className="p-2 rounded-lg border border-gray-700 text-gray-200 disabled:opacity-40"><Icon name="redo" /></button>
                  <select aria-label="Presets" value="" onChange={e => { const p = EDITOR_PRESETS.find(x => x.id === e.target.value); if (p) preset(p.style); }} className={`${field} w-40 hidden sm:block`}>
                    <option value="">Preset…</option>{EDITOR_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                  <button type="button" disabled={pending || !dirty} onClick={save} className="px-4 py-2 btn btn-primary rounded-lg text-sm disabled:opacity-50">{pending ? 'Saving…' : 'Save'}</button>
                  <button type="button" onClick={() => setOpen(false)} aria-label="Close the editor" className="p-2 rounded-lg border border-gray-700 text-gray-200"><Icon name="x" /></button>
                </>
              }
            >
              <h2 className="text-sm font-bold text-white mr-2">Card back: {packName}</h2>
              <Menu label="File">
                <MenuItem label="Save" disabled={pending || !dirty} onSelect={save} />
                <MenuItem label="Close" icon="x" shortcut="Esc" onSelect={() => setOpen(false)} />
              </Menu>
              <Menu label="Edit">
                <MenuItem label="Undo" icon="undo" shortcut="Ctrl+Z" disabled={past.current.length === 0} onSelect={undo} />
                <MenuItem label="Redo" icon="redo" shortcut="Ctrl+Shift+Z" disabled={future.current.length === 0} onSelect={redo} />
              </Menu>
              <Menu label="View">
                <MenuItem label="Zoom in" icon="zoomIn" shortcut="Ctrl++" onSelect={() => zoomStep(1)} />
                <MenuItem label="Zoom out" shortcut="Ctrl+-" onSelect={() => zoomStep(-1)} />
                <MenuItem label="Fit" shortcut="Ctrl+0" onSelect={() => zoomTo(1)} />
                <MenuItem label="100%" shortcut="Ctrl+1" onSelect={() => zoomTo(PRINT_W / fitW)} />
                <MenuSeparator />
                <MenuItem label="Rulers" icon="ruler" shortcut="Ctrl+R" checked={rulers} onSelect={toggleRulers} />
                <MenuItem label="Size previews" checked={sizes} onSelect={() => setSizes(v => !v)} />
              </Menu>
              <Menu label="Window">
                <MenuItem label="Reset workspace" icon="undo" onSelect={resetColumnLayout} />
              </Menu>
            </MenuBar>
          </div>

          <div style={{ '--dock-w': column.railed ? '2.75rem' : `${column.width}rem` } as React.CSSProperties} className="flex-1 min-h-0 overflow-y-auto xl:overflow-hidden grid gap-3 content-start xl:content-stretch xl:grid-cols-[minmax(0,1fr)_var(--dock-w)]">
            <div className="xl:overflow-y-auto flex flex-col items-center gap-5 min-w-0">
              <div className="flex gap-2 w-full min-w-0 justify-center">
                <ToolStrip tools={TOOLS} active={activeTool} onSelect={id => setTool(id as Tool)} />
                <div className="min-w-0 flex-1 max-w-[600px]">
                  {rulers && (
                    <div className="flex">
                      <div className="w-5 h-5 shrink-0 bg-gray-900" />
                      <div className="flex-1 min-w-0"><RulerBar axis="x" origin={ruler.ox} fit={ruler.sx} len={ruler.bw} title="% of the card width (1 % = 1.8 pt)" /></div>
                    </div>
                  )}
                  <div className="flex">
                    {rulers && <div className="shrink-0 w-5 relative overflow-hidden"><div className="absolute inset-0"><RulerBar axis="y" origin={ruler.oy} fit={ruler.sy} len={ruler.bh} title="% of the card height" /></div></div>}
                    <div
                      ref={scrollBox}
                      data-canvas
                      onPointerDown={boxDown} onPointerMove={boxMove} onPointerUp={() => { pan.current = null; }} onPointerCancel={() => { pan.current = null; }}
                      onPointerLeave={() => { if (readout.current) readout.current.textContent = 'X -  Y -'; }}
                      className={`flex-1 min-w-0 max-h-[70vh] overflow-auto flex rounded-xl border border-gray-800 bg-gray-950/70 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${activeTool === 'hand' ? 'cursor-grab' : ''}`}
                      onScroll={measureRuler}
                    >
                      <div className="relative m-auto p-6">
                        <Canvas style={preview ?? live} back={back} width={canvasW} selection={selection} onSelect={setSelection} onGesture={gesture} onChange={setStyle} onBoxes={setBoxes} />
                        {activeTool !== 'move' && <div onPointerDown={sheetDown} aria-hidden className={`absolute inset-0 z-10 ${activeTool === 'zoom' ? 'cursor-zoom-in' : activeTool === 'text' ? 'cursor-text' : activeTool === 'shape' || activeTool === 'image' ? 'cursor-crosshair' : ''}`}>
                          {draw && <div className="absolute border-2 border-dashed border-yellow-400 bg-yellow-400/10" style={{ left: `calc(1.5rem + (100% - 3rem) * ${draw.x / 100})`, top: `calc(1.5rem + (100% - 3rem) * ${draw.y / 100})`, width: `calc((100% - 3rem) * ${draw.w / 100})`, height: `calc((100% - 3rem) * ${draw.h / 100})` }} />}
                        </div>}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              {tiny.length > 0 && (
                <p role="alert" className="text-xs text-amber-300 rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-2 max-w-md">
                  Some text will be very small on a tile ({tiny.length} {tiny.length === 1 ? 'element is' : 'elements are'} under 9 px at tile size). Make it bigger or leave it out.
                </p>
              )}
              {sizes && <div className="flex flex-wrap items-end justify-center gap-6">
                {([['Tile', 120, true], ['Edition page', 240, false], ['Large', 360, false]] as const).map(([label, w, compact]) => (
                  <figure key={label} className="text-center">
                    <div style={{ width: Math.min(w, fitW + 40) }}><FlipCard bare compact={compact} back={{ ...back, style: preview ?? live }}>{null}</FlipCard></div>
                    <figcaption className="text-[11px] text-gray-500 mt-1">{label}</figcaption>
                  </figure>
                ))}
              </div>}
            </div>

            {/* Folded to an icon strip (xl and up only): a click unfolds the column with that panel open. */}
            <div className="relative min-h-0 h-[75vh] xl:h-auto">
              <ColumnResizer width={column.width} onChange={column.setWidth} />
              {column.railed && (
                <div className="hidden xl:flex h-full flex-col items-center gap-1 rounded-xl border border-gray-800 bg-gray-900/80 py-1">
                  <button type="button" onClick={() => column.setRailed(false)} aria-label="Expand the side panels" title="Expand" className="w-8 h-7 flex items-center justify-center text-gray-500 hover:text-white">
                    <Icon name="chevronLeft" className="w-3 h-3" />
                  </button>
                  {panels.map(p => (
                    <button key={p.id} type="button" onClick={() => column.reveal(p.id)} aria-label={`Open ${p.title}`} title={p.title} className="w-8 h-8 flex items-center justify-center rounded-md text-gray-400 hover:bg-white/5 hover:text-white">
                      <Icon name={p.icon} />
                    </button>
                  ))}
                </div>
              )}
              <div className={`h-full ${column.railed ? 'xl:hidden' : ''}`}>
                <PanelStack panels={panels} collapsed={column.collapsed} onToggle={column.toggle} onRail={() => column.setRailed(true)} />
              </div>
            </div>
          </div>

          <StatusBar>
            <StatusItem title="The canvas scale against the print page's card (Ctrl+0 fits, Ctrl+1 is 100%)">Zoom {Math.round((canvasW / PRINT_W) * 100)}%</StatusItem>
            <span ref={readout} title="Pointer over the card: % of the card, and pt as if on a 2.5 in card" className="tabular-nums whitespace-pre">X -  Y -</span>
            <span role="status" className={dirty ? 'text-yellow-400' : ''}>{note || (dirty ? 'Unsaved changes' : 'Saved')}</span>
          </StatusBar>
        </div>
      )}
    </div>
  );
}
