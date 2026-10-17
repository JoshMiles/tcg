// The back's background patterns (ROADMAP 20.3a). Pure and client-safe: each pattern is a function from its settings to ONE small SVG covering
// the whole card (viewBox 300 x 450, stretched to the plate), so the DOM uses it as a background-image data URI and the canvas and overlay
// renderers (20.3c) draw the very same SVG. Nothing here is random: `grain` uses an SVG noise filter with a fixed seed and `confetti` a
// seeded generator, so the server and every browser agree. `none` and `cover` draw no SVG; `lines` and `holes` at their default
// settings are the classic CSS layers (see plateBackground in lib/card-back-v1.ts), so the default design is unchanged.

export const PATTERN_IDS = [
  'none', 'lines', 'holes', 'cover', 'dots', 'grid', 'diagonal', 'chevron', 'waves', 'honeycomb', 'diamonds', 'crosshatch', 'stars', 'rays',
  'circuit', 'confetti', 'cheese', 'grain',
] as const;
export type PatternId = (typeof PATTERN_IDS)[number];
export const PATTERN_LABELS: Record<PatternId, string> = {
  none: 'None', lines: 'Brushed lines', holes: 'Cheese holes', cover: 'Pack cover, faded', dots: 'Dots', grid: 'Grid', diagonal: 'Diagonal stripes', chevron: 'Chevrons',
  waves: 'Waves', honeycomb: 'Honeycomb', diamonds: 'Diamonds', crosshatch: 'Crosshatch', stars: 'Stars', rays: 'Sunburst', circuit: 'Circuit', confetti: 'Confetti',
  cheese: 'Cheese wedges', grain: 'Fine grain',
};
export const BLENDS = ['normal', 'overlay', 'multiply', 'screen'] as const;
export type Blend = (typeof BLENDS)[number];

export interface PatternSettings {
  /** A hex colour, or `auto` = today's tint for that pattern. */
  color: string;
  opacity: number;
  scale: number;
  angle: number;
  blend: Blend;
}
export const DEFAULT_PATTERN: PatternSettings = { color: 'auto', opacity: 1, scale: 1, angle: 0, blend: 'normal' };
export const MAX_TILE_BYTES = 4096;

/** True when any setting differs from the defaults (the classic `lines` and `holes` are only used while none does). */
export const isCustomPattern = (s: Partial<PatternSettings>) =>
  (s.color ?? 'auto') !== 'auto' || (s.opacity ?? 1) !== 1 || (s.scale ?? 1) !== 1 || (s.angle ?? 0) !== 0;

// "auto" tints: [colour, alpha]
const AUTO: Partial<Record<PatternId, [string, number]>> = { lines: ['#ffffff', 0.28], holes: ['#000000', 0.28], stars: ['#ffffff', 0.4], rays: ['#ffffff', 0.18], grain: ['#000000', 0.32], cheese: ['#000000', 0.2] };
const DEFAULT_AUTO: [string, number] = ['#000000', 0.18];

const n = (v: number) => String(Math.round(v * 100) / 100);

