// The design of a print's back, per pack: the v2 model (ROADMAP 20.3a). Pure and client-safe.
//
// A design is a background (steel, one colour or a gradient, with a pattern and an edge) plus a list of ELEMENTS: the edition number, edition,
// name, date, origin and holder, history, QR code, logo, brand, the "Full history" link and up to 8 text boxes. Each element is shown or
// hidden and is placed either in the STACK (today's centred column, in list order) or FREE (a box placed in percent of the card). Stored in
// its own KV key `pack:<id>:cardback` (lib/card-back-store.ts) as `v: 2`. `sanitizeCardBack` accepts v1 (20.1) and v2 and always returns v2;
// `upgradeCardBack` turns a v1 design into elements that render exactly as the v1 design did, and `DEFAULT_CARD_BACK` is today's steel plate.
import {
  ALIGNS, BACKGROUNDS, DEFAULT_V1, LOGO_PX, PATTERNS, PRESETS_V1, SCALE, SIZES, JUSTIFY, plateBackground, plateBlend, sanitizeV1,
  type BackSize, type CardBackV1,
} from './card-back-v1';

export { ALIGNS, BACKGROUNDS, PATTERNS, SIZES, type BackSize };
import type { Blend } from './card-back-patterns';

export const ELEMENT_KINDS = ['number', 'edition', 'name', 'date', 'origin', 'history', 'qr', 'logo', 'brand', 'link', 'text'] as const;
export type ElementKind = (typeof ELEMENT_KINDS)[number];
export const KIND_LABELS: Record<ElementKind, string> = {
  number: 'Edition number', edition: 'Print line', name: 'Name line', date: 'Date', origin: 'Origin and holder', history: 'History', qr: 'QR code',
  logo: 'Logo', brand: 'Site name', link: 'Full history link', text: 'Text',
};
export const MAX_ELEMENTS = 24;
export const MAX_TEXT_BOXES = 8;
export const MAX_TEXT = 80;
export const MAX_BYTES = 16 * 1024;

