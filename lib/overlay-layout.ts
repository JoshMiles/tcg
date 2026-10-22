// How the OBS overlay is laid out. Browser-safe (no KV) so the settings editor can import it.
//
// The overlay is drawn on a fixed "design stage" of width × height and then scaled to fit whatever
// size the OBS browser source really is, so nothing is cut off even if the source is a different size.
// That size is shared (it is one browser source). Where things sit on the stage is set separately for the
// pack opening and for the collection view, because they are different shapes: each has its own `scale`
// and offsets, in design-stage pixels, applied on top of that fit.

/** Movable parts of each view. They match the widget's `data-edit` tags (the collection grid is `grid`). */
import { sanitizeCustom, type CustomLayer } from './overlay-custom';

export const ELEMENT_IDS = {
  pack: ['card', 'label', 'serial', 'bar', 'got', 'strip', 'showlabel', 'banner'],
  collection: ['heading', 'grid'],
} as const;
export type ElementId = (typeof ELEMENT_IDS)[keyof typeof ELEMENT_IDS][number];

export interface Placement {
  scale: number;     // 1 = as designed; 0.9 = 10% smaller
  offsetX: number;   // design px, + = right
  offsetY: number;   // design px, + = down
  /** Single parts moved on their own, relative to where the part normally sits. Absent = every part at its normal spot. */
  elements?: Partial<Record<ElementId, ElementPlacement>>;
  /** Layers the admin added to this view (text, image, shape), at most 16. Absent = none, today's look. */
  custom?: CustomLayer[];
}

/** One part's spot, plus how see-through it is (0 to 1). Absent opacity = fully solid, as before. */
export type ElementPlacement = Omit<Placement, 'elements' | 'custom'> & { opacity?: number };

export interface OverlayLayout {
  width: number;     // design stage = the browser source size, px
  height: number;
  pack: Placement;        // the pack opening / card reveal
  collection: Placement;  // the "show collection" view
}

export type LayoutMode = 'pack' | 'collection';

export const DEFAULT_PLACEMENT: Placement = { scale: 1, offsetX: 0, offsetY: 0 };
export const DEFAULT_LAYOUT: OverlayLayout = {
  width: 1280,
  height: 720,
  pack: { ...DEFAULT_PLACEMENT },
  collection: { ...DEFAULT_PLACEMENT },
};

export const LAYOUT_PRESETS: { label: string; width: number; height: number }[] = [
  { label: '1280 × 720', width: 1280, height: 720 },
  { label: '1920 × 1080', width: 1920, height: 1080 },
  { label: '1024 × 768', width: 1024, height: 768 },
  { label: '1600 × 900', width: 1600, height: 900 },
];

/** Portrait stages for vertical scenes (a phone-shaped OBS canvas, Shorts / TikTok style). */
export const VERTICAL_LAYOUT_PRESETS: { label: string; width: number; height: number }[] = [
  { label: '1080 × 1920', width: 1080, height: 1920 },
  { label: '720 × 1280', width: 720, height: 1280 },
  { label: '1080 × 1350', width: 1080, height: 1350 },
];

/** Taller than wide. */
export const isVertical = (l: { width: number; height: number }) => l.height > l.width;

/**
 * A starting layout for a new scene. A vertical stage gets the cards shown a little smaller than the landscape default and
 * centred in the taller frame (the admin fine-tunes with the Layout tools); landscape copies the layout it is based on.
 */
export function sceneLayout(kind: 'landscape' | 'vertical', base: OverlayLayout = DEFAULT_LAYOUT): OverlayLayout {
  if (kind === 'landscape') return sanitizeLayout(base);
  return sanitizeLayout({ width: 1080, height: 1920, pack: { scale: 1.15, offsetX: 0, offsetY: 0 }, collection: { scale: 1, offsetX: 0, offsetY: 0 } });
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const num = (v: unknown, fallback: number) => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
};

type Loose = Record<string, unknown>;

export function sanitizePlacement(input: unknown, fallback: Placement = DEFAULT_PLACEMENT): Placement {
  const i = (input && typeof input === 'object' ? input : {}) as Loose;
  return {
    scale:   Math.round(clamp(num(i.scale,   fallback.scale),   0.25, 3) * 100) / 100,
    offsetX: Math.round(clamp(num(i.offsetX, fallback.offsetX), -2000, 2000)),
    offsetY: Math.round(clamp(num(i.offsetY, fallback.offsetY), -2000, 2000)),
  };
}

/**
 * Coerces anything (stored JSON, form data, a postMessage) into a valid layout. Also upgrades the original
 * single-placement shape ({ width, height, scale, offsetX, offsetY }): both views start from that old placement,
 * so an existing setup looks exactly the same until the admin separates them.
 */
export function sanitizeLayout(input: unknown): OverlayLayout {
  const i = (input && typeof input === 'object' ? input : {}) as Loose;
  const legacy = sanitizePlacement(i); // flat scale/offsetX/offsetY from before the split (defaults if absent)
  const width = Math.round(clamp(num(i.width, DEFAULT_LAYOUT.width), 320, 3840));
  const height = Math.round(clamp(num(i.height, DEFAULT_LAYOUT.height), 240, 2160));
  return {
    width,
    height,
    pack:       withElements(sanitizePlacement(i.pack, legacy), i.pack, 'pack', width, height),
    collection: withElements(sanitizePlacement(i.collection, legacy), i.collection, 'collection', width, height),
  };
}

