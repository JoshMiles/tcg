// The card back editor's pure operations (ROADMAP 20.3b): changing, adding, ordering, aligning and snapping elements of a v2 design.
// Client-safe and free of React so a script can test them. Boxes are in PERCENT of the card (left / top / width / height of what is drawn).
import {
  DEFAULT_CARD_BACK, MAX_ELEMENTS, MAX_TEXT_BOXES, MULTI_KINDS, PRESETS, sanitizeCardBack,
  type BackEl, type CardBackStyle, type ElementKind,
} from './card-back';
import type { ShapeType } from './shapes';

export interface Box { l: number; t: number; w: number; h: number }
const r2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** A design with `fn` applied to the elements whose ids are in `ids`; always passes through the sanitiser so it stays valid. */
export function patchElements(style: CardBackStyle, ids: Iterable<string>, patch: Partial<BackEl> | ((e: BackEl) => Partial<BackEl>)): CardBackStyle {
  const set = new Set(ids);
  return sanitizeCardBack({ ...style, elements: style.elements.map(e => (set.has(e.id) ? { ...e, ...(typeof patch === 'function' ? patch(e) : patch) } : e)) });
}

/** The design with `patch` applied to its background fields (background, colours, pattern, pattern settings, edge, stack position). */
export function patchBackground(style: CardBackStyle, patch: Partial<Omit<CardBackStyle, 'elements' | 'v'>>): CardBackStyle {
  return sanitizeCardBack({ ...style, ...patch });
}

const nextId = (style: CardBackStyle, base: string) => { let i = 1; while (style.elements.some(e => e.id === `${base}-${i}`)) i++; return `${base}-${i}`; };

/** Adds a text box (free, centred) on top; null when the limits are reached. */
export function addText(style: CardBackStyle, text = 'New text'): { style: CardBackStyle; id: string } | null {
  if (style.elements.length >= MAX_ELEMENTS || style.elements.filter(e => e.kind === 'text').length >= MAX_TEXT_BOXES) return null;
  const id = nextId(style, 'text');
  const top = Math.max(0, ...style.elements.filter(e => e.place === 'free').map(e => e.z));
  const el: Partial<BackEl> & { id: string; kind: ElementKind } = { id, kind: 'text', place: 'free', x: 50, y: 50, w: 70, size: 8, weight: 700, font: 'display', text, z: Math.min(50, top + 1) };
  return { style: sanitizeCardBack({ ...style, elements: [...style.elements, el] }), id };
}

/** Adds a shape (filled yellow) or an empty image box, free and on top, in `box` (percent: centre x / y, width, height); null at the limit. */
export function addMedia(style: CardBackStyle, kind: 'shape' | 'image', box: { x: number; y: number; w: number; h: number }, shape?: ShapeType): { style: CardBackStyle; id: string } | null {
  if (style.elements.length >= MAX_ELEMENTS) return null;
  const id = nextId(style, kind);
  const top = Math.max(0, ...style.elements.filter(e => e.place === 'free').map(e => e.z));
  const el = { id, kind, place: 'free', x: box.x, y: box.y, w: box.w, h: box.h, z: Math.min(50, top + 1), ...(kind === 'shape' ? { shape: { shape: shape ?? 'rect', fill: { type: 'solid', color: '#facc15' } } } : {}) };
  return { style: sanitizeCardBack({ ...style, elements: [...style.elements, el] }), id };
}

/** Duplicates a text box, shape or image just above itself, nudged so the copy is visible; null for other kinds or at the limits. */
export function duplicateElement(style: CardBackStyle, id: string): { style: CardBackStyle; id: string } | null {
  const src = style.elements.find(e => e.id === id);
  if (!src || !MULTI_KINDS.includes(src.kind) || style.elements.length >= MAX_ELEMENTS || (src.kind === 'text' && style.elements.filter(e => e.kind === 'text').length >= MAX_TEXT_BOXES)) return null;
  const copy = { ...src, id: nextId(style, src.kind), x: clamp(src.x + 3, 0, 100), y: clamp(src.y + 3, 0, 100), z: Math.min(50, src.z + 1), locked: false };
  const i = style.elements.indexOf(src);
  return { style: sanitizeCardBack({ ...style, elements: [...style.elements.slice(0, i + 1), copy, ...style.elements.slice(i + 1)] }), id: copy.id };
}

/** Removes a text box, shape or image (the other kinds can only be hidden). */
export function removeElement(style: CardBackStyle, id: string): CardBackStyle {
  return sanitizeCardBack({ ...style, elements: style.elements.filter(e => !(e.id === id && MULTI_KINDS.includes(e.kind))) });
}

/** Moves the element `from` to the place of `to` in the list (layers order, and the stack order for stack elements). */
export function moveElement(style: CardBackStyle, from: string, to: string): CardBackStyle {
  const a = style.elements.findIndex(e => e.id === from), b = style.elements.findIndex(e => e.id === to);
  if (a < 0 || b < 0 || a === b) return style;
  const els = [...style.elements];
  const [m] = els.splice(a, 1);
  els.splice(b, 0, m);
  return sanitizeCardBack({ ...style, elements: els });
}

