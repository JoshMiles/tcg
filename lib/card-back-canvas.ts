// The canvas renderer's pure half (ROADMAP 20.3c): turns the layout engine's nodes into boxes a 2D canvas can draw. Share images draw a
// print's back from these, so they show the same design as the site (DOM) and the overlay. Pure and client-safe; the drawing itself is
// in app/components/ShareImage.tsx. Sizes are in px at the reference card width below and the drawing scales the context.
import type { CardBackStyle } from './card-back';
import type { BackNode, TextLine } from './card-back-layout';
import { DEFAULT_PATTERN, isCustomPattern, patternSvg } from './card-back-patterns';

/** The card size the share image lays the back out at (the drawing scales it to the card's rectangle). */
export const CANVAS_BACK_REF = { w: 240, h: 360 } as const;

export interface TextShadow { x: number; y: number; blur: number; color: string }
export interface Gradient { angle: number; from: string; to: string; /** 3 or 4 colours (or 2 not at the ends), position in %. */ stops?: { color: string; at: number }[] }

const COLOR = String.raw`(?:#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)|[a-zA-Z]+)`;

/** "0 0 4px #fff, 1px 2px 0 rgba(0,0,0,.4)" -> the shadows, in order. */
export function parseTextShadow(css: unknown): TextShadow[] {
  if (typeof css !== 'string' || !css || css === 'none') return [];
  const out: TextShadow[] = [];
  for (const part of css.split(/,(?![^(]*\))/)) {
    const m = new RegExp(String.raw`^\s*(-?[\d.]+)(?:px)?\s+(-?[\d.]+)(?:px)?\s+(-?[\d.]+)(?:px)?\s+(${COLOR})\s*$`).exec(part);
    if (m) out.push({ x: Number(m[1]), y: Number(m[2]), blur: Number(m[3]), color: m[4] });
  }
  return out;
}

/** "1.2px #000" -> the outline. */
export function parseStroke(css: unknown): { width: number; color: string } | null {
  if (typeof css !== 'string') return null;
  const m = new RegExp(String.raw`^\s*([\d.]+)px\s+(${COLOR})\s*$`).exec(css);
  return m && Number(m[1]) > 0 ? { width: Number(m[1]), color: m[2] } : null;
}

/** "linear-gradient(90deg, #fff, #000)" -> the gradient text fill. */
export function parseGradient(css: unknown): Gradient | null {
  if (typeof css !== 'string') return null;
  const m = new RegExp(String.raw`^\s*linear-gradient\(\s*(-?[\d.]+)deg\s*,\s*(.+)\)\s*$`).exec(css);
  if (!m) return null;
  const stops = [...m[2].matchAll(new RegExp(String.raw`(${COLOR})(?:\s+([\d.]+)%)?`, 'g'))].map(x => ({ color: x[1], at: x[2] === undefined ? NaN : Number(x[2]) }));
  if (stops.length < 2 || stops.length > 4) return null;
  stops.forEach((x, i) => { if (Number.isNaN(x.at)) x.at = (i / (stops.length - 1)) * 100; });
  const plain = stops.length === 2 && stops[0].at === 0 && stops[1].at === 100;
  return { angle: Number(m[1]), from: stops[0].color, to: stops[stops.length - 1].color, ...(plain ? {} : { stops }) };
}

/** One thing to draw. Text is drawn centred (stack) or aligned inside its box (free). */
export interface BackBox {
  id: string;
  kind: BackNode['kind'];
  mode: 'stack' | 'free';
  type: 'text' | 'img' | 'qr' | 'hist';
  /** Box in px at the reference size: x is the left edge, y the TOP edge (free nodes are centred on y, converted here). */
  x: number; y: number; w: number; h: number;
  rotate: number;
  text?: string;
  items?: { text: string; date: string }[];
  src?: string;
  qrUrl?: string;
  dark?: string;
  light?: string;
  font: { size: number; weight: number; italic: boolean; underline: boolean; upper: boolean; spacing: number; strike?: boolean; overline?: boolean; smallCaps?: boolean; wordSpacing?: number; kerning?: boolean; family?: string; align: 'left' | 'center' | 'right'; lineHeight: number };
  color: string;
  /** Free text broken into lines by the layout engine (wrap, max lines, box height, paragraphs, justify, auto-fit): draw these lines inside the padding, placed by `valign`. */
  lines?: TextLine[];
  pad?: number;
  valign?: 'top' | 'middle' | 'bottom';
  /** Gold-plated number (a bonus edition): drawn with the gold gradient. */
  gold?: boolean;
  opacity: number;
  shadows: TextShadow[];
  stroke: { width: number; color: string } | null;
  gradient: Gradient | null;
}