/** Adds the view's moved parts: unknown ids and ids of the other view are dropped, untouched (default) parts are omitted. */
function withElements(p: Placement, raw: unknown, view: LayoutMode, width: number, height: number): Placement {
  const src = ((raw && typeof raw === 'object' ? (raw as Loose).elements : null) ?? {}) as Loose;
  const out: NonNullable<Placement['elements']> = {};
  for (const id of ELEMENT_IDS[view]) {
    const e = src[id];
    if (!e || typeof e !== 'object') continue;
    const i = e as Loose;
    const opacity = Math.round(clamp(num(i.opacity, 1), 0, 1) * 100) / 100;
    const el: ElementPlacement = {
      scale:   Math.round(clamp(num(i.scale, 1), 0.25, 3) * 100) / 100,
      offsetX: Math.round(clamp(num(i.offsetX, 0), -width, width)),
      offsetY: Math.round(clamp(num(i.offsetY, 0), -height, height)),
    };
    if (opacity < 1) el.opacity = opacity;
    if (el.scale !== 1 || el.offsetX !== 0 || el.offsetY !== 0 || opacity < 1) out[id] = el;
  }
  const custom = sanitizeCustom((raw && typeof raw === 'object' ? (raw as Loose).custom : null), width, height);
  return { ...p, ...(Object.keys(out).length ? { elements: out } : {}), ...(custom.length ? { custom } : {}) };
}

/** A part's box on the stage in design px (what the preview measures). */
export interface DesignBox { x: number; y: number; w: number; h: number }
/** The gaps between two boxes for Alt-measuring: one segment per axis they are apart on (none on an axis they overlap), in design px. */
export function measureGaps(a: DesignBox, b: DesignBox): { x1: number; y1: number; x2: number; y2: number; px: number }[] {
  const out: { x1: number; y1: number; x2: number; y2: number; px: number }[] = [];
  const [ar, ab, br, bb] = [a.x + a.w, a.y + a.h, b.x + b.w, b.y + b.h];
  // The line sits mid-way across the overlap on the other axis (or mid-way between the nearest edges when there is none).
  const cross = (a0: number, a1: number, b0: number, b1: number) => (Math.max(a0, b0) + Math.min(a1, b1)) / 2;
  if (ar <= b.x || br <= a.x) {
    const [x1, x2] = ar <= b.x ? [ar, b.x] : [br, a.x];
    const y = cross(a.y, ab, b.y, bb);
    out.push({ x1, y1: y, x2, y2: y, px: Math.round(x2 - x1) });
  }
  if (ab <= b.y || bb <= a.y) {
    const [y1, y2] = ab <= b.y ? [ab, b.y] : [bb, a.y];
    const x = cross(a.x, ar, b.x, br);
    out.push({ x1: x, y1, x2: x, y2, px: Math.round(y2 - y1) });
  }
  return out;
}
export type AlignMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

/**
 * Offset changes that line parts up (the same maths as the card-back editor): a lone part aligns to the stage, several to the
 * bounding box of the selection. Box moves are divided by the view's scale (a part sits inside it), like dragging does.
 */
export function alignOffsets(boxes: Record<string, DesignBox>, mode: AlignMode, stage: { w: number; h: number }, viewScale = 1): Record<string, { dx: number; dy: number }> {
  const list = Object.values(boxes);
  const area = list.length === 1 ? { l: 0, t: 0, r: stage.w, b: stage.h } : {
    l: Math.min(...list.map(b => b.x)), t: Math.min(...list.map(b => b.y)),
    r: Math.max(...list.map(b => b.x + b.w)), b: Math.max(...list.map(b => b.y + b.h)),
  };
  const out: Record<string, { dx: number; dy: number }> = {};
  for (const [id, b] of Object.entries(boxes)) {
    const want = mode === 'left' ? area.l - b.x : mode === 'right' ? area.r - b.w - b.x : mode === 'center' ? (area.l + area.r) / 2 - b.w / 2 - b.x
      : mode === 'top' ? area.t - b.y : mode === 'bottom' ? area.b - b.h - b.y : (area.t + area.b) / 2 - b.h / 2 - b.y;
    const horizontal = mode === 'left' || mode === 'center' || mode === 'right';
    out[id] = { dx: horizontal ? want / (viewScale || 1) : 0, dy: horizontal ? 0 : want / (viewScale || 1) };
  }
  return out;
}

/** Offset changes that space part centres evenly between the two outermost ones (needs 3 or more parts). */
export function distributeOffsets(boxes: Record<string, DesignBox>, axis: 'x' | 'y', viewScale = 1): Record<string, { dx: number; dy: number }> {
  const centre = (b: DesignBox) => (axis === 'x' ? b.x + b.w / 2 : b.y + b.h / 2);
  const sorted = Object.entries(boxes).sort((a, b) => centre(a[1]) - centre(b[1]));
  const out: Record<string, { dx: number; dy: number }> = {};
  if (sorted.length < 3) return out;
  const first = centre(sorted[0][1]);
  const step = (centre(sorted[sorted.length - 1][1]) - first) / (sorted.length - 1);
  sorted.forEach(([id, b], i) => {
    const d = (first + step * i - centre(b)) / (viewScale || 1);
    out[id] = axis === 'x' ? { dx: d, dy: 0 } : { dx: 0, dy: d };
  });
  return out;
}