/** One step up (`-1`) or down (`1`) in the layers list. */
export function stepElement(style: CardBackStyle, id: string, dir: -1 | 1): CardBackStyle {
  const i = style.elements.findIndex(e => e.id === id), j = i + dir;
  return i < 0 || j < 0 || j >= style.elements.length ? style : moveElement(style, id, style.elements[j].id);
}

// Type an element takes when it leaves the stack, so it looks as it did (the stack's own CSS sizes and weights).
const LOOK: Partial<Record<ElementKind, Partial<BackEl>>> = {
  brand: { weight: 800, uppercase: true, letterSpacing: 2.8 },
  number: { weight: 800, lineHeight: 1 },
  edition: { weight: 400 },
  name: { weight: 800 },
  date: { weight: 800, letterSpacing: 1.6 },
  origin: { weight: 400 },
  text: { weight: 400, italic: true },
};

/** Takes an element out of the stack and places it where it was drawn (`box` in percent, `fontPx` its font size, `cardW` the card width in px). */
export function makeFree(style: CardBackStyle, id: string, box: Box, fontPx: number, cardW: number): CardBackStyle {
  return patchElements(style, [id], e => ({
    place: 'free', x: r2(box.l + box.w / 2), y: r2(box.t + box.h / 2), w: r2(clamp(box.w + (e.kind === 'qr' || e.kind === 'logo' ? 0 : 4), 10, 100)),
    size: r2(clamp((fontPx / cardW) * 100, 2, 30)), font: e.kind === 'number' ? e.font : e.font === 'body' ? 'body' : e.font,
    ...(LOOK[e.kind] ?? {}), z: 0,
  }));
}

/** Puts a free element back in the stack (at its place in the list). */
export const returnToStack = (style: CardBackStyle, id: string) => patchElements(style, [id], { place: 'stack' });

/** An element back to what the default design (or, for a text box, a fresh one) has. */
export function resetElement(style: CardBackStyle, id: string): CardBackStyle {
  const base = DEFAULT_CARD_BACK.elements.find(e => e.kind === style.elements.find(x => x.id === id)?.kind);
  return base ? patchElements(style, [id], () => ({ ...base, id })) : patchElements(style, [id], { place: 'free', x: 50, y: 50, w: 70, size: 8, rotate: 0, weight: 700, font: 'display', italic: false, underline: false, uppercase: false, letterSpacing: 0, lineHeight: 1.25, align: 'center', color: 'auto', opacity: 1, fx: {} });
}

// ── Align and distribute (free elements; `boxes` are their measured boxes, in percent) ──

export type AlignMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

export function alignElements(style: CardBackStyle, ids: string[], mode: AlignMode, boxes: Record<string, Box>): CardBackStyle {
  const free = ids.filter(id => style.elements.find(e => e.id === id)?.place === 'free' && boxes[id]);
  if (free.length < 2) return style;
  const bs = free.map(id => boxes[id]);
  const left = Math.min(...bs.map(b => b.l)), right = Math.max(...bs.map(b => b.l + b.w)), top = Math.min(...bs.map(b => b.t)), bottom = Math.max(...bs.map(b => b.t + b.h));
  return patchElements(style, free, e => {
    const b = boxes[e.id];
    switch (mode) {
      case 'left': return { x: r2(left + b.w / 2) };
      case 'right': return { x: r2(right - b.w / 2) };
      case 'center': return { x: r2((left + right) / 2) };
      case 'top': return { y: r2(top + b.h / 2) };
      case 'bottom': return { y: r2(bottom - b.h / 2) };
      case 'middle': return { y: r2((top + bottom) / 2) };
    }
  });
}

/** Spaces three or more free elements evenly between the outermost two, by their centres. */
export function distributeElements(style: CardBackStyle, ids: string[], axis: 'x' | 'y', boxes: Record<string, Box>): CardBackStyle {
  const free = ids.filter(id => style.elements.find(e => e.id === id)?.place === 'free' && boxes[id]);
  if (free.length < 3) return style;
  const c = (id: string) => (axis === 'x' ? boxes[id].l + boxes[id].w / 2 : boxes[id].t + boxes[id].h / 2);
  const sorted = [...free].sort((a, b) => c(a) - c(b));
  const first = c(sorted[0]), last = c(sorted[sorted.length - 1]);
  const at = new Map(sorted.map((id, i) => [id, first + ((last - first) * i) / (sorted.length - 1)]));
  return patchElements(style, free, e => (axis === 'x' ? { x: r2(at.get(e.id)!) } : { y: r2(at.get(e.id)!) }));
}

// ── Snapping ─────────────────────────────────────────────

export const GRID = 2;
export const SNAP_THRESHOLD = 1.2;

/**
 * Snaps a dragged box along one axis. `edges` are the box's [start, centre, end] in percent; `targets` the lines to snap to (the card's
 * edges and centre, other elements' edges and centres). The 2 % grid applies to the centre. Returns how far to shift and the guide line.
 */