const num = (v: unknown, d = 0): number => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '')); return Number.isFinite(n) ? n : d; };

/** Stack text styles by stylesheet class: the sizes `.flip-*` use in app/globals.css, at the reference card width. */
function stackStyle(n: BackNode): { size: number; weight: number; italic?: boolean; underline?: boolean; upper?: boolean; spacingEm?: number; opacity?: number; gap?: number; lineHeight: number; ink: string } {
  const k = num(n.vars[`--k-${n.kind}`], 1);
  const c = n.cls;
  const INK = 'rgba(16,16,22,.8)';
  if (c.includes('flip-brand')) return { size: 9 * k, weight: 800, upper: true, spacingEm: 0.28, lineHeight: 1.25, ink: 'rgba(20,20,26,.7)' };
  if (c.includes('flip-serial')) return { size: (c.includes('long') ? 26 : 44) * k, weight: 800, spacingEm: c.includes('long') ? 0.02 : 0, lineHeight: 1, ink: 'rgba(30,30,38,.78)' };
  if (c.includes('flip-date')) return { size: 10 * k, weight: 800, spacingEm: 0.16, gap: 6, lineHeight: 1.25, ink: 'rgba(16,16,22,.82)' };
  if (c.includes('flip-line') && c.includes('strong')) return { size: 12 * k, weight: 800, lineHeight: 1.25, ink: INK };
  if (c.includes('flip-line') && c.includes('small')) return { size: 9.5 * k, weight: 400, opacity: 0.85, lineHeight: 1.25, ink: INK };
  if (c.includes('flip-line')) return { size: 11 * k, weight: 400, lineHeight: 1.25, ink: INK };
  if (c.includes('flip-custom')) return { size: 10, weight: 400, italic: true, lineHeight: 1.25, ink: INK };
  if (c.includes('flip-link')) return { size: 10, weight: 800, underline: true, lineHeight: 1.25, ink: 'rgba(16,16,22,.85)' };
  return { size: 10, weight: 400, lineHeight: 1.25, ink: INK };
}

/**
 * Places a design's nodes on a card of the reference size. Stack nodes are flowed down a centred column the way the plate's CSS does it
 * (padding 10% / 8%, 3px gap, the whole column centred, or pinned to the top / bottom by `--plate-justify`); free nodes sit where the
 * layout engine put them. Single lines only: a stack line that is too wide is squeezed by the drawing (maxWidth), not wrapped.
 */
