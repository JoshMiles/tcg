import { effectParts } from './card-back-layout';
import { WEIGHTS, TEXT_CASES, clamp, hex, isRec, pick, r2, sanitizeFx, type Effects } from './text-style';

// The overlay's text style (ROADMAP 38.8): a PARTIAL TextStyle per text layer. Only fields the admin set are stored, so an empty
// patch is today's look and a pack can override one field (merge is field by field). Font, size and colour stay in their own keys.
// Pure and client-safe. public/widget.js has a port of `textPatchCss` (TEXT-STYLE block); scripts/check-overlay.mts runs both.

export const TEXT_PATCH_ALIGNS = ['left', 'center', 'right'] as const;
/** `none` switches a case set further out (global) back off. */
export const PATCH_CASES = ['none', ...TEXT_CASES] as const;

export interface TextPatch {
  weight?: number; italic?: boolean; underline?: boolean; strike?: boolean; overline?: boolean;
  textCase?: (typeof PATCH_CASES)[number];
  /** Thousandths of an em. */
  tracking?: number; wordSpacing?: number; lineHeight?: number;
  align?: (typeof TEXT_PATCH_ALIGNS)[number];
  opacity?: number;
  /** `false` = no kerning. */
  kerning?: boolean;
  /** Each effect may carry only some of its fields (a pack can set just the outline colour); `shadows` and `gradientText` are whole. */
  fx?: Record<string, unknown>;
}

const bool = (v: unknown) => (typeof v === 'boolean' ? v : undefined);
const num = (v: unknown, lo: number, hi: number, round: (n: number) => number) => (v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v)) ? round(clamp(v, lo, hi, 0)) : undefined);
const colorOf = (v: unknown) => (typeof v === 'string' ? hex(v, '') : '');

/** Keeps the fields of an effect that are set and valid. */
function partFx(kind: 'stroke' | 'glow' | 'bevel', o: unknown): Record<string, unknown> | undefined {
  if (!isRec(o)) return undefined;
  const out: Record<string, unknown> = {};
  if (kind === 'stroke') {
    if (colorOf(o.color)) out.color = colorOf(o.color);
    const w = num(o.width, 0, 10, r2); if (w !== undefined) out.width = w;
    if (o.pos === 'center' || o.pos === 'outside') out.pos = o.pos;
  } else if (kind === 'glow') {
    if (colorOf(o.color)) out.color = colorOf(o.color);
    const b = num(o.blur, 0, 40, r2); if (b !== undefined) out.blur = b;
    const s = num(o.strength, 0, 3, r2); if (s !== undefined) out.strength = s;
  } else {
    if (o.style === 'raised' || o.style === 'pressed') out.style = o.style;
    const d = num(o.depth, 0.5, 3, r2); if (d !== undefined) out.depth = d;
  }
  if (typeof o.on === 'boolean') out.on = o.on;
  return Object.keys(out).length ? out : undefined;
}

/** A valid patch from anything: unknown and invalid fields are dropped, nothing is filled in. Fields that need a box (size, height, arc, plate, inner shadow, ...) are not part of it. */
export function sanitizeTextPatch(raw: unknown): TextPatch {
  const o = isRec(raw) ? raw : {};
  const out: TextPatch = {};
  const w = pick(o.weight, WEIGHTS, 0 as unknown as (typeof WEIGHTS)[number]); if (w) out.weight = w;
  for (const k of ['italic', 'underline', 'strike', 'overline', 'kerning'] as const) { const b = bool(o[k]); if (b !== undefined) out[k] = b; }
  const c = pick(o.textCase, PATCH_CASES, undefined as unknown as (typeof PATCH_CASES)[number]); if (c) out.textCase = c;
  const t = num(o.tracking, -100, 800, Math.round); if (t !== undefined) out.tracking = t;
  const ws = num(o.wordSpacing, -100, 800, Math.round); if (ws !== undefined) out.wordSpacing = ws;
  const lh = num(o.lineHeight, 0.8, 2.5, r2); if (lh !== undefined) out.lineHeight = lh;
  const a = pick(o.align, TEXT_PATCH_ALIGNS, undefined as unknown as (typeof TEXT_PATCH_ALIGNS)[number]); if (a) out.align = a;
  const op = num(o.opacity, 0, 1, r2); if (op !== undefined) out.opacity = op;
  if (isRec(o.fx)) {
    const fx: Record<string, unknown> = {};
    for (const k of ['stroke', 'glow', 'bevel'] as const) { const p = partFx(k, o.fx[k]); if (p) fx[k] = p; }
    const whole = sanitizeFx({ shadows: o.fx.shadows, gradientText: o.fx.gradientText });
    if (whole.shadows) fx.shadows = whole.shadows;
    if (whole.gradientText) fx.gradientText = whole.gradientText;
    if (Object.keys(fx).length) out.fx = fx;
  }
  return out;
}

