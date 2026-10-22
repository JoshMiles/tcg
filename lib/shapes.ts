import { isBlobUrl } from './card-art';
import { clamp, hex, isRec, pick, r2 } from './text-style';

// Shapes and images shared by the Overlay Editor's custom layers (lib/overlay-custom.ts) and the card back's shape / image elements
// (lib/card-back.ts). Pure and client-safe, and free of both editors' models so neither imports the other.

export const SHAPES = ['rect', 'ellipse', 'line', 'polygon', 'star'] as const;
export type ShapeType = (typeof SHAPES)[number];
export const STROKE_POS = ['inside', 'center', 'outside'] as const;
export const LINE_CAPS = ['butt', 'round', 'square'] as const;
export const ARROWS = ['none', 'start', 'end', 'both'] as const;
export const IMAGE_FITS = ['contain', 'cover', 'fill'] as const;

export type ShapeFill =
  | { type: 'none' }
  | { type: 'solid'; color: string }
  | { type: 'gradient'; kind: 'linear' | 'radial'; angle: number; stops: { color: string; at: number }[] };

/** What makes a shape: its type, fill and stroke. Lengths are in the host's own units (design px for the overlay, the 240 px reference card for a back). */
export interface ShapeSpec {
  shape: ShapeType;
  /** Rect corner radius. */
  radius: number;
  /** Per corner (top left, top right, bottom right, bottom left); empty means all four follow `radius`. */
  radii: number[];
  /** Line end caps and arrowheads (a line only). */
  cap: (typeof LINE_CAPS)[number];
  arrows: (typeof ARROWS)[number];
  /** Polygon and star points. */
  sides: number;
  /** Star inner radius as a share of the outer. */
  inner: number;
  fill: ShapeFill;
  /** `pos`: where the stroke sits on the edge of the box (`inside` is the original look). */
  stroke: { color: string; width: number; dash: number; pos: (typeof STROKE_POS)[number] };
}

/** Blob files and same-site paths only. The widget re-checks with the same rule. */
export const isSafeImageUrl = (u: unknown): u is string => typeof u === 'string' && u.length <= 600 && (isBlobUrl(u) || /^\/(?!\/)[\w\-./%]*$/.test(u));

export function sanitizeFill(v: unknown): ShapeFill {
  if (!isRec(v)) return { type: 'none' };
  if (v.type === 'solid') return { type: 'solid', color: hex(v.color, '#ffffff') };
  if (v.type === 'gradient') {
    const stops = (Array.isArray(v.stops) ? v.stops.filter(isRec) : []).slice(0, 4).map(s => ({ color: hex(s.color, '#ffffff'), at: Math.round(clamp(s.at, 0, 100, 0)) })).sort((a, b) => a.at - b.at);
    return { type: 'gradient', kind: v.kind === 'radial' ? 'radial' : 'linear', angle: Math.round(clamp(v.angle, 0, 360, 180)), stops: stops.length >= 2 ? stops : [{ color: '#fde68a', at: 0 }, { color: '#f59e0b', at: 100 }] };
  }
  return { type: 'none' };
}

/** The shape fields of anything (clamped, fixed lists); the key order is the saved order. */
export function sanitizeShape(r: Record<string, unknown>): ShapeSpec {
  const st = isRec(r.stroke) ? r.stroke : {};
  return {
    shape: pick(r.shape, SHAPES, 'rect'), radius: Math.round(clamp(r.radius, 0, 1000, 0)),
    radii: Array.isArray(r.radii) && r.radii.length === 4 ? r.radii.map(v => Math.round(clamp(v, 0, 1000, 0))) : [],
    cap: pick(r.cap, LINE_CAPS, 'round'), arrows: pick(r.arrows, ARROWS, 'none'),
    sides: Math.round(clamp(r.sides, 3, 12, 5)), inner: r2(clamp(r.inner, 0.1, 0.9, 0.5)),
    fill: sanitizeFill(r.fill),
    stroke: { color: hex(st.color, '#ffffff'), width: r2(clamp(st.width, 0, 40, 0)), dash: Math.round(clamp(st.dash, 0, 40, 0)), pos: pick(st.pos, STROKE_POS, 'inside') },
  };
}

// ── Geometry, for renderers that draw a shape from data (the card back's DOM, overlay widget and share canvas) ──

/** A paint: a colour, `none`, or `grad` (the shape's gradient). */
export interface ShapePart {
  /** An SVG path (a canvas takes it as a Path2D). */
  d: string;
  fill: string;
  stroke?: { color: string; width: number; dash: number; cap: string; join?: 'round' };
}
export interface ShapeGeo {
  w: number; h: number;
  /** Gradient in fractions of the box (linear: from x1, y1 to x2, y2; radial: from the centre out to the edge). */
  grad?: { kind: 'linear' | 'radial'; x1: number; y1: number; x2: number; y2: number; stops: { color: string; at: number }[] };
  parts: ShapePart[];
}

const n2 = (v: number) => Math.round(v * 100) / 100;