export function placeBack(nodes: BackNode[], ref: { w: number; h: number } = CANVAS_BACK_REF): BackBox[] {
  const padX = ref.w * 0.08, padY = ref.h * 0.1, inner = ref.w - padX * 2;
  const boxes: BackBox[] = [];
  /** `row`: the footer row's QR code and link, placed relative to the row once the column is flowed. */
  const col: { box: BackBox; gapBefore: number; row?: BackBox[] }[] = [];
  const foot: BackNode[] = [];
  for (const n of nodes) {
    if (n.mode === 'free') { const b = freeBox(n, ref); if (b) boxes.push(b); continue; }
    if (n.kind === 'qr' || n.kind === 'link') { if (n.tag === 'qr' || n.tag === 'a') foot.push(n); continue; }
    if (n.tag === 'empty') continue;
    const s = stackStyle(n);
    const ink = n.vars['--ink'] ?? n.vars['--accent-ink'] ?? s.ink;
    const base = { id: n.id, kind: n.kind, mode: 'stack' as const, rotate: 0, x: padX, w: inner, opacity: s.opacity ?? 1, shadows: [] as TextShadow[], stroke: null, gradient: null as Gradient | null };
    const family = typeof n.css.fontFamily === 'string' ? n.css.fontFamily : n.vars['--num-font'];
    const font = (size: number, extra: Partial<BackBox['font']> = {}): BackBox['font'] => ({ size, weight: s.weight, italic: !!s.italic, underline: !!s.underline, upper: !!s.upper, spacing: (s.spacingEm ?? 0) * size, align: 'center', lineHeight: s.lineHeight, ...(family ? { family } : {}), ...extra });
    const extraFx = { shadows: parseTextShadow(n.css.textShadow), stroke: parseStroke(n.css.WebkitTextStroke), gradient: parseGradient(n.css.backgroundImage) };
    if (n.tag === 'img' && n.src) {
      const px = num(n.vars['--logo-px'], 38);
      col.push({ gapBefore: 0, box: { ...base, type: 'img', src: n.src, y: 0, w: px, x: ref.w / 2 - px / 2, h: px + 4, font: font(10), color: ink, ...extraFx } });
    } else if (n.tag === 'p' && n.text) {
      const lh = s.size * s.lineHeight;
      col.push({ gapBefore: s.gap ?? 0, box: { ...base, type: 'text', text: n.text, y: 0, h: lh + (s.gap ? 4 : 0), font: font(s.size), color: ink, gold: n.cls.includes('gold'), ...extraFx, ...(n.vars['--ink-shadow'] === 'none' ? { shadows: [] } : {}) } });
    } else if (n.tag === 'ul' && n.items?.length) {
      const size = 9 * num(n.vars['--k-history'], 1);
      col.push({ gapBefore: 4, box: { ...base, type: 'hist', items: n.items, y: 0, h: n.items.length * (size * 1.25 + 1) - 1, font: font(size, { align: 'left' }), color: ink, ...extraFx } });
    }
  }
  if (foot.length) {
    const qr = foot.find(f => f.tag === 'qr');
    const link = foot.find(f => f.tag === 'a');
    const qsize = qr ? 52 * num(qr.vars['--k-qr'], 1) : 0;
    const h = Math.max(qsize, link ? 12.5 : 0);
    const items: BackBox[] = [];
    const wTotal = qsize + (qr && link ? 10 : 0) + (link ? 62 : 0);
    let x = (ref.w - wTotal) / 2;
    const zero = { rotate: 0, opacity: 1, shadows: [] as TextShadow[], stroke: null, gradient: null as Gradient | null, mode: 'stack' as const };
    if (qr) { items.push({ ...zero, id: qr.id, kind: 'qr', type: 'qr', qrUrl: qr.qrUrl, dark: qr.dark, light: qr.light, x, y: 0, w: qsize, h: qsize, font: { size: 10, weight: 400, italic: false, underline: false, upper: false, spacing: 0, align: 'center', lineHeight: 1 }, color: '#000' }); x += qsize + 10; }
    if (link?.text) items.push({ ...zero, id: link.id, kind: 'link', type: 'text', text: link.text.replace(' ›', ''), x, y: 0, w: 62, h: 12.5, font: { size: 10, weight: 800, italic: false, underline: true, upper: false, spacing: 0, align: 'center', lineHeight: 1.25 }, color: link.vars['--accent-ink'] ?? 'rgba(16,16,22,.85)' });
    col.push({ gapBefore: 6, row: items, box: { ...zero, id: 'foot', kind: 'qr', type: 'text', x: 0, y: 0, w: ref.w, h, font: { size: 10, weight: 400, italic: false, underline: false, upper: false, spacing: 0, align: 'center', lineHeight: 1 }, color: '#000', text: '' } });
  }
  // Flow the column.
  const total = col.reduce((a, c, i) => a + c.box.h + (i ? 3 + c.gapBefore : 0), 0);
  const justify = (nodes.find(n => n.mode === 'stack')?.vars['--plate-justify'] ?? '') || 'center';
  const avail = ref.h - padY * 2;
  let y = justify === 'flex-start' ? padY : justify === 'flex-end' ? ref.h - padY - total : padY + Math.max(0, (avail - total) / 2);
  col.forEach((c, i) => {
    if (i) y += 3 + c.gapBefore;
    c.box.y = y;
    if (c.row) for (const r of c.row) boxes.push({ ...r, y: y + (c.box.h - r.h) / 2 });
    else boxes.push(c.box);
    y += c.box.h;
  });
  return boxes.sort((a, b) => (a.mode === b.mode ? 0 : a.mode === 'stack' ? -1 : 1));
}

