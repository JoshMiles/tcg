// The 20.1 (v1) design of a print's back: one design for the whole back, controlled by a few switches. Kept as the model the 20.1 editor
// edits; stored designs are v2 (lib/card-back.ts) and `upgradeCardBack` turns a v1 design into elements that render the same.
// (ROADMAP 20.1 / 20.3a) Pure and client-safe: the shape, the sanitiser, the presets and the CSS the
// FlipCard turns a design into. `DEFAULT_V1` is today's engraved steel plate exactly; a pack with no stored design uses it.
// Stored apart from the Pack object in `pack:<id>:cardback` (see lib/card-back-store.ts), because pack forms rewrite the whole pack.

export const SIZES = ['S', 'M', 'L'] as const;
export type BackSize = (typeof SIZES)[number];

export const ELEMENTS = ['number', 'edition', 'name', 'date', 'origin', 'history', 'qr'] as const;
export type BackElement = (typeof ELEMENTS)[number];
export const ELEMENT_LABELS: Record<BackElement, string> = {
  number: 'Print number', edition: 'Edition line', name: 'Name line', date: 'Date', origin: 'Origin and holder', history: 'History', qr: 'QR code',
};

export const BACKGROUNDS = ['steel', 'solid', 'gradient'] as const;
export const PATTERNS = ['none', 'lines', 'holes', 'cover'] as const;
export const FONTS = ['display', 'body', 'mono'] as const;
export const ALIGNS = ['top', 'middle', 'bottom'] as const;
export const LOGOS = ['none', 'cover', 'url'] as const;

export interface CardBackV1 {
  /** `steel` is today's brushed metal; `solid` uses `bg1`; `gradient` runs `bg1` to `bg2` at `angle` degrees. */
  background: (typeof BACKGROUNDS)[number];
  bg1: string;
  bg2: string;
  angle: number;
  pattern: (typeof PATTERNS)[number];
  /** `rarity` = the card's rarity colour (today); otherwise a fixed #rrggbb. */
  edge: string;
  /** `auto` = today's dark engraved ink; otherwise a fixed colour. */
  text: string;
  /** `auto` = today's ink for the brand label and the link; otherwise a fixed colour. */
  accent: string;
  /** The face of the big number. */
  font: (typeof FONTS)[number];
  align: (typeof ALIGNS)[number];
  logo: (typeof LOGOS)[number];
  logoUrl: string;
  logoSize: BackSize;
  /** A line of text under the name; `{pack}` and `{season}` are filled in. Empty = none. */
  line: string;
  show: Record<BackElement, boolean>;
  size: Record<BackElement, BackSize>;
  /** Filled in when a back is built for a print, never stored: the pack's cover and the finished custom line. */
  cover?: string;
  lineText?: string;
}

export const DEFAULT_V1: CardBackV1 = {
  background: 'steel', bg1: '#a9a9b3', bg2: '#dcdce3', angle: 135, pattern: 'lines', edge: 'rarity', text: 'auto', accent: 'auto',
  font: 'display', align: 'middle', logo: 'none', logoUrl: '', logoSize: 'M', line: '',
  show: { number: true, edition: true, name: true, date: true, origin: true, history: true, qr: true },
  size: { number: 'M', edition: 'M', name: 'M', date: 'M', origin: 'M', history: 'M', qr: 'M' },
};

export const MAX_LINE = 60;
const HEX = /^#[0-9a-fA-F]{6}$/;
const SHORT_HEX = /^#[0-9a-fA-F]{3}$/;

function colour(v: unknown, fallback: string, allow?: string): string {
  if (typeof v !== 'string') return fallback;
  const s = v.trim();
  if (allow && s === allow) return s;
  if (HEX.test(s)) return s.toLowerCase();
  if (SHORT_HEX.test(s)) return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toLowerCase();
  return fallback;
}
const pick = <T extends string>(v: unknown, all: readonly T[], fallback: T): T => (typeof v === 'string' && (all as readonly string[]).includes(v) ? (v as T) : fallback);

