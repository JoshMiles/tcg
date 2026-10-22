// The design of a print's back, per pack: the v2 model (ROADMAP 20.3a). Pure and client-safe.
//
// A design is a background (steel, one colour or a gradient, with a pattern and an edge) plus a list of ELEMENTS: the serial number, edition,
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
import { IMAGE_FITS, isSafeImageUrl, sanitizeShape, type ShapeSpec } from './shapes';
import { TEXT_ALIGNS, WEIGHTS, WEIGHT_NAMES, clamp, hex, isRec, pick, r2, sanitizeTextBox, sanitizeTextStyle, type Effects, type TextBox, type TextStyle } from './text-style';

export { TEXT_ALIGNS, WEIGHTS, WEIGHT_NAMES, type Effects };

export const ELEMENT_KINDS = ['number', 'edition', 'name', 'date', 'origin', 'history', 'qr', 'logo', 'brand', 'link', 'text', 'shape', 'image'] as const;
export type ElementKind = (typeof ELEMENT_KINDS)[number];
export const KIND_LABELS: Record<ElementKind, string> = {
  number: 'Serial number', edition: 'Edition line', name: 'Name line', date: 'Date', origin: 'Origin and holder', history: 'History', qr: 'QR code',
  logo: 'Logo', brand: 'Site name', link: 'Full history link', text: 'Text', shape: 'Shape', image: 'Image',
};
/** Kinds that can be added more than once (the others are one each). Shapes and images are always placed freely. */
export const MULTI_KINDS: readonly ElementKind[] = ['text', 'shape', 'image'];
export const MAX_ELEMENTS = 24;
export const MAX_TEXT_BOXES = 8;
export const MAX_TEXT = 80;
export const MAX_BYTES = 16 * 1024;

/**
 * The curated fonts (self-hosted in /public/fonts/back, OFL, a licence file beside each). `display`, `body` and `mono` are the site's own and
 * the system monospace. `weights` are the weights the font really has (the Weight control offers only these); a variable font is one `file`
 * covering them all, a static one lists a file per weight in `files`. `italic` means the family ships a true italic (`italicFile`, variable).
 */
