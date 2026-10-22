// The text style model (ROADMAP 38.12 a): the type and colour fields every text has, with their defaults and sanitiser. Pure and client-safe,
// and free of card back things so the overlay's text (38.8) can use the same model. lib/card-back.ts builds BackEl on top of it.

// ── Sanitising helpers ───────────────────────────────────

const HEX = /^#[0-9a-fA-F]{6}$/;
const SHORT_HEX = /^#[0-9a-fA-F]{3}$/;
export const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export const clamp = (v: unknown, lo: number, hi: number, fb: number) => { const n = typeof v === 'number' ? v : Number(v); return Number.isFinite(n) && v !== '' && v !== null ? Math.min(hi, Math.max(lo, n)) : fb; };
export const r2 = (n: number) => Math.round(n * 100) / 100;

export function hex(v: unknown, fb: string, ...allow: string[]): string {
  if (typeof v !== 'string') return fb;
  const s = v.trim();
  if (allow.includes(s)) return s;
  if (HEX.test(s)) return s.toLowerCase();
  if (SHORT_HEX.test(s)) return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toLowerCase();
  return fb;
}
export const pick = <T extends string | number>(v: unknown, all: readonly T[], fb: T): T => (all as readonly unknown[]).includes(v) ? (v as T) : fb;

// ── The model ────────────────────────────────────────────