/** A tiny deterministic generator (mulberry32), so a pattern is the same everywhere. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

type Draw = (ink: string, k: number) => { cell: [number, number]; body: string; stroke?: boolean; width?: number };

// Each pattern draws one cell of `w` x `h` units (times the scale `k`); `ink` is the fill or stroke colour.
const CELLS: Partial<Record<PatternId, Draw>> = {
  lines: (c, k) => ({ cell: [3 * k, 3 * k], body: `<rect width="${n(k)}" height="${n(3 * k)}" fill="${c}"/>` }),
  holes: (c, k) => ({ cell: [28 * k, 28 * k], body: `<circle cx="${n(7 * k)}" cy="${n(7 * k)}" r="${n(5 * k)}" fill="${c}"/><circle cx="${n(21 * k)}" cy="${n(21 * k)}" r="${n(4 * k)}" fill="${c}"/>` }),
  dots: (c, k) => ({ cell: [16 * k, 16 * k], body: `<circle cx="${n(8 * k)}" cy="${n(8 * k)}" r="${n(2 * k)}" fill="${c}"/>` }),
  grid: (c, k) => ({ cell: [24 * k, 24 * k], body: `<path d="M${n(24 * k)} 0V${n(24 * k)}M0 ${n(24 * k)}H${n(24 * k)}" stroke="${c}" stroke-width="${n(k)}" fill="none"/>` }),
  diagonal: (c, k) => ({ cell: [14 * k, 14 * k], body: `<rect width="${n(14 * k)}" height="${n(5 * k)}" fill="${c}"/>`, }),
  chevron: (c, k) => ({ cell: [40 * k, 20 * k], body: `<path d="M0 ${n(14 * k)}L${n(20 * k)} ${n(4 * k)}L${n(40 * k)} ${n(14 * k)}" stroke="${c}" stroke-width="${n(3 * k)}" fill="none"/>` }),
  waves: (c, k) => ({ cell: [40 * k, 16 * k], body: `<path d="M0 ${n(8 * k)}Q${n(10 * k)} ${n(0)} ${n(20 * k)} ${n(8 * k)}T${n(40 * k)} ${n(8 * k)}" stroke="${c}" stroke-width="${n(2 * k)}" fill="none"/>` }),
  honeycomb: (c, k) => {
    const w = 34.64 * k, h = 60 * k, r = 20 * k; // hexagon of radius r, pointy top
    const hex = (cx: number, cy: number) => `M${n(cx)} ${n(cy - r)}L${n(cx + w / 2)} ${n(cy - r / 2)}V${n(cy + r / 2)}L${n(cx)} ${n(cy + r)}L${n(cx - w / 2)} ${n(cy + r / 2)}V${n(cy - r / 2)}Z`;
    return { cell: [w, h], body: `<path d="${hex(w / 2, 0)}${hex(w / 2, h)}${hex(0, h / 2)}${hex(w, h / 2)}" stroke="${c}" stroke-width="${n(1.5 * k)}" fill="none"/>` };
  },
  diamonds: (c, k) => ({ cell: [30 * k, 30 * k], body: `<path d="M${n(15 * k)} 0L${n(30 * k)} ${n(15 * k)}L${n(15 * k)} ${n(30 * k)}L0 ${n(15 * k)}Z" stroke="${c}" stroke-width="${n(1.5 * k)}" fill="none"/><path d="M${n(15 * k)} ${n(10 * k)}L${n(20 * k)} ${n(15 * k)}L${n(15 * k)} ${n(20 * k)}L${n(10 * k)} ${n(15 * k)}Z" fill="${c}"/>` }),
  crosshatch: (c, k) => ({ cell: [12 * k, 12 * k], body: `<path d="M0 0L${n(12 * k)} ${n(12 * k)}M${n(12 * k)} 0L0 ${n(12 * k)}" stroke="${c}" stroke-width="${n(k)}" fill="none"/>` }),
  stars: (c, k) => {
    const star = (cx: number, cy: number, r: number) => `<path d="${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r; return `${i ? 'L' : 'M'}${n(cx + Math.cos(a) * rr)} ${n(cy + Math.sin(a) * rr)}`; }).join('')}Z" fill="${c}"/>`;
    return { cell: [50 * k, 50 * k], body: star(12 * k, 12 * k, 6 * k) + star(37 * k, 37 * k, 4 * k) };
  },
  circuit: (c, k) => ({ cell: [60 * k, 60 * k], body: `<path d="M0 ${n(15 * k)}H${n(20 * k)}V${n(35 * k)}H${n(45 * k)}V${n(60 * k)}M${n(60 * k)} ${n(10 * k)}H${n(40 * k)}V${n(25 * k)}M${n(10 * k)} ${n(60 * k)}V${n(45 * k)}H${n(25 * k)}" stroke="${c}" stroke-width="${n(1.5 * k)}" fill="none"/><circle cx="${n(20 * k)}" cy="${n(15 * k)}" r="${n(2.5 * k)}" fill="${c}"/><circle cx="${n(45 * k)}" cy="${n(35 * k)}" r="${n(2.5 * k)}" fill="${c}"/><circle cx="${n(40 * k)}" cy="${n(25 * k)}" r="${n(2.5 * k)}" fill="${c}"/><circle cx="${n(10 * k)}" cy="${n(45 * k)}" r="${n(2.5 * k)}" fill="${c}"/>` }),
  confetti: (c, k) => {
    const rnd = seeded(20260617);
    const size = 120 * k;
    let body = '';
    for (let i = 0; i < 18; i++) {
      const x = rnd() * size, y = rnd() * size, a = Math.round(rnd() * 180), s = (2 + rnd() * 3) * k;
      body += rnd() < 0.4 ? `<circle cx="${n(x)}" cy="${n(y)}" r="${n(s / 1.6)}" fill="${c}"/>` : `<rect x="${n(x)}" y="${n(y)}" width="${n(s * 2)}" height="${n(s * 0.7)}" fill="${c}" transform="rotate(${a} ${n(x)} ${n(y)})"/>`;
    }
    return { cell: [size, size], body };
  },
  cheese: (c, k) => ({ cell: [60 * k, 60 * k], body: `<path d="M${n(4 * k)} ${n(56 * k)}L${n(52 * k)} ${n(40 * k)}L${n(52 * k)} ${n(56 * k)}Z" fill="${c}"/><circle cx="${n(30 * k)}" cy="${n(50 * k)}" r="${n(2.2 * k)}" fill="#fff" fill-opacity=".5"/><circle cx="${n(42 * k)}" cy="${n(48 * k)}" r="${n(1.6 * k)}" fill="#fff" fill-opacity=".5"/><circle cx="${n(14 * k)}" cy="${n(14 * k)}" r="${n(6 * k)}" fill="${c}"/><circle cx="${n(40 * k)}" cy="${n(12 * k)}" r="${n(4 * k)}" fill="${c}"/><circle cx="${n(24 * k)}" cy="${n(30 * k)}" r="${n(3 * k)}" fill="${c}"/>` }),
};

/**
 * The SVG for a pattern (null for `none`, `cover` and an unknown id). One SVG covers the whole card (300 x 450 units); `scale` sizes the
 * cells, `angle` turns the tiling. Always under MAX_TILE_BYTES.
 */