export function snapAxis(edges: [number, number, number], targets: number[], opts: { grid?: boolean; threshold?: number } = {}): { delta: number; guide: number | null } {
  const thr = opts.threshold ?? SNAP_THRESHOLD;
  let best: { delta: number; guide: number | null } = { delta: 0, guide: null };
  let bestDist = thr;
  for (const e of edges) for (const t of targets) { const d = t - e; if (Math.abs(d) < bestDist) { bestDist = Math.abs(d); best = { delta: d, guide: t }; } }
  if (best.guide === null && opts.grid !== false) {
    const g = Math.round(edges[1] / GRID) * GRID - edges[1];
    if (Math.abs(g) < thr) best = { delta: g, guide: null };
  }
  return best;
}

/** The snap lines of the card itself and of the other boxes, per axis. */
export function snapTargets(others: Box[]): { x: number[]; y: number[] } {
  const x = [0, 50, 100], y = [0, 50, 100];
  for (const b of others) { x.push(b.l, b.l + b.w / 2, b.l + b.w); y.push(b.t, b.t + b.h / 2, b.t + b.h); }
  return { x, y };
}

// ── Presets (v2 layouts) and warnings ────────────────────

const freeText = (id: string, over: Partial<BackEl>): Partial<BackEl> & { id: string; kind: ElementKind } => ({ id, kind: 'text', place: 'free', ...over });

/** The presets of the editor: the 20.1 four (as stack layouts) and two that place elements freely. */
export const EDITOR_PRESETS: { id: string; label: string; style: CardBackStyle }[] = [
  ...PRESETS,
  {
    id: 'poster', label: 'Poster',
    style: sanitizeCardBack({ v: 2, background: 'solid', bg1: '#14121f', pattern: 'rays', patternColor: '#fbbf24', patternOpacity: 0.12, edge: 'rarity', align: 'middle', elements: [
      { id: 'number', kind: 'number', place: 'free', x: 50, y: 50, w: 90, size: 20, font: 'bebas', weight: 400, color: '#fde68a', fx: { glow: { color: '#f59e0b', blur: 14, strength: 1 } } },
      freeText('text-1', { x: 50, y: 22, w: 84, size: 9, font: 'bangers', weight: 400, text: '{card}', color: 'rarity', rotate: -4, fx: { stroke: { color: '#000000', width: 3, pos: 'outside' } } }),
      { id: 'edition', kind: 'edition', place: 'free', x: 50, y: 66, w: 80, size: 5, font: 'orbitron', weight: 700, uppercase: true, letterSpacing: 2, color: '#f9fafb' },
      { id: 'brand', kind: 'brand', place: 'free', x: 50, y: 92, w: 80, size: 3.4, font: 'body', weight: 800, uppercase: true, letterSpacing: 4, color: '#fde68a' },
      { id: 'qr', kind: 'qr', place: 'free', x: 86, y: 86, w: 14, dark: '#14121f', light: '#fde68a' },
      { id: 'date', kind: 'date', show: false }, { id: 'name', kind: 'name', show: false }, { id: 'origin', kind: 'origin', show: false }, { id: 'history', kind: 'history', show: false }, { id: 'link', kind: 'link' },
    ] }),
  },
  {
    id: 'minimal', label: 'Minimal',
    style: sanitizeCardBack({ v: 2, background: 'solid', bg1: '#f4f1ea', pattern: 'grain', patternOpacity: 0.5, edge: 'rarity', align: 'middle', elements: [
      { id: 'number', kind: 'number', place: 'free', x: 50, y: 46, w: 90, size: 14, font: 'playfair', weight: 700, color: '#1c1c24' },
      freeText('text-1', { x: 50, y: 58, w: 80, size: 4.4, font: 'playfair', weight: 400, italic: true, text: '{card}, edition {edition}', color: '#1c1c24' }),
      freeText('text-2', { x: 50, y: 92, w: 80, size: 3.4, font: 'spacemono', weight: 400, text: '{pack}  /  {season}', color: '#6b6b76', letterSpacing: 2 }),
      { id: 'qr', kind: 'qr', place: 'free', x: 50, y: 78, w: 16 },
      { id: 'brand', kind: 'brand', show: false }, { id: 'edition', kind: 'edition', show: false }, { id: 'name', kind: 'name', show: false }, { id: 'date', kind: 'date', show: false },
      { id: 'origin', kind: 'origin', show: false }, { id: 'history', kind: 'history', show: false }, { id: 'link', kind: 'link' },
    ] }),
  },
];

/** Text that would be drawn smaller than `minPx` when the card is `tileW` px wide (the size of a tile), for the editor's warning. */
export function tinyText(style: CardBackStyle, tileW = 120, minPx = 9): string[] {
  return style.elements.filter(e => e.show && e.place === 'free' && e.kind !== 'qr' && e.kind !== 'logo' && e.kind !== 'shape' && e.kind !== 'image' && (e.size / 100) * tileW < minPx).map(e => e.id);
}
