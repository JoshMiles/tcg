// How the OBS overlay is laid out. Browser-safe (no KV) so the settings editor can import it.
//
// The overlay is drawn on a fixed "design stage" of width × height and then scaled to fit whatever
// size the OBS browser source really is, so nothing is cut off even if the source is a different size.
// That size is shared (it is one browser source). Where things sit on the stage is set separately for the
// pack opening and for the collection view, because they are different shapes: each has its own `scale`
// and offsets, in design-stage pixels, applied on top of that fit.

export interface Placement {
  scale: number;     // 1 = as designed; 0.9 = 10% smaller
  offsetX: number;   // design px, + = right
  offsetY: number;   // design px, + = down
}

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
  return {
    width:  Math.round(clamp(num(i.width,  DEFAULT_LAYOUT.width),  320, 3840)),
    height: Math.round(clamp(num(i.height, DEFAULT_LAYOUT.height), 240, 2160)),
    pack:       sanitizePlacement(i.pack, legacy),
    collection: sanitizePlacement(i.collection, legacy),
  };
}