/** The curated fonts (self-hosted in /public/fonts/back, OFL). `display`, `body` and `mono` are the site's own and the system monospace. */
export interface BackFont { id: string; label: string; css: string; /** Files in /public/fonts/back by weight; absent for the site's own. */ files?: Record<number, string> }
export const BACK_FONTS: BackFont[] = [
  { id: 'display', label: 'Site display', css: 'var(--font-display, inherit)' },
  { id: 'body', label: 'Site body', css: 'inherit' },
  { id: 'mono', label: 'System mono', css: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
  { id: 'fredoka', label: 'Fredoka', css: "'BackFredoka', sans-serif", files: { 400: 'fredoka-400.woff2', 700: 'fredoka-700.woff2' } },
  { id: 'nunito', label: 'Nunito', css: "'BackNunito', sans-serif", files: { 400: 'nunito-400.woff2', 700: 'nunito-700.woff2' } },
  { id: 'bebas', label: 'Bebas Neue', css: "'BackBebas', sans-serif", files: { 400: 'bebas-neue-400.woff2' } },
  { id: 'oswald', label: 'Oswald', css: "'BackOswald', sans-serif", files: { 400: 'oswald-400.woff2', 700: 'oswald-700.woff2' } },
  { id: 'orbitron', label: 'Orbitron', css: "'BackOrbitron', sans-serif", files: { 400: 'orbitron-400.woff2', 700: 'orbitron-700.woff2' } },
  { id: 'playfair', label: 'Playfair Display', css: "'BackPlayfair', serif", files: { 400: 'playfair-display-400.woff2', 700: 'playfair-display-700.woff2' } },
  { id: 'cinzel', label: 'Cinzel', css: "'BackCinzel', serif", files: { 400: 'cinzel-400.woff2', 700: 'cinzel-700.woff2' } },
  { id: 'bangers', label: 'Bangers', css: "'BackBangers', cursive", files: { 400: 'bangers-400.woff2' } },
  { id: 'pixel', label: 'Press Start 2P', css: "'BackPixel', monospace", files: { 400: 'press-start-2p-400.woff2' } },
  { id: 'spacemono', label: 'Space Mono', css: "'BackSpaceMono', monospace", files: { 400: 'space-mono-400.woff2', 700: 'space-mono-700.woff2' } },
  { id: 'zillaslab', label: 'Zilla Slab', css: "'BackZillaSlab', serif", files: { 400: 'zilla-slab-400.woff2', 700: 'zilla-slab-700.woff2' } },
  { id: 'pacifico', label: 'Pacifico', css: "'BackPacifico', cursive", files: { 400: 'pacifico-400.woff2' } },
];
export const FONT_IDS = BACK_FONTS.map(f => f.id);
export const fontCss = (id: string) => (BACK_FONTS.find(f => f.id === id) ?? BACK_FONTS[0]).css;

export const WEIGHTS = [400, 500, 600, 700, 800, 900] as const;
export const TEXT_ALIGNS = ['left', 'center', 'right'] as const;

export interface Effects {
  outline?: { color: string; width: number };
  glow?: { color: string; blur: number; strength: number };
  shadow?: { color: string; x: number; y: number; blur: number };
  /** Today's pressed-into-metal look (light and dark edges). */
  engrave?: boolean;
  gradientText?: { from: string; to: string; angle: number };
}

export interface BackEl {
  id: string;
  kind: ElementKind;
  show: boolean;
  /** `stack`: in today's centred column, in list order. `free`: a box at x, y (the centre, % of the card), w (% of the card width). */
  place: 'stack' | 'free';
  x: number; y: number; w: number; rotate: number; z: number; locked: boolean;
  /** Stack elements: 0.8 / 1 / 1.25 (S / M / L). Free text: size in % of the card width. */
  scale: number;
  size: number;
  font: string; weight: number; italic: boolean; underline: boolean; uppercase: boolean; letterSpacing: number; lineHeight: number;
  align: (typeof TEXT_ALIGNS)[number];
  /** A hex colour, `rarity` (the card's rarity colour) or `auto` (the plate's engraved ink). */
  color: string;
  opacity: number;
  fx: Effects;
  /** Text boxes: the template ({pack} {season} {card} {version} {edition} {printNumber} {holder} {date}). */
  text: string;
  /** Logo: where the image comes from, its address and its size in px (stack). */
  src: 'cover' | 'url';
  url: string;
  px: number;
  /** QR code colours (hex, or `auto`). */
  dark: string;
  light: string;
}

export interface CardBackStyle {
  v: 2;
  background: (typeof BACKGROUNDS)[number];
  bg1: string; bg2: string; angle: number;
  pattern: (typeof PATTERNS)[number];
  patternColor: string; patternOpacity: number; patternScale: number; patternAngle: number; patternBlend: Blend;
  /** `rarity` = the card's rarity colour (today); otherwise a fixed #rrggbb. */
  edge: string;
  /** Where the stack sits on the plate. */
  align: (typeof ALIGNS)[number];
  elements: BackEl[];
  /** Filled in when a back is built for a print, never stored. */
  cover?: string;
  packName?: string;
  seasonName?: string;
}

// ── Sanitising ───────────────────────────────────────────

const HEX = /^#[0-9a-fA-F]{6}$/;
const SHORT_HEX = /^#[0-9a-fA-F]{3}$/;
const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const clamp = (v: unknown, lo: number, hi: number, fb: number) => { const n = typeof v === 'number' ? v : Number(v); return Number.isFinite(n) && v !== '' && v !== null ? Math.min(hi, Math.max(lo, n)) : fb; };
const r2 = (n: number) => Math.round(n * 100) / 100;

function hex(v: unknown, fb: string, ...allow: string[]): string {
  if (typeof v !== 'string') return fb;
  const s = v.trim();
  if (allow.includes(s)) return s;
  if (HEX.test(s)) return s.toLowerCase();
  if (SHORT_HEX.test(s)) return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toLowerCase();
  return fb;
}
const pick = <T extends string | number>(v: unknown, all: readonly T[], fb: T): T => (all as readonly unknown[]).includes(v) ? (v as T) : fb;

/** Only http(s) and site-relative image addresses; anything else (javascript:, data:, quotes that could end a CSS url()) is dropped. */
export function safeUrl(v: unknown): string {
  if (typeof v !== 'string') return '';
  const s = v.trim();
  if (s.length > 500 || /[\s"'()\\<>]/.test(s)) return '';
  return /^https:\/\//i.test(s) || /^\/(?!\/)/.test(s) ? s : '';
}

const cleanText = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');

function sanitizeFx(v: unknown): Effects {
  const o = isRec(v) ? v : {};
  const fx: Effects = {};
  if (isRec(o.outline)) fx.outline = { color: hex(o.outline.color, '#000000'), width: r2(clamp(o.outline.width, 0, 10, 1)) };
  if (isRec(o.glow)) fx.glow = { color: hex(o.glow.color, '#ffffff'), blur: r2(clamp(o.glow.blur, 0, 40, 8)), strength: r2(clamp(o.glow.strength, 0, 3, 1)) };
  if (isRec(o.shadow)) fx.shadow = { color: hex(o.shadow.color, '#000000'), x: r2(clamp(o.shadow.x, -20, 20, 0)), y: r2(clamp(o.shadow.y, -20, 20, 2)), blur: r2(clamp(o.shadow.blur, 0, 30, 4)) };
  if (o.engrave === true) fx.engrave = true;
  if (isRec(o.gradientText)) fx.gradientText = { from: hex(o.gradientText.from, '#fde68a'), to: hex(o.gradientText.to, '#f59e0b'), angle: Math.round(((clamp(o.gradientText.angle, -100000, 100000, 180) % 360) + 360) % 360) };
  return fx;
}

const BASE_EL: Omit<BackEl, 'id' | 'kind'> = {
  show: true, place: 'stack', x: 50, y: 50, w: 80, rotate: 0, z: 0, locked: false, scale: 1, size: 8,
  font: 'body', weight: 400, italic: false, underline: false, uppercase: false, letterSpacing: 0, lineHeight: 1.25, align: 'center', color: 'auto', opacity: 1,
  fx: {}, text: '', src: 'cover', url: '', px: 38, dark: 'auto', light: 'auto',
};

function sanitizeEl(raw: unknown, i: number, taken: Set<string>): BackEl | null {
  if (!isRec(raw) || !ELEMENT_KINDS.includes(raw.kind as ElementKind)) return null;
  const kind = raw.kind as ElementKind;
  let id = typeof raw.id === 'string' && /^[a-z0-9_-]{1,24}$/i.test(raw.id) ? raw.id : `${kind}-${i}`;
  while (taken.has(id)) id = `${kind}-${i}-${taken.size}`;
  taken.add(id);
  const url = safeUrl(raw.url);
  const src = pick(raw.src, ['cover', 'url'] as const, 'cover');
  return {
    id, kind, show: raw.show !== false, place: raw.place === 'free' ? 'free' : 'stack',
    x: r2(clamp(raw.x, 0, 100, 50)), y: r2(clamp(raw.y, 0, 100, 50)), w: r2(clamp(raw.w, 10, 100, 80)), rotate: r2(clamp(raw.rotate, -45, 45, 0)),
    z: Math.round(clamp(raw.z, -50, 50, 0)), locked: raw.locked === true,
    scale: r2(clamp(raw.scale, 0.5, 2, 1)), size: r2(clamp(raw.size, 2, 30, 8)),
    font: pick(raw.font, FONT_IDS, 'body'), weight: pick(raw.weight, WEIGHTS, 400), italic: raw.italic === true, underline: raw.underline === true, uppercase: raw.uppercase === true,
    letterSpacing: r2(clamp(raw.letterSpacing, -2, 20, 0)), lineHeight: r2(clamp(raw.lineHeight, 0.8, 2.5, 1.25)), align: pick(raw.align, TEXT_ALIGNS, 'center'),
    color: hex(raw.color, 'auto', 'auto', 'rarity'), opacity: r2(clamp(raw.opacity, 0, 1, 1)), fx: sanitizeFx(raw.fx),
    text: kind === 'text' ? cleanText(raw.text, MAX_TEXT) : '', src: src === 'url' && !url ? 'cover' : src, url, px: Math.round(clamp(raw.px, 10, 120, 38)),
    dark: hex(raw.dark, 'auto', 'auto'), light: hex(raw.light, 'auto', 'auto'),
  };
}

function patternFields(o: Record<string, unknown>) {
  const p = sanitizeV1({ pattern: 'none', patternColor: o.patternColor, patternOpacity: o.patternOpacity, patternScale: o.patternScale, patternAngle: o.patternAngle, patternBlend: o.patternBlend });
  return { patternColor: p.patternColor, patternOpacity: p.patternOpacity, patternScale: p.patternScale, patternAngle: p.patternAngle, patternBlend: p.patternBlend };
}

function sanitizeV2(o: Record<string, unknown>): CardBackStyle {
  const d = DEFAULT_V1;
  const taken = new Set<string>();
  const seenKinds = new Set<string>();
  let texts = 0;
  const elements: BackEl[] = [];
  for (const [i, raw] of (Array.isArray(o.elements) ? o.elements : []).entries()) {
    if (elements.length >= MAX_ELEMENTS) break;
    const el = sanitizeEl(raw, i, taken);
    if (!el) continue;
    if (el.kind === 'text') { if (texts >= MAX_TEXT_BOXES) continue; texts++; } else if (seenKinds.has(el.kind)) continue; else seenKinds.add(el.kind);
    elements.push(el);
  }
  return {
    v: 2,
    background: pick(o.background, BACKGROUNDS, d.background), bg1: hex(o.bg1, d.bg1), bg2: hex(o.bg2, d.bg2), angle: Math.round(((clamp(o.angle, -100000, 100000, d.angle) % 360) + 360) % 360),
    pattern: o.pattern === undefined ? d.pattern : pick(o.pattern, PATTERNS, 'none'), ...patternFields(o), edge: hex(o.edge, 'rarity', 'rarity'), align: pick(o.align, ALIGNS, d.align), elements,
  };
}

/** Turns anything (a stored v1 or v2 value, a form post) into a valid v2 design: unknown keys, fonts and kinds dropped, every number clamped, colours hex only, at most 24 elements and 16 KB. */
export function sanitizeCardBack(input: unknown): CardBackStyle {
  const o = isRec(input) ? input : {};
  const out = o.v === 2 && Array.isArray(o.elements) ? sanitizeV2(o) : upgradeCardBack(sanitizeV1(o));
  return JSON.stringify(out).length > MAX_BYTES ? DEFAULT_CARD_BACK : out;
}

// ── v1 to v2 ─────────────────────────────────────────────

const el = (kind: ElementKind, over: Partial<BackEl> = {}): BackEl => ({ id: kind, kind, ...BASE_EL, ...over });

/**
 * A 20.1 design as v2 elements that render exactly as it did: all in the stack, in today's order (logo, site name, number, edition, name,
 * the custom line, date, origin, history, QR code, link), with the v1 switches as `show`, sizes as `scale`, the text and accent colours as
 * each element's colour (a custom text colour also turns the engraved shadow off, as it did), and the number's font.
 */
export function upgradeCardBack(v1: CardBackV1): CardBackStyle {
  const inkOf = (c: string) => (c === 'auto' ? 'auto' : c);
  const own = (kind: Exclude<keyof CardBackV1['show'], never>, over: Partial<BackEl> = {}) => el(kind, { show: v1.show[kind], scale: SCALE[v1.size[kind]], color: inkOf(v1.text), fx: engrave, ...over });
  const engrave: Effects = v1.text === 'auto' ? { engrave: true } : {};
  const accent = v1.accent !== 'auto' ? v1.accent : v1.text !== 'auto' ? v1.text : 'auto';
  const elements: BackEl[] = [];
  if (v1.logo !== 'none') elements.push(el('logo', { src: v1.logo === 'url' ? 'url' : 'cover', url: v1.logo === 'url' ? v1.logoUrl : '', px: LOGO_PX[v1.logoSize] }));
  elements.push(el('brand', { color: accent, fx: engrave }));
  elements.push(own('number', { font: v1.font }), own('edition'), own('name'));
  if (v1.line) elements.push(el('text', { id: 'text-1', text: v1.line, color: inkOf(v1.text), fx: engrave }));
  elements.push(own('date'), own('origin'), own('history'));
  elements.push(el('qr', { show: v1.show.qr, scale: SCALE[v1.size.qr] }), el('link', { color: accent, fx: engrave }));
  return { v: 2, background: v1.background, bg1: v1.bg1, bg2: v1.bg2, angle: v1.angle, pattern: v1.pattern, patternColor: v1.patternColor, patternOpacity: v1.patternOpacity, patternScale: v1.patternScale, patternAngle: v1.patternAngle, patternBlend: v1.patternBlend, edge: v1.edge, align: v1.align, elements };
}

const nearest = (n: number): BackSize => (SIZES as readonly BackSize[]).reduce((best, s) => (Math.abs(SCALE[s] - n) < Math.abs(SCALE[best] - n) ? s : best), 'M' as BackSize);

/** The 20.1 controls' view of a v2 design (what the current editor shows and edits until 20.3b replaces it). */
export function toV1(s: CardBackStyle): CardBackV1 {
  const find = (k: ElementKind) => s.elements.find(e => e.kind === k);
  const num = find('number'), brand = find('brand'), logo = find('logo'), text1 = s.elements.find(e => e.kind === 'text');
  const text = num && num.color !== 'rarity' ? num.color : 'auto';
  const accent = brand && brand.color !== 'rarity' && brand.color !== text ? brand.color : 'auto';
  const d = DEFAULT_V1;
  const show = { ...d.show }, size = { ...d.size };
  for (const k of ['number', 'edition', 'name', 'date', 'origin', 'history', 'qr'] as const) {
    const e = find(k);
    show[k] = e ? e.show : false;
    size[k] = e ? nearest(e.scale) : 'M';
  }
  const px = logo?.px ?? 38;
  const logoSize = (['S', 'M', 'L'] as BackSize[]).reduce((best, k) => (Math.abs(LOGO_PX[k] - px) < Math.abs(LOGO_PX[best] - px) ? k : best), 'M' as BackSize);
  return sanitizeV1({
    background: s.background, bg1: s.bg1, bg2: s.bg2, angle: s.angle, pattern: s.pattern, patternColor: s.patternColor, patternOpacity: s.patternOpacity, patternScale: s.patternScale, patternAngle: s.patternAngle, patternBlend: s.patternBlend, edge: s.edge, align: s.align, text, accent,
    font: num && ['display', 'body', 'mono'].includes(num.font) ? num.font : 'display',
    logo: logo && logo.show ? (logo.src === 'url' ? 'url' : 'cover') : 'none', logoUrl: logo?.url ?? '', logoSize, line: text1?.text ?? '', show, size,
  });
}

export const DEFAULT_CARD_BACK: CardBackStyle = upgradeCardBack(DEFAULT_V1);

/** True when the design is today's look (nothing worth storing). */
export function isDefaultCardBack(s: CardBackStyle): boolean {
  const { cover: _c, packName: _p, seasonName: _s, ...rest } = s;
  void _c; void _p; void _s;
  return JSON.stringify(rest) === JSON.stringify(DEFAULT_CARD_BACK);
}

export const PRESETS: { id: string; label: string; style: CardBackStyle }[] = PRESETS_V1.map(p => ({ id: p.id, label: p.label, style: upgradeCardBack(p.style) }));

/** A stored design ready for editions of `packName` in `seasonName`: the cover and the names attached so text boxes can use them. */
export function resolveCardBack(style: CardBackStyle | null | undefined, ctx: { packName: string; seasonName?: string; cover?: string }): CardBackStyle | undefined {
  if (!style) return undefined;
  return { ...style, cover: safeUrl(ctx.cover) || undefined, packName: ctx.packName, seasonName: ctx.seasonName };
}

// ── Plate-level CSS (the rest is per element, see lib/card-back-layout.ts) ──

/** The CSS custom properties a styled back sets on its plate: edge colour, background and where the stack sits. */
export function plateVars(s: CardBackStyle, rarityHex: string): Record<string, string> {
  const blend = plateBlend(s);
  return { '--edge': s.edge === 'rarity' ? rarityHex : s.edge, '--plate-bg': plateBackground(s), '--plate-justify': JUSTIFY[s.align], ...(blend ? { '--plate-blend': blend } : {}) };
}

// ── The share image's plate (a canvas drawing, so it takes values rather than CSS) ──

/** What a share image's engraved plate takes from a pack's design: its metal, ink, edge and which parts are printed. */
export interface PlateLook {
  stops?: [string, string, string, string];
  ink?: string;
  dark?: boolean;
  edge?: string;
  show: { number: boolean; edition: boolean; date: boolean; origin: boolean; qr: boolean };
}

const rgb = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const hexOf = (c: number[]) => `#${c.map(x => Math.round(x).toString(16).padStart(2, '0')).join('')}`;
const mix = (a: string, b: string, t: number) => { const x = rgb(a), y = rgb(b); return hexOf(x.map((v, i) => v + (y[i] - v) * t)); };
const luma = (h: string) => { const [r, g, b] = rgb(h); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };

export function plateLook(s: CardBackStyle | undefined | null): PlateLook | undefined {
  if (!s) return undefined;
  const v1 = toV1(s);
  const a = v1.bg1, b = v1.background === 'gradient' ? v1.bg2 : v1.bg1;
  const custom = v1.background !== 'steel';
  const dark = custom ? (luma(a) + luma(b)) / 2 < 0.5 : false;
  return {
    ...(custom ? { stops: [a, mix(a, b, 0.4), mix(a, b, 0.7), b] as [string, string, string, string], dark } : {}),
    ...(v1.text !== 'auto' ? { ink: v1.text } : {}),
    ...(v1.edge !== 'rarity' ? { edge: v1.edge } : {}),
    show: { number: v1.show.number, edition: v1.show.edition, date: v1.show.date, origin: v1.show.origin, qr: v1.show.qr },
  };
}
