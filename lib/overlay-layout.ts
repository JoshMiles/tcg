// How the OBS overlay is laid out. Browser-safe (no KV) so the settings editor can import it.
//
// The overlay is drawn on a fixed "design stage" of width × height and then scaled to fit whatever
// size the OBS browser source really is, so nothing is cut off even if the source is a different size.
// That size is shared (it is one browser source). Where things sit on the stage is set separately for the
// pack opening and for the collection view, because they are different shapes: each has its own `scale`
// and offsets, in design-stage pixels, applied on top of that fit.

/** Movable parts of each view. They match the widget's `data-edit` tags (the collection grid is `grid`). */
export const ELEMENT_IDS = {
  pack: ['card', 'label', 'serial', 'bar', 'got', 'strip', 'showlabel'],
  collection: ['heading', 'grid'],
} as const;
export type ElementId = (typeof ELEMENT_IDS)[keyof typeof ELEMENT_IDS][number];

export interface Placement {
  scale: number;     // 1 = as designed; 0.9 = 10% smaller
  offsetX: number;   // design px, + = right
  offsetY: number;   // design px, + = down
  /** Single parts moved on their own, relative to where the part normally sits. Absent = every part at its normal spot. */
  elements?: Partial<Record<ElementId, ElementPlacement>>;
}

/** One part's spot, plus how see-through it is (0 to 1). Absent opacity = fully solid, as before. */
export type ElementPlacement = Omit<Placement, 'elements'> & { opacity?: number };

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
  return Object.keys(out).length ? { ...p, elements: out } : p;
}