export const WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900] as const;
export const WEIGHT_NAMES: Record<number, string> = { 100: 'Thin', 200: 'Extra Light', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black' };
export const TEXT_ALIGNS = ['left', 'center', 'right', 'justify'] as const;
export const VALIGNS = ['top', 'middle', 'bottom'] as const;
/** Auto-fit: `shrink` = the largest size (up to the set size) at which the text fits its box; `width` = one line spanning the box. */
export const FIT_MODES = ['shrink', 'width'] as const;
export type FitMode = (typeof FIT_MODES)[number];
/** Case: `upper` is today's `uppercase` flag (an old saved flag reads as `upper`); title and lower rewrite the text; small caps draw lowercase as scaled capitals. */
export const TEXT_CASES = ['upper', 'lower', 'title', 'smallcaps'] as const;
export type TextCase = (typeof TEXT_CASES)[number];
export const SCRIPTS = ['sup', 'sub'] as const;
/** Small capitals are the capital at this share of the size; superscript and subscript are the text at this share of the size. */
export const SMALLCAP_SCALE = 0.8;
export const SCRIPT_SCALE = 0.65;
/** Where a superscript or subscript sits, in em of its own (scaled) size, up positive. */
export const SCRIPT_SHIFT = { sup: 0.6, sub: -0.25 } as const;
/** The line height "auto" gives (a multiple of the size). */
export const AUTO_LEADING = 1.2;

/** A drop or inner shadow. `x`/`y` are the offset (the editor shows them as angle and distance); `opacity` is left out at 1. `on: false` keeps the settings but switches the effect off. */
export interface Shadow { color: string; x: number; y: number; blur: number; opacity?: number; on?: false }
export interface Effects {
  /** `outside` is painted under the letters (paint-order: stroke), `center` over them. */
  stroke?: { color: string; width: number; pos: 'outside' | 'center'; on?: false };
  glow?: { color: string; blur: number; strength: number; on?: false };
  /** Up to 2 drop shadows. */
  shadows?: Shadow[];
  inner?: Shadow;
  /** `pressed` is today's engrave (light below, dark above); `raised` is the other way round. */
  bevel?: { style: 'pressed' | 'raised'; depth: number; on?: false };
  /** A box behind the text: `pad` and `radius` in % of the card width, `outline.width` as the stroke's. */
  plate?: { color: string; pad: number; radius: number; outline?: { color: string; width: number }; on?: false };
  /** `from` and `to` are always the first and last colour; `stops` (2 to 4 colours, position in %) is optional, so an old two-colour gradient reads as it did. */
  gradientText?: { from: string; to: string; angle: number; stops?: { color: string; at: number }[]; on?: false };
}

export interface TextStyle {
  /** Size in % of the card width (the editor shows it in pt, see `pctToPt`). */
  size: number;
  font: string; weight: number; italic: boolean; underline: boolean; uppercase: boolean; letterSpacing: number; lineHeight: number;
  align: (typeof TEXT_ALIGNS)[number];
  /** A hex colour, `rarity` (the card's rarity colour) or `auto` (the plate's engraved ink). */
  color: string;
  opacity: number;
  fx: Effects;
  /** Absent = no auto-fit (today's render). */
  fit?: FitMode;
  /** The smallest size auto-fit may use, % of the card width. Only stored with `fit`. */
  minSize?: number;
  /** Paragraph: first-line indent and the space between paragraphs, both in em. Absent = 0. */
  indent?: number;
  paraGap?: number;
  /** Character (all optional, absent = today's render). */
  strike?: true; overline?: true;
  textCase?: TextCase;
  /** Letter spacing in thousandths of an em (-100 to 800); when present it replaces `letterSpacing`. */
  tracking?: number;
  /** Extra space at every word gap, thousandths of an em (-100 to 800). */
  wordSpacing?: number;
  /** Line height "auto": `AUTO_LEADING`, replacing `lineHeight`. */
  autoLeading?: true;
  /** Shift the baseline up (positive) or down, % of the size. For one-line tokens: it moves the whole text box. */
  baseline?: number;
  script?: (typeof SCRIPTS)[number];
  /** `false` = no kerning. */
  kerning?: false;
}

/** The case a text has: the new field, else today's uppercase flag. */
export const caseOf = (s: { textCase?: TextCase; uppercase: boolean }): TextCase | undefined => s.textCase ?? (s.uppercase ? 'upper' : undefined);
/** Letter spacing in em: `tracking` when set, else the old field (tenths of an em). */
export const spacingEm = (s: { tracking?: number; letterSpacing: number }) => (s.tracking !== undefined ? s.tracking / 1000 : s.letterSpacing / 10);
export const wordEm = (s: { wordSpacing?: number }) => (s.wordSpacing ?? 0) / 1000;
export const leadingOf = (s: { autoLeading?: true; lineHeight: number }) => (s.autoLeading ? AUTO_LEADING : s.lineHeight);

/** Title case: the first letter of every word up, the rest down. */
export const titleCase = (t: string) => t.toLowerCase().replace(/(^|[\s\-(\[])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());
/** A line split into runs for small caps: lowercase letters become capitals marked `s` (drawn at SMALLCAP_SCALE), everything else is as is. */
export function capRuns(t: string): { t: string; s: boolean }[] {
  const out: { t: string; s: boolean }[] = [];
  for (const ch of t) {
    const small = ch !== ch.toUpperCase();
    const c = small ? ch.toUpperCase() : ch;
    const last = out[out.length - 1];
    if (last && last.s === small) last.t += c; else out.push({ t: c, s: small });
  }
  return out;
}

/** The box a text sits in (not for overlay layers without a box). Every field is optional: absent = today's look (grows with its text, centred, wraps). */
export interface TextBox {
  /** Height in % of the card height. Absent = as tall as the text. */
  h?: number;
  /** Where the text sits in a box taller than it (absent = middle). */
  valign?: (typeof VALIGNS)[number];
  /** At most this many lines; the last ends with an ellipsis when the text is longer. */
  maxLines?: number;
  /** `false` = one line per paragraph, no wrapping. Absent = wraps. */
  wrap?: false;
  /** Space between the box edge and the text, in % of the card width. */
  pad?: number;
}

export const DEFAULT_MIN_SIZE = 3;

const shadowOf = (v: unknown, def: Shadow): Shadow => {
  const o = isRec(v) ? v : {};
  const op = r2(clamp(o.opacity, 0, 1, 1));
  return { color: hex(o.color, def.color), x: r2(clamp(o.x, -20, 20, def.x)), y: r2(clamp(o.y, -20, 20, def.y)), blur: r2(clamp(o.blur, 0, 30, def.blur)), ...(op < 1 ? { opacity: op } : {}), ...(o.on === false ? { on: false as const } : {}) };
};
const off = (o: Record<string, unknown>) => (o.on === false ? { on: false as const } : {});

/** Effects from anything. The old `outline`, `shadow` and `engrave` read as `stroke` (outside), the first of `shadows` and `bevel` (pressed). */
export function sanitizeFx(v: unknown): Effects {
  const o = isRec(v) ? v : {};
  const fx: Effects = {};
  const st = isRec(o.stroke) ? o.stroke : isRec(o.outline) ? { ...o.outline, pos: 'outside' } : null;
  if (st) fx.stroke = { color: hex(st.color, '#000000'), width: r2(clamp(st.width, 0, 10, 1)), pos: st.pos === 'center' ? 'center' : 'outside', ...off(st) };
  if (isRec(o.glow)) fx.glow = { color: hex(o.glow.color, '#ffffff'), blur: r2(clamp(o.glow.blur, 0, 40, 8)), strength: r2(clamp(o.glow.strength, 0, 3, 1)), ...off(o.glow) };
  const list = Array.isArray(o.shadows) ? o.shadows.filter(isRec) : isRec(o.shadow) ? [o.shadow] : [];
  if (list.length) fx.shadows = list.slice(0, 2).map(x => shadowOf(x, { color: '#000000', x: 0, y: 2, blur: 4 }));
  if (isRec(o.inner)) fx.inner = shadowOf(o.inner, { color: '#000000', x: 0, y: 2, blur: 3 });
  const bv = isRec(o.bevel) ? o.bevel : o.engrave === true ? { style: 'pressed', depth: 1 } : null;
  if (bv) fx.bevel = { style: bv.style === 'raised' ? 'raised' : 'pressed', depth: r2(clamp(bv.depth, 0.5, 3, 1)), ...off(bv) };
  if (isRec(o.plate)) {
    const p = o.plate, ol = isRec(p.outline) ? p.outline : null;
    fx.plate = { color: hex(p.color, '#000000'), pad: r2(clamp(p.pad, 0, 20, 2)), radius: r2(clamp(p.radius, 0, 50, 2)), ...(ol ? { outline: { color: hex(ol.color, '#ffffff'), width: r2(clamp(ol.width, 0, 10, 1)) } } : {}), ...off(p) };
  }
  if (isRec(o.gradientText)) {
    const g = o.gradientText;
    const stops = Array.isArray(g.stops) ? g.stops.filter(isRec).slice(0, 4).map(x => ({ color: hex(x.color, '#ffffff'), at: Math.round(clamp(x.at, 0, 100, 0)) })).sort((a, b) => a.at - b.at) : [];
    const ends = stops.length >= 2 ? { from: stops[0].color, to: stops[stops.length - 1].color } : { from: hex(g.from, '#fde68a'), to: hex(g.to, '#f59e0b') };
    fx.gradientText = { ...ends, angle: Math.round(((clamp(g.angle, -100000, 100000, 180) % 360) + 360) % 360), ...(stops.length >= 2 ? { stops } : {}), ...off(g) };
  }
  return fx;
}

/** A valid text style from anything; `fontIds` are the fonts the caller knows. Optional fields are left out unless set, so saved designs are unchanged. */
export function sanitizeTextStyle(raw: Record<string, unknown>, fontIds: readonly string[], fallbackFont = 'body'): TextStyle {
  const fit = pick(raw.fit, FIT_MODES, undefined as unknown as FitMode);
  return {
    size: r2(clamp(raw.size, 2, 30, 8)),
    font: pick(raw.font, fontIds, fallbackFont), weight: pick(raw.weight, WEIGHTS, 400), italic: raw.italic === true, underline: raw.underline === true, uppercase: raw.uppercase === true,
    letterSpacing: r2(clamp(raw.letterSpacing, -2, 20, 0)), lineHeight: r2(clamp(raw.lineHeight, 0.8, 2.5, 1.25)), align: pick(raw.align, TEXT_ALIGNS, 'center'),
    color: hex(raw.color, 'auto', 'auto', 'rarity'), opacity: r2(clamp(raw.opacity, 0, 1, 1)), fx: sanitizeFx(raw.fx),
    ...(fit ? { fit, minSize: r2(clamp(raw.minSize, 1, 30, DEFAULT_MIN_SIZE)) } : {}),
    ...(clamp(raw.indent, 0, 5, 0) > 0 ? { indent: r2(clamp(raw.indent, 0, 5, 0)) } : {}),
    ...(clamp(raw.paraGap, 0, 3, 0) > 0 ? { paraGap: r2(clamp(raw.paraGap, 0, 3, 0)) } : {}),
    ...(raw.strike === true ? { strike: true as const } : {}),
    ...(raw.overline === true ? { overline: true as const } : {}),
    ...(pick(raw.textCase, TEXT_CASES, undefined as unknown as TextCase) ? { textCase: raw.textCase as TextCase } : {}),
    ...(raw.tracking !== undefined && raw.tracking !== null && raw.tracking !== '' && Number.isFinite(Number(raw.tracking)) ? { tracking: Math.round(clamp(raw.tracking, -100, 800, 0)) } : {}),
    ...(Math.round(clamp(raw.wordSpacing, -100, 800, 0)) !== 0 ? { wordSpacing: Math.round(clamp(raw.wordSpacing, -100, 800, 0)) } : {}),
    ...(raw.autoLeading === true ? { autoLeading: true as const } : {}),
    ...(Math.round(clamp(raw.baseline, -100, 100, 0)) !== 0 ? { baseline: Math.round(clamp(raw.baseline, -100, 100, 0)) } : {}),
    ...(pick(raw.script, SCRIPTS, undefined as unknown as (typeof SCRIPTS)[number]) ? { script: raw.script as (typeof SCRIPTS)[number] } : {}),
    ...(raw.kerning === false ? { kerning: false as const } : {}),
  };
}

export function sanitizeTextBox(raw: Record<string, unknown>): TextBox {
  const valign = pick(raw.valign, VALIGNS, undefined as unknown as (typeof VALIGNS)[number]);
  const maxLines = Number(raw.maxLines) > 0 ? Math.round(clamp(raw.maxLines, 1, 20, 0)) : 0;
  return {
    ...(raw.h !== undefined && raw.h !== null && raw.h !== '' && Number.isFinite(Number(raw.h)) ? { h: r2(clamp(raw.h, 2, 100, 10)) } : {}),
    ...(valign ? { valign } : {}),
    ...(maxLines > 0 ? { maxLines } : {}),
    ...(raw.wrap === false ? { wrap: false as const } : {}),
    ...(clamp(raw.pad, 0, 15, 0) > 0 ? { pad: r2(clamp(raw.pad, 0, 15, 0)) } : {}),
  };
}

// ── Sizes in points ──────────────────────────────────────

/** A standard card is 2.5 in (180 pt) wide, and a size is a share of the card width, so 1 % = 1.8 pt. */
export const PT_PER_PCT = 1.8;
export const pctToPt = (pct: number) => Math.round(pct * PT_PER_PCT * 10) / 10;
export const ptToPct = (pt: number) => r2(pt / PT_PER_PCT);
export const SIZE_PRESETS = [['Tiny', 6], ['Small', 8], ['Body', 10], ['Large', 14], ['Title', 20], ['Huge', 32]] as const;