/** The paths of `s` in a box of w x h px; `u` converts the spec's lengths (radius, stroke, dash) to px. Mirrors customShape in public/widget.js. */
export function shapeGeo(s: ShapeSpec, w: number, h: number, u = 1): ShapeGeo {
  const f = s.fill, sw = n2(s.stroke.width * u), dash = n2(s.stroke.dash * u), cx = w / 2, cy = h / 2;
  const fill = f.type === 'solid' ? f.color : f.type === 'gradient' ? 'grad' : 'none';
  const a = f.type === 'gradient' ? (f.angle * Math.PI) / 180 : 0, dx = Math.sin(a) / 2, dy = -Math.cos(a) / 2;
  const grad: ShapeGeo['grad'] = f.type === 'gradient' ? { kind: f.kind, x1: n2(0.5 - dx), y1: n2(0.5 - dy), x2: n2(0.5 + dx), y2: n2(0.5 + dy), stops: f.stops } : undefined;
  const parts: ShapePart[] = [];
  if (s.shape === 'line') {
    // A line is only a stroke: the box is its length; the arrowheads are filled triangles in the line's paint.
    const lc = sw ? s.stroke.color : fill === 'none' ? '#ffffff' : fill, lw = sw || n2(2 * u), e = s.cap === 'butt' ? 0 : lw / 2, hs = lw * 4;
    const a0 = s.arrows === 'start' || s.arrows === 'both', a1 = s.arrows === 'end' || s.arrows === 'both';
    parts.push({ d: `M${n2(e + (a0 ? hs : 0))} ${n2(cy)}L${n2(w - e - (a1 ? hs : 0))} ${n2(cy)}`, fill: 'none', stroke: { color: lc, width: lw, dash, cap: s.cap } });
    const head = (x: number, d: number) => parts.push({ d: `M${n2(x)} ${n2(cy)}L${n2(x + d * hs)} ${n2(cy - hs / 2)}L${n2(x + d * hs)} ${n2(cy + hs / 2)}Z`, fill: lc });
    if (a0) head(e, 1);
    if (a1) head(w - e, -1);
  } else {
    const outline = (i: number): string => {
      if (s.shape === 'ellipse') {
        const rx = Math.max(0, w / 2 - i), ry = Math.max(0, h / 2 - i);
        return `M${n2(cx - rx)} ${n2(cy)}A${n2(rx)} ${n2(ry)} 0 1 0 ${n2(cx + rx)} ${n2(cy)}A${n2(rx)} ${n2(ry)} 0 1 0 ${n2(cx - rx)} ${n2(cy)}Z`;
      }
      if (s.shape === 'polygon' || s.shape === 'star') {
        const rx = Math.max(0, w / 2 - i), ry = Math.max(0, h / 2 - i), n = s.shape === 'star' ? s.sides * 2 : s.sides, pts: string[] = [];
        for (let k = 0; k < n; k++) {
          const ang = -Math.PI / 2 + (k * 2 * Math.PI) / n, r = s.shape === 'star' && k % 2 ? s.inner : 1;
          pts.push(`${n2(cx + Math.cos(ang) * rx * r)} ${n2(cy + Math.sin(ang) * ry * r)}`);
        }
        return `M${pts.join('L')}Z`;
      }
      // A rectangle with per-corner radii (top left, top right, bottom right, bottom left); corners that would overlap shrink together.
      const rr = (s.radii.length === 4 ? s.radii : [s.radius, s.radius, s.radius, s.radius]).map(v => v * u);
      const k = Math.min(1, ...([[0, 1, w], [3, 2, w], [0, 3, h], [1, 2, h]] as const).map(p => { const t = rr[p[0]] + rr[p[1]]; return t > 0 ? p[2] / t : 1; }));
      const [ra, rb, rc, rd] = rr.map(v => Math.max(0, v * k - i));
      const x0 = i, y0 = i, x1 = i + Math.max(0, w - 2 * i), y1 = i + Math.max(0, h - 2 * i);
      return `M${n2(x0 + ra)} ${n2(y0)}H${n2(x1 - rb)}A${n2(rb)} ${n2(rb)} 0 0 1 ${n2(x1)} ${n2(y0 + rb)}V${n2(y1 - rc)}A${n2(rc)} ${n2(rc)} 0 0 1 ${n2(x1 - rc)} ${n2(y1)}H${n2(x0 + rd)}A${n2(rd)} ${n2(rd)} 0 0 1 ${n2(x0)} ${n2(y1 - rd)}V${n2(y0 + ra)}A${n2(ra)} ${n2(ra)} 0 0 1 ${n2(x0 + ra)} ${n2(y0)}Z`;
    };
    parts.push({ d: outline(0), fill });
    const pos = s.stroke.pos;
    if (sw) parts.push({ d: outline(pos === 'inside' ? sw / 2 : pos === 'outside' ? -sw / 2 : 0), fill: 'none', stroke: { color: s.stroke.color, width: sw, dash, cap: 'butt', ...(s.shape === 'polygon' || s.shape === 'star' ? { join: 'round' as const } : {}) } });
  }
  return { w: n2(w), h: n2(h), ...(grad ? { grad } : {}), parts };
}