export const FONT_CATEGORIES = ['Display', 'Sans', 'Serif', 'Script', 'Fantasy', 'Mono / Pixel', 'Site'] as const;
export type FontCategory = (typeof FONT_CATEGORIES)[number];
export interface BackFont {
  id: string; label: string; css: string; category: FontCategory; weights: number[];
  /** Files in /public/fonts/back by weight (a variable font repeats its one file); absent for the site's own. */
  files?: Record<number, string>;
  /** One file covers every weight (the FontFace gets a weight range). */
  variable?: true;
  italic?: true; italicFile?: string;
}
type BackFontDef = Omit<BackFont, 'files' | 'variable'> & { file?: string; files?: Record<number, string> };
const SITE_WEIGHTS = [400, 500, 600, 700, 800, 900];
const BACK_FONT_DEFS: BackFontDef[] = [
  { id: 'display', label: 'Site display', category: 'Site', css: 'var(--font-display, inherit)', weights: SITE_WEIGHTS },
  { id: 'body', label: 'Site body', category: 'Site', css: 'inherit', weights: SITE_WEIGHTS },
  { id: 'mono', label: 'System mono', category: 'Site', css: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', weights: SITE_WEIGHTS },
  { id: 'fredoka', label: 'Fredoka', category: 'Sans', css: "'BackFredoka', sans-serif", weights: [300, 400, 500, 600, 700], file: 'fredoka-var.woff2' },
  { id: 'nunito', label: 'Nunito', category: 'Sans', css: "'BackNunito', sans-serif", weights: [200, 300, 400, 500, 600, 700, 800, 900], file: 'nunito-var.woff2', italic: true, italicFile: 'nunito-var-italic.woff2' },
  { id: 'bebas', label: 'Bebas Neue', category: 'Display', css: "'BackBebas', sans-serif", weights: [400], files: { 400: 'bebas-neue-400.woff2' } },
  { id: 'oswald', label: 'Oswald', category: 'Sans', css: "'BackOswald', sans-serif", weights: [200, 300, 400, 500, 600, 700], file: 'oswald-var.woff2' },
  { id: 'orbitron', label: 'Orbitron', category: 'Display', css: "'BackOrbitron', sans-serif", weights: [400, 500, 600, 700, 800, 900], file: 'orbitron-var.woff2' },
  { id: 'playfair', label: 'Playfair Display', category: 'Serif', css: "'BackPlayfair', serif", weights: [400, 500, 600, 700, 800, 900], file: 'playfair-display-var.woff2', italic: true, italicFile: 'playfair-display-var-italic.woff2' },
  { id: 'cinzel', label: 'Cinzel', category: 'Serif', css: "'BackCinzel', serif", weights: [400, 500, 600, 700, 800, 900], file: 'cinzel-var.woff2' },
  { id: 'bangers', label: 'Bangers', category: 'Display', css: "'BackBangers', cursive", weights: [400], files: { 400: 'bangers-400.woff2' } },
  { id: 'pixel', label: 'Press Start 2P', category: 'Mono / Pixel', css: "'BackPixel', monospace", weights: [400], files: { 400: 'press-start-2p-400.woff2' } },
  { id: 'spacemono', label: 'Space Mono', category: 'Mono / Pixel', css: "'BackSpaceMono', monospace", weights: [400, 700], files: { 400: 'space-mono-400.woff2', 700: 'space-mono-700.woff2' } },
  { id: 'zillaslab', label: 'Zilla Slab', category: 'Serif', css: "'BackZillaSlab', serif", weights: [400, 500, 600, 700], files: { 400: 'zilla-slab-400.woff2', 500: 'zilla-slab-500.woff2', 600: 'zilla-slab-600.woff2', 700: 'zilla-slab-700.woff2' } },
  { id: 'pacifico', label: 'Pacifico', category: 'Script', css: "'BackPacifico', cursive", weights: [400], files: { 400: 'pacifico-400.woff2' } },
  { id: 'anton', label: 'Anton', category: 'Display', css: "'BackAnton', sans-serif", weights: [400], files: { 400: 'anton-400.woff2' } },
  { id: 'archivoblack', label: 'Archivo Black', category: 'Display', css: "'BackArchivoBlack', sans-serif", weights: [400], files: { 400: 'archivo-black-400.woff2' } },
  { id: 'lilitaone', label: 'Lilita One', category: 'Display', css: "'BackLilitaOne', cursive", weights: [400], files: { 400: 'lilita-one-400.woff2' } },
  { id: 'titanone', label: 'Titan One', category: 'Display', css: "'BackTitanOne', cursive", weights: [400], files: { 400: 'titan-one-400.woff2' } },
  { id: 'bungee', label: 'Bungee', category: 'Display', css: "'BackBungee', sans-serif", weights: [400], files: { 400: 'bungee-400.woff2' } },
  { id: 'baloo2', label: 'Baloo 2', category: 'Sans', css: "'BackBaloo2', sans-serif", weights: [400, 500, 600, 700, 800], file: 'baloo-2-var.woff2' },
  { id: 'quicksand', label: 'Quicksand', category: 'Sans', css: "'BackQuicksand', sans-serif", weights: [300, 400, 500, 600, 700], file: 'quicksand-var.woff2' },
  { id: 'comfortaa', label: 'Comfortaa', category: 'Sans', css: "'BackComfortaa', sans-serif", weights: [300, 400, 500, 600, 700], file: 'comfortaa-var.woff2' },
  { id: 'inter', label: 'Inter', category: 'Sans', css: "'BackInter', sans-serif", weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], file: 'inter-var.woff2', italic: true, italicFile: 'inter-var-italic.woff2' },
  { id: 'montserrat', label: 'Montserrat', category: 'Sans', css: "'BackMontserrat', sans-serif", weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], file: 'montserrat-var.woff2' },
  { id: 'poppins', label: 'Poppins', category: 'Sans', css: "'BackPoppins', sans-serif", weights: [400, 500, 600, 700, 800], files: { 400: 'poppins-400.woff2', 500: 'poppins-500.woff2', 600: 'poppins-600.woff2', 700: 'poppins-700.woff2', 800: 'poppins-800.woff2' } },
  { id: 'rubik', label: 'Rubik', category: 'Sans', css: "'BackRubik', sans-serif", weights: [300, 400, 500, 600, 700, 800, 900], file: 'rubik-var.woff2' },
  { id: 'barlowcondensed', label: 'Barlow Condensed', category: 'Sans', css: "'BackBarlowCondensed', sans-serif", weights: [400, 500, 600, 700, 800], files: { 400: 'barlow-condensed-400.woff2', 500: 'barlow-condensed-500.woff2', 600: 'barlow-condensed-600.woff2', 700: 'barlow-condensed-700.woff2', 800: 'barlow-condensed-800.woff2' } },
  { id: 'merriweather', label: 'Merriweather', category: 'Serif', css: "'BackMerriweather', serif", weights: [300, 400, 500, 600, 700, 800, 900], file: 'merriweather-var.woff2', italic: true, italicFile: 'merriweather-var-italic.woff2' },
  { id: 'lora', label: 'Lora', category: 'Serif', css: "'BackLora', serif", weights: [400, 500, 600, 700], file: 'lora-var.woff2', italic: true, italicFile: 'lora-var-italic.woff2' },
  { id: 'dmserif', label: 'DM Serif Display', category: 'Serif', css: "'BackDmSerif', serif", weights: [400], files: { 400: 'dm-serif-display-400.woff2' } },
  { id: 'cinzeldeco', label: 'Cinzel Decorative', category: 'Fantasy', css: "'BackCinzelDecorative', serif", weights: [400, 700, 900], files: { 400: 'cinzel-decorative-400.woff2', 700: 'cinzel-decorative-700.woff2', 900: 'cinzel-decorative-900.woff2' } },
  { id: 'uncial', label: 'Uncial Antiqua', category: 'Fantasy', css: "'BackUncial', fantasy", weights: [400], files: { 400: 'uncial-antiqua-400.woff2' } },
  { id: 'medievalsharp', label: 'MedievalSharp', category: 'Fantasy', css: "'BackMedievalSharp', fantasy", weights: [400], files: { 400: 'medievalsharp-400.woff2' } },
  { id: 'metamorphous', label: 'Metamorphous', category: 'Fantasy', css: "'BackMetamorphous', fantasy", weights: [400], files: { 400: 'metamorphous-400.woff2' } },
  { id: 'caveat', label: 'Caveat', category: 'Script', css: "'BackCaveat', cursive", weights: [400, 500, 600, 700], file: 'caveat-var.woff2' },
  { id: 'gochihand', label: 'Gochi Hand', category: 'Script', css: "'BackGochiHand', cursive", weights: [400], files: { 400: 'gochi-hand-400.woff2' } },
  { id: 'kalam', label: 'Kalam', category: 'Script', css: "'BackKalam', cursive", weights: [400, 700], files: { 400: 'kalam-400.woff2', 700: 'kalam-700.woff2' } },
  { id: 'dancing', label: 'Dancing Script', category: 'Script', css: "'BackDancing', cursive", weights: [400, 500, 600, 700], files: { 400: 'dancing-script-400.woff2', 500: 'dancing-script-500.woff2', 600: 'dancing-script-600.woff2', 700: 'dancing-script-700.woff2' } },
  { id: 'rajdhani', label: 'Rajdhani', category: 'Sans', css: "'BackRajdhani', sans-serif", weights: [400, 500, 600, 700], files: { 400: 'rajdhani-400.woff2', 500: 'rajdhani-500.woff2', 600: 'rajdhani-600.woff2', 700: 'rajdhani-700.woff2' } },
  { id: 'audiowide', label: 'Audiowide', category: 'Display', css: "'BackAudiowide', sans-serif", weights: [400], files: { 400: 'audiowide-400.woff2' } },
  { id: 'russoone', label: 'Russo One', category: 'Display', css: "'BackRussoOne', sans-serif", weights: [400], files: { 400: 'russo-one-400.woff2' } },
  { id: 'vt323', label: 'VT323', category: 'Mono / Pixel', css: "'BackVT323', monospace", weights: [400], files: { 400: 'vt323-400.woff2' } },
  { id: 'silkscreen', label: 'Silkscreen', category: 'Mono / Pixel', css: "'BackSilkscreen', monospace", weights: [400, 700], files: { 400: 'silkscreen-400.woff2', 700: 'silkscreen-700.woff2' } },
]
export const BACK_FONTS: BackFont[] = BACK_FONT_DEFS.map(({ file, ...d }) => (file ? { ...d, files: Object.fromEntries(d.weights.map(w => [w, file])), variable: true as const } : d));
export const FONT_IDS = BACK_FONTS.map(f => f.id);
export const fontCss = (id: string) => (BACK_FONTS.find(f => f.id === id) ?? BACK_FONTS[0]).css;