export function patternSvg(id: string, s: Partial<PatternSettings> = {}): string | null {
  const set = { ...DEFAULT_PATTERN, ...s };
  const [autoC, autoA] = AUTO[id as PatternId] ?? DEFAULT_AUTO;
  const ink = set.color === 'auto' ? autoC : set.color;
  const alpha = Math.round((set.color === 'auto' ? autoA : 1) * Math.max(0, Math.min(1, set.opacity)) * 1000) / 1000;
  const k = Math.max(0.5, Math.min(3, set.scale));
  const head = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 450" preserveAspectRatio="none">';
  const angle = ((Math.round(set.angle) % 360) + 360) % 360;
  if (id === 'grain') {
    const f = n(0.8 / k);
    return `${head}<filter id="g" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${f}" numOctaves="2" seed="7" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 ${n(parseInt(ink.slice(1, 3), 16) / 255)} 0 0 0 0 ${n(parseInt(ink.slice(3, 5), 16) / 255)} 0 0 0 0 ${n(parseInt(ink.slice(5, 7), 16) / 255)} 0 0 0 1.2 -0.1"/></filter><rect width="300" height="450" filter="url(#g)" opacity="${alpha}"/></svg>`;
  }
  if (id === 'rays') {
    const count = Math.max(8, Math.round(24 / k / 2) * 2);
    const R = 400, step = 360 / count;
    let wedges = '';
    for (let i = 0; i < count; i += 2) {
      const a0 = (i * step * Math.PI) / 180, a1 = ((i + 1) * step * Math.PI) / 180;
      wedges += `M150 225L${n(150 + Math.cos(a0) * R)} ${n(225 + Math.sin(a0) * R)}L${n(150 + Math.cos(a1) * R)} ${n(225 + Math.sin(a1) * R)}Z`;
    }
    return `${head}<path d="${wedges}" fill="${ink}" fill-opacity="${alpha}" transform="rotate(${angle} 150 225)"/></svg>`;
  }
  const draw = CELLS[id as PatternId];
  if (!draw) return null;
  const rot = id === 'diagonal' ? (angle + 45) % 360 : angle;
  const { cell, body } = draw(ink, k);
  return `${head}<defs><pattern id="p" patternUnits="userSpaceOnUse" width="${n(cell[0])}" height="${n(cell[1])}"${rot ? ` patternTransform="rotate(${rot} 150 225)"` : ''}>${body}</pattern></defs><rect x="-300" y="-300" width="900" height="1050" fill="url(#p)" opacity="${alpha}"/></svg>`;
}

/** The SVG as a CSS `url(...)` value (a data URI; no quotes inside, so it is safe in a style attribute). */
export const patternUrl = (svg: string) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
