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
export const TEXT_ALIGNS = ['left', 'center', 'right'] as const;
/** Auto-fit: `shrink` = the largest size (up to the set size) at which the text fits its box; `width` = one line spanning the box. */
export const FIT_MODES = ['shrink', 'width'] as const;
export type FitMode = (typeof FIT_MODES)[number];

export interface Effects {
  outline?: { color: string; width: number };
  glow?: { color: string; blur: number; strength: number };
  shadow?: { color: string; x: number; y: number; blur: number };
  /** Today's pressed-into-metal look (light and dark edges). */
  engrave?: boolean;
  gradientText?: { from: string; to: string; angle: number };
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
}

export const DEFAULT_MIN_SIZE = 3;

export function sanitizeFx(v: unknown): Effects {
  const o = isRec(v) ? v : {};
  const fx: Effects = {};
  if (isRec(o.outline)) fx.outline = { color: hex(o.outline.color, '#000000'), width: r2(clamp(o.outline.width, 0, 10, 1)) };
  if (isRec(o.glow)) fx.glow = { color: hex(o.glow.color, '#ffffff'), blur: r2(clamp(o.glow.blur, 0, 40, 8)), strength: r2(clamp(o.glow.strength, 0, 3, 1)) };
  if (isRec(o.shadow)) fx.shadow = { color: hex(o.shadow.color, '#000000'), x: r2(clamp(o.shadow.x, -20, 20, 0)), y: r2(clamp(o.shadow.y, -20, 20, 2)), blur: r2(clamp(o.shadow.blur, 0, 30, 4)) };
  if (o.engrave === true) fx.engrave = true;
  if (isRec(o.gradientText)) fx.gradientText = { from: hex(o.gradientText.from, '#fde68a'), to: hex(o.gradientText.to, '#f59e0b'), angle: Math.round(((clamp(o.gradientText.angle, -100000, 100000, 180) % 360) + 360) % 360) };
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
  };
}

// ── Sizes in points ──────────────────────────────────────

/** A standard card is 2.5 in (180 pt) wide, and a size is a share of the card width, so 1 % = 1.8 pt. */
export const PT_PER_PCT = 1.8;
export const pctToPt = (pct: number) => Math.round(pct * PT_PER_PCT * 10) / 10;
export const ptToPct = (pt: number) => r2(pt / PT_PER_PCT);
export const SIZE_PRESETS = [['Tiny', 6], ['Small', 8], ['Body', 10], ['Large', 14], ['Title', 20], ['Huge', 32]] as const;