/** The weight a font really has that is nearest to `want` (a saved weight the font lacks snaps to it). */
export const nearestWeight = (f: BackFont, want: number) => f.weights.reduce((best, n) => (Math.abs(n - want) < Math.abs(best - want) ? n : best), f.weights[0]);
export interface BackEl extends TextStyle, TextBox {
  id: string;
  kind: ElementKind;
  show: boolean;
  /** `stack`: in today's centred column, in list order. `free`: a box at x, y (the centre, % of the card), w (% of the card width). */
  place: 'stack' | 'free';
  x: number; y: number; w: number; rotate: number; z: number; locked: boolean;
  /** Stack elements: 0.8 / 1 / 1.25 (S / M / L). Free text: size in % of the card width. */
  scale: number;
  /** Text boxes: the template ({pack} {season} {card} {version} {edition} {printNumber} {holder} {date}). */
  text: string;
  /** Logo: where the image comes from, its address and its size in px (stack). */
  src: 'cover' | 'url';
  url: string;
  px: number;
  /** QR code colours (hex, or `auto`). */
  dark: string;
  light: string;
  /** Shape elements: the shape (lengths in px of the 240 px reference card). The box is x, y, w and `h`. */
  shape?: ShapeSpec;
  /** Image elements: how the picture fits its box (the address is `url`). */
  imageFit?: (typeof IMAGE_FITS)[number];
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

/** Only http(s) and site-relative image addresses; anything else (javascript:, data:, quotes that could end a CSS url()) is dropped. */
export function safeUrl(v: unknown): string {
  if (typeof v !== 'string') return '';
  const s = v.trim();
  if (s.length > 500 || /[\s"'()\\<>]/.test(s)) return '';
  return /^https:\/\//i.test(s) || /^\/(?!\/)/.test(s) ? s : '';
}

/** Line breaks are kept (a text box may have paragraphs); everything else is collapsed. */
const cleanText = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f<>]/g, ' ').split('\n').map(l => l.replace(/\s+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, max) : '');

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
  const media = kind === 'shape' || kind === 'image';
  const style = sanitizeTextStyle(raw, FONT_IDS), box = sanitizeTextBox(raw);
  // A shape or image draws only shadows and glow, and always sits freely in a box of its own.
  const fx = media ? { ...(style.fx.shadows ? { shadows: style.fx.shadows } : {}), ...(style.fx.glow ? { glow: style.fx.glow } : {}) } : style.fx;
  return {
    id, kind, show: raw.show !== false, place: media || raw.place === 'free' ? 'free' : 'stack',
    x: r2(clamp(raw.x, 0, 100, 50)), y: r2(clamp(raw.y, 0, 100, 50)), w: r2(clamp(raw.w, 10, 100, 80)), rotate: r2(clamp(raw.rotate, -45, 45, 0)),
    z: Math.round(clamp(raw.z, -50, 50, 0)), locked: raw.locked === true,
    scale: r2(clamp(raw.scale, 0.5, 2, 1)), ...style, fx, ...box, ...(media ? { h: box.h ?? 20 } : {}),
    text: kind === 'text' ? cleanText(raw.text, MAX_TEXT) : '', src: src === 'url' && !url ? 'cover' : src, url: kind === 'image' ? (isSafeImageUrl(raw.url) ? raw.url : '') : url, px: Math.round(clamp(raw.px, 10, 120, 38)),
    dark: hex(raw.dark, 'auto', 'auto'), light: hex(raw.light, 'auto', 'auto'),
    ...(kind === 'shape' ? { shape: sanitizeShape(isRec(raw.shape) ? raw.shape : {}) } : {}), ...(kind === 'image' ? { imageFit: pick(raw.imageFit, IMAGE_FITS, 'contain') } : {}),
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
    if (el.kind === 'text') { if (texts >= MAX_TEXT_BOXES) continue; texts++; } else if (!MULTI_KINDS.includes(el.kind)) { if (seenKinds.has(el.kind)) continue; seenKinds.add(el.kind); }
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
  const engrave: Effects = v1.text === 'auto' ? { bevel: { style: 'pressed', depth: 1 } } : {};
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