/** Only http(s) and site-relative image addresses; anything else (javascript:, data:, quotes that could end a CSS url()) is dropped. */
function safeUrl(v: unknown): string {
  if (typeof v !== 'string') return '';
  const s = v.trim();
  if (s.length > 500 || /[\s"'()\\<>]/.test(s)) return '';
  return /^https:\/\//i.test(s) || /^\/(?!\/)/.test(s) ? s : '';
}

/** Turns anything (a stored value, a form post) into a valid design: unknown keys dropped, colours and choices validated, the line capped. */
export function sanitizeV1(input: unknown): CardBackV1 {
  const d = DEFAULT_V1;
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const show = (o.show && typeof o.show === 'object' ? o.show : {}) as Record<string, unknown>;
  const size = (o.size && typeof o.size === 'object' ? o.size : {}) as Record<string, unknown>;
  const angle = typeof o.angle === 'number' && Number.isFinite(o.angle) ? Math.round(((o.angle % 360) + 360) % 360) : d.angle;
  const line = typeof o.line === 'string' ? o.line.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_LINE) : '';
  const logo = pick(o.logo, LOGOS, d.logo);
  const logoUrl = safeUrl(o.logoUrl);
  return {
    background: pick(o.background, BACKGROUNDS, d.background),
    bg1: colour(o.bg1, d.bg1), bg2: colour(o.bg2, d.bg2), angle,
    pattern: pick(o.pattern, PATTERNS, d.pattern),
    edge: colour(o.edge, d.edge, 'rarity'), text: colour(o.text, d.text, 'auto'), accent: colour(o.accent, d.accent, 'auto'),
    font: pick(o.font, FONTS, d.font), align: pick(o.align, ALIGNS, d.align),
    logo: logo === 'url' && !logoUrl ? 'none' : logo, logoUrl, logoSize: pick(o.logoSize, SIZES, d.logoSize), line,
    show: Object.fromEntries(ELEMENTS.map(e => [e, typeof show[e] === 'boolean' ? show[e] : d.show[e]])) as Record<BackElement, boolean>,
    size: Object.fromEntries(ELEMENTS.map(e => [e, pick(size[e], SIZES, d.size[e])])) as Record<BackElement, BackSize>,
  };
}

/** True when the design is today's look (nothing worth storing). */
export function isDefaultV1(s: CardBackV1): boolean {
  const { cover: _c, lineText: _l, ...rest } = s;
  void _c; void _l;
  return JSON.stringify(rest) === JSON.stringify(sanitizeV1(DEFAULT_V1));
}

export const PRESETS_V1: { id: string; label: string; style: CardBackV1 }[] = [
  { id: 'classic', label: 'Classic', style: DEFAULT_V1 },
  { id: 'clean', label: 'Clean', style: sanitizeV1({ background: 'solid', bg1: '#15151c', pattern: 'none', text: '#f3f4f6', accent: '#fbbf24', font: 'body', size: { number: 'L' }, show: { history: false } }) },
  { id: 'gold', label: 'Gold foil', style: sanitizeV1({ background: 'gradient', bg1: '#b8892b', bg2: '#f1d37a', angle: 135, pattern: 'lines', edge: '#a87a1e', text: '#3c2604', accent: '#5a3a06' }) },
  { id: 'art', label: 'Pack art', style: sanitizeV1({ background: 'solid', bg1: '#111118', pattern: 'cover', text: '#f9fafb', accent: '#fde68a', logo: 'cover', logoSize: 'M' }) },
];

export const SCALE: Record<BackSize, number> = { S: 0.8, M: 1, L: 1.25 };
export const FONT_VAR: Record<CardBackV1['font'], string> = { display: 'var(--font-display, inherit)', body: 'inherit', mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' };
export const JUSTIFY: Record<CardBackV1['align'], string> = { top: 'flex-start', middle: 'center', bottom: 'flex-end' };
export const LOGO_PX: Record<BackSize, number> = { S: 26, M: 38, L: 54 };

/** The plate's background layers (top first). For the default design this is today's brushed steel, character for character. */
export function plateBackground(s: Pick<CardBackV1, 'background' | 'bg1' | 'bg2' | 'angle' | 'pattern' | 'cover'>): string {
  const layers: string[] = [];
  if (s.pattern === 'lines') layers.push('repeating-linear-gradient(90deg, rgba(255,255,255,.28) 0 1px, transparent 1px 3px)');
  if (s.pattern === 'holes') layers.push('radial-gradient(circle at 50% 50%, rgba(0,0,0,.28) 0 5px, transparent 6px) 0 0 / 28px 28px', 'radial-gradient(circle at 50% 50%, rgba(0,0,0,.2) 0 4px, transparent 5px) 14px 14px / 28px 28px');
  if (s.pattern === 'cover' && s.cover) layers.push(`linear-gradient(rgba(0,0,0,.55), rgba(0,0,0,.55)), url("${s.cover}") center / cover`);
  if (s.background === 'steel') layers.push('linear-gradient(135deg, #a9a9b3 0%, #dcdce3 36%, #9a9aa5 62%, #c4c4cd 100%)');
  else if (s.background === 'solid') layers.push(`linear-gradient(${s.bg1}, ${s.bg1})`);
  else layers.push(`linear-gradient(${s.angle}deg, ${s.bg1}, ${s.bg2})`);
  return layers.join(', ');
}

/** The CSS custom properties a styled back sets on its plate. The default design sets none that differ from the stylesheet. */
export function cardBackVars(s: CardBackV1, rarityHex: string): Record<string, string> {
  const v: Record<string, string> = {
    '--edge': s.edge === 'rarity' ? rarityHex : s.edge,
    '--plate-bg': plateBackground(s),
    '--plate-justify': JUSTIFY[s.align],
    '--num-font': FONT_VAR[s.font],
  };
  if (s.text !== 'auto') { v['--ink'] = s.text; v['--ink-soft'] = s.text; v['--ink-shadow'] = 'none'; }
  if (s.accent !== 'auto') v['--accent-ink'] = s.accent;
  for (const e of ELEMENTS) v[`--k-${e}`] = String(SCALE[s.size[e]]);
  v['--logo-px'] = `${LOGO_PX[s.logoSize]}px`;
  return v;
}

