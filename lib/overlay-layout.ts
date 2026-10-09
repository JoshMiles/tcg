// How the OBS overlay is laid out. Browser-safe (no KV) so the settings editor can import it.
//
// The overlay is drawn on a fixed "design stage" of width × height and then scaled to fit whatever
// size the OBS browser source really is, so nothing is cut off even if the source is a different size.
// `scale` and the offsets are on top of that fit, in design-stage pixels.

export interface OverlayLayout {
  width: number;     // design stage, px
  height: number;
  scale: number;     // 1 = fit exactly; 0.9 = 10% smaller
  offsetX: number;   // design px, + = right
  offsetY: number;   // design px, + = down
}

export const DEFAULT_LAYOUT: OverlayLayout = { width: 1280, height: 720, scale: 1, offsetX: 0, offsetY: 0 };

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

/** Coerces anything (form data, stored JSON, query string) into a valid layout. */
export function sanitizeLayout(input: Partial<Record<keyof OverlayLayout, unknown>> | null | undefined): OverlayLayout {
  const i = input ?? {};
  return {
    width:   Math.round(clamp(num(i.width,   DEFAULT_LAYOUT.width),   320, 3840)),
    height:  Math.round(clamp(num(i.height,  DEFAULT_LAYOUT.height),  240, 2160)),
    scale:   Math.round(clamp(num(i.scale,   DEFAULT_LAYOUT.scale),   0.25, 3) * 100) / 100,
    offsetX: Math.round(clamp(num(i.offsetX, DEFAULT_LAYOUT.offsetX), -2000, 2000)),
    offsetY: Math.round(clamp(num(i.offsetY, DEFAULT_LAYOUT.offsetY), -2000, 2000)),
  };
}