/** `over` on top of `base`, field by field; inside `fx`, effect by effect and (for stroke, glow and bevel) field by field. */
export function mergeTextPatch(base: TextPatch | undefined, over: TextPatch | undefined): TextPatch {
  if (!over) return { ...(base ?? {}) };
  if (!base) return { ...over };
  const out: TextPatch = { ...base, ...over };
  if (base.fx || over.fx) {
    const fx: Record<string, unknown> = { ...(base.fx ?? {}) };
    for (const [k, v] of Object.entries(over.fx ?? {})) fx[k] = isRec(v) && isRec(fx[k]) && k !== 'gradientText' ? { ...(fx[k] as object), ...v } : v;
    out.fx = fx;
  }
  return out;
}

/** The size of the "card" the effects are scaled against, per px of font size: a 14 px label has the reference 400, so stroke 3 is about 1.2 px and a shadow value about 1 px. */
export const OVERLAY_FX_PER_PX = 400 / 14;

/**
 * The inline CSS a patch becomes for an element whose font size is `fontPx`, as a map of CSS property (camelCase) to value. `rgb` is the element's
 * text colour when `opacity` is set (the fade goes through the colour alpha; the element's own opacity and filter are never touched).
 * An empty patch gives {}.
 */
export function textPatchCss(p: TextPatch, fontPx: number, rgb?: [number, number, number]): Record<string, string> {
  const css: Record<string, string> = {};
  if (p.weight) css.fontWeight = String(p.weight);
  if (p.italic !== undefined) css.fontStyle = p.italic ? 'italic' : 'normal';
  if (p.underline !== undefined || p.strike !== undefined || p.overline !== undefined) {
    const d = [p.underline && 'underline', p.overline && 'overline', p.strike && 'line-through'].filter(Boolean).join(' ');
    css.textDecoration = d || 'none';
  }
  if (p.textCase) {
    css.textTransform = p.textCase === 'upper' ? 'uppercase' : p.textCase === 'lower' ? 'lowercase' : p.textCase === 'title' ? 'capitalize' : 'none';
    if (p.textCase === 'smallcaps') css.fontVariantCaps = 'small-caps';
  }
  if (p.tracking !== undefined) css.letterSpacing = `${p.tracking / 1000}em`;
  if (p.wordSpacing !== undefined) css.wordSpacing = `${p.wordSpacing / 1000}em`;
  if (p.lineHeight !== undefined) css.lineHeight = String(p.lineHeight);
  if (p.align) css.textAlign = p.align;
  if (p.kerning !== undefined) css.fontKerning = p.kerning ? 'auto' : 'none';
  if (p.opacity !== undefined && p.opacity < 1 && rgb) css.color = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${p.opacity})`;
  if (p.fx) {
    // A partial effect is filled with the model's defaults, then the card back's own CSS builder does the rest.
    const fx: Effects = sanitizeFx({ stroke: p.fx.stroke, glow: p.fx.glow, bevel: p.fx.bevel, shadows: p.fx.shadows, gradientText: p.fx.gradientText });
    const parts = effectParts(fx, fontPx * OVERLAY_FX_PER_PX).css;
    // A filter would sit on the element itself, which reveals animate: gradient text therefore takes no shadow, glow or bevel here.
    delete parts.filter;
    for (const [k, v] of Object.entries(parts)) css[k] = String(v);
  }
  return css;
}