/** A free node as a box. The layout engine centres it on `top` (translateY(-50%)). */
function freeBox(n: BackNode, ref: { w: number; h: number }): BackBox | null {
  void ref;
  const css = n.css;
  const w = num(css.width), cy = num(css.top);
  const rot = /rotate\((-?[\d.]+)deg\)/.exec(String(css.transform ?? ''));
  const size = num(css.fontSize, 10);
  const lineHeight = num(css.lineHeight, 1.25);
  const common = {
    id: n.id, kind: n.kind, mode: 'free' as const, x: num(css.left), w, rotate: rot ? Number(rot[1]) : 0, opacity: num(css.opacity, 1),
    shadows: parseTextShadow(css.textShadow), stroke: parseStroke(css.WebkitTextStroke), gradient: parseGradient(css.backgroundImage),
    color: typeof css.color === 'string' && css.color !== 'transparent' ? css.color : '#1c1c24',
  };
  const font = {
    size, weight: num(css.fontWeight, 400), italic: css.fontStyle === 'italic', underline: String(css.textDecoration ?? '').includes('underline'), upper: css.textTransform === 'uppercase',
    ...(String(css.textDecoration ?? '').includes('line-through') ? { strike: true } : {}), ...(String(css.textDecoration ?? '').includes('overline') ? { overline: true } : {}),
    ...(n.spec?.smallCaps ? { smallCaps: true } : {}), ...(css.wordSpacing ? { wordSpacing: num(String(css.wordSpacing).replace('em', '')) * size } : {}), ...(css.fontKerning === 'none' ? { kerning: false } : {}),
    spacing: num(String(css.letterSpacing ?? '0').replace('em', '')) * size, family: typeof css.fontFamily === 'string' ? css.fontFamily : undefined,
    align: (css.textAlign === 'left' || css.textAlign === 'right' ? css.textAlign : 'center') as 'left' | 'center' | 'right', lineHeight,
  };
  if (n.tag === 'img' && n.src) { const h = n.kind === 'logo' ? w : num(css.height, w); return { ...common, type: 'img', src: n.src, y: cy - h / 2, h, font }; }
  if (n.tag === 'qr' && n.qrUrl) return { ...common, type: 'qr', qrUrl: n.qrUrl, dark: n.dark, light: n.light, y: cy - w / 2, h: w, font };
  if (n.tag === 'ul' && n.items?.length) { const h = n.items.length * (size * lineHeight + 1); return { ...common, type: 'hist', items: n.items, y: cy - h / 2, h, font: { ...font, align: 'left' } }; }
  if (n.tag === 'p' && n.lines && n.spec) {
    const content = n.lines.reduce((a, l) => a + size * lineHeight + l.g, 0), pad = n.spec.pad;
    const h = num(css.height) || content + 2 * pad;
    return { ...common, type: 'text', text: n.text, y: cy - h / 2, h, lines: n.lines, pad, valign: n.spec.valign, font };
  }
  if ((n.tag === 'p' || n.tag === 'a') && n.text) return { ...common, type: 'text', text: n.text, y: cy - size * lineHeight / 2, h: size * lineHeight, font };
  return null;
}

/** Greedy word wrap with a measuring function (the canvas's measureText); a single word wider than the box is left on its own line. */
export function wrapText(text: string, maxW: number, measure: (s: string) => number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && measure(next) > maxW) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

// ── The background pattern, for the canvas ──

export type CanvasPattern =
  | { kind: 'none' }
  | { kind: 'lines' }
  | { kind: 'holes' }
  | { kind: 'cover'; src: string }
  /** `src` is a data URI of the pattern's SVG (it covers the whole card, so it is drawn stretched over the plate). */
  | { kind: 'svg'; src: string; blend: GlobalCompositeOperation };

const BLEND_OPS: Record<string, GlobalCompositeOperation> = { normal: 'source-over', overlay: 'overlay', multiply: 'multiply', screen: 'screen' };

/**
 * What to paint over the plate's metal for a design's pattern, mirroring `patternLayers` in lib/card-back-v1.ts (the DOM and the overlay
 * read the same choice as CSS): the classic brushed lines and cheese holes at their default settings, the pack cover faded, or the
 * pattern's SVG with its colour, opacity, scale and angle already drawn into it. Only the blend mode is left to the canvas.
 */
export function canvasPattern(s: Pick<CardBackStyle, 'pattern' | 'patternColor' | 'patternOpacity' | 'patternScale' | 'patternAngle' | 'patternBlend' | 'cover'>): CanvasPattern {
  if (s.pattern === 'none') return { kind: 'none' };
  if (s.pattern === 'cover') return s.cover ? { kind: 'cover', src: s.cover } : { kind: 'none' };
  const set = { ...DEFAULT_PATTERN, color: s.patternColor, opacity: s.patternOpacity, scale: s.patternScale, angle: s.patternAngle };
  if (!isCustomPattern(set)) {
    if (s.pattern === 'lines') return { kind: 'lines' };
    if (s.pattern === 'holes') return { kind: 'holes' };
  }
  const svg = patternSvg(s.pattern, set);
  return svg ? { kind: 'svg', src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, blend: BLEND_OPS[s.patternBlend] ?? 'source-over' } : { kind: 'none' };
}
