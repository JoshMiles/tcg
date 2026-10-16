// Layout for the shareable card images (pure, client-safe). The drawing itself is in app/components/ShareImage.tsx; keeping the
// arithmetic here means it can be checked without a browser.

export const SHARE_W = 1080;
export const SHARE_H = 1350;
export const STORY_H = 1920;
export const CARD_RATIO = 2 / 3; // width / height of the art

export interface Rect { x: number; y: number; w: number; h: number }

/** Where `n` cards go in the area under the header. One card is big and centred; more fill a grid, 3 per row (2 when there are 4). */
export function layoutCards(n: number, area: Rect, gap = 28, colsOverride?: number): Rect[] {
  const count = Math.max(0, Math.min(9, Math.floor(n)));
  if (count === 0) return [];
  const cols = colsOverride ? Math.max(1, Math.min(3, Math.floor(colsOverride))) : count === 1 ? 1 : count === 2 ? 2 : count === 4 ? 2 : 3;
  const rows = Math.ceil(count / cols);
  // The biggest card that fits both ways.
  const wByWidth = (area.w - gap * (cols - 1)) / cols;
  const hByHeight = (area.h - gap * (rows - 1)) / rows;
  const w = Math.min(wByWidth, hByHeight * CARD_RATIO);
  const h = w / CARD_RATIO;
  const out: Rect[] = [];
  for (let i = 0; i < count; i++) {
    const r = Math.floor(i / cols);
    const inRow = r === rows - 1 ? count - r * cols : cols; // centre a short last row
    const c = i - r * cols;
    const rowW = inRow * w + (inRow - 1) * gap;
    out.push({ x: area.x + (area.w - rowW) / 2 + c * (w + gap), y: area.y + (area.h - (rows * h + (rows - 1) * gap)) / 2 + r * (h + gap), w, h });
  }
  return out;
}

export interface ShareCard {
  src: string;
  /** A small static still of the art, for previews and pickers (the full art is often an animated, multi-megabyte file). */
  thumb?: string;
  name: string; tag?: string; hex?: string;
}
/** The engraved plate under a single copy's card: its unique number, edition, date, who holds it and a QR code to its page. */
export interface SharePlate {
  /** The unique copy number ("#1000342"); the edition is shown instead when a copy has none. */
  number: string;
  /** "Edition #7 of 12 made". */
  edition: string;
  /** "PULLED 12 OCT 2026". */
  date?: string;
  /** "Held by @alice" / origin lines, already masked for private collectors. */
  lines?: string[];
  /** Gold lettering when the copy earns a points bonus. */
  gold?: boolean;
  /** Absolute link for the QR code. */
  qrUrl?: string;
}

/** Image shapes: a feed post, or a full-screen story. */
export type ShareFormat = 'post' | 'story';
export const FORMATS: { id: ShareFormat; label: string; h: number }[] = [
  { id: 'post', label: 'Post 4:5', h: SHARE_H },
  { id: 'story', label: 'Story 9:16', h: STORY_H },
];
export const formatHeight = (f?: ShareFormat): number => FORMATS.find(x => x.id === f)?.h ?? SHARE_H;

/** A look for the images: background, accent colours, text and the plate's metal. */
export interface ShareTheme {
  id: string;
  label: string;
  bg: [string, string];
  /** The soft light behind the cards. */
  glow: string;
  /** The stripe along the top. */
  bar: string[];
  title: string; subtitle: string; footer: string;
  chipBg: string; chipBorder: string; chipText: string;
  /** The card slot / stat tile fill. */
  tile: string;
  plate: { stops: [string, string, string, string]; ink: string; hi: string; lo: string; rivet: string; dark: boolean };
}

const STEEL = { stops: ['#a9a9b3', '#dcdce3', '#9a9aa5', '#c4c4cd'] as [string, string, string, string], ink: 'rgba(24,24,32,0.82)', hi: 'rgba(255,255,255,0.75)', lo: 'rgba(0,0,0,0.3)', rivet: '#7d7d88', dark: false };

export const SHARE_THEMES: ShareTheme[] = [
  {
    id: 'classic', label: 'Classic', bg: ['#111936', '#070b1d'], glow: 'rgba(250,204,21,0.16)', bar: ['#facc15', '#fb7185', '#c084fc', '#38bdf8', '#34d399'],
    title: '#ffffff', subtitle: '#9ca3af', footer: '#9ca3af', chipBg: 'rgba(250,204,21,0.12)', chipBorder: 'rgba(250,204,21,0.45)', chipText: '#fde047', tile: '#0b1020',
    plate: STEEL,
  },
  {
    id: 'midnight', label: 'Midnight', bg: ['#1b1040', '#08051a'], glow: 'rgba(168,85,247,0.28)', bar: ['#6366f1', '#a855f7', '#ec4899'],
    title: '#ffffff', subtitle: '#a5b4fc', footer: '#a5b4fc', chipBg: 'rgba(168,85,247,0.16)', chipBorder: 'rgba(192,132,252,0.55)', chipText: '#e9d5ff', tile: '#0d0824',
    plate: { stops: ['#2a2a3c', '#4a4a64', '#25253a', '#3a3a52'], ink: 'rgba(226,226,245,0.9)', hi: 'rgba(255,255,255,0.18)', lo: 'rgba(0,0,0,0.65)', rivet: '#6b6b88', dark: true },
  },
  {
    id: 'cheese', label: 'Cheese', bg: ['#3a2606', '#150d02'], glow: 'rgba(250,204,21,0.3)', bar: ['#fde047', '#facc15', '#f59e0b'],
    title: '#fff7d6', subtitle: '#fcd34d', footer: '#fcd34d', chipBg: 'rgba(250,204,21,0.18)', chipBorder: 'rgba(253,224,71,0.6)', chipText: '#fef08a', tile: '#1c1204',
    plate: { stops: ['#b8892b', '#f1d37a', '#a87a1e', '#dcb957'], ink: 'rgba(60,38,4,0.88)', hi: 'rgba(255,248,210,0.8)', lo: 'rgba(60,30,0,0.35)', rivet: '#8a6416', dark: false },
  },
  {
    id: 'holo', label: 'Holo', bg: ['#0f1f2e', '#07101a'], glow: 'rgba(56,189,248,0.25)', bar: ['#f472b6', '#facc15', '#34d399', '#38bdf8', '#a78bfa', '#f472b6'],
    title: '#ffffff', subtitle: '#7dd3fc', footer: '#7dd3fc', chipBg: 'rgba(56,189,248,0.14)', chipBorder: 'rgba(125,211,252,0.55)', chipText: '#bae6fd', tile: '#08131d',
    plate: { stops: ['#9fb4c7', '#e4eef7', '#93a8bb', '#cfdceb'], ink: 'rgba(16,30,44,0.85)', hi: 'rgba(255,255,255,0.8)', lo: 'rgba(0,20,40,0.3)', rivet: '#74889b', dark: false },
  },
  {
    id: 'ink', label: 'Ink', bg: ['#0a0a0a', '#000000'], glow: 'rgba(255,255,255,0.08)', bar: ['#ffffff', '#6b7280', '#ffffff'],
    title: '#ffffff', subtitle: '#9ca3af', footer: '#6b7280', chipBg: 'rgba(255,255,255,0.07)', chipBorder: 'rgba(255,255,255,0.3)', chipText: '#f3f4f6', tile: '#111111',
    plate: { stops: ['#1c1c1c', '#383838', '#181818', '#2c2c2c'], ink: 'rgba(240,240,240,0.92)', hi: 'rgba(255,255,255,0.16)', lo: 'rgba(0,0,0,0.8)', rivet: '#555555', dark: true },
  },
  {
    id: 'paper', label: 'Paper', bg: ['#faf5e8', '#efe5cc'], glow: 'rgba(250,204,21,0.25)', bar: ['#f59e0b', '#ef4444', '#8b5cf6', '#0ea5e9', '#10b981'],
    title: '#1f1a0e', subtitle: '#6b5d3a', footer: '#6b5d3a', chipBg: 'rgba(180,120,0,0.1)', chipBorder: 'rgba(180,120,0,0.45)', chipText: '#7a4e00', tile: '#e6dcc0',
    plate: STEEL,
  },
];
export const getShareTheme = (id?: string): ShareTheme => SHARE_THEMES.find(t => t.id === id) ?? SHARE_THEMES[0];

export interface BigStat { label: string; value: string }

export interface ShareSpec {
  title: string;
  subtitle?: string;
  stats?: string[];
  /** Large stat tiles under the header (the stats poster). The cards get the space that is left. */
  bigStats?: BigStat[];
  cards: ShareCard[];
  footer: string;
  /** A single copy's plate (the copy page's image). The card shrinks to leave room for it. */
  plate?: SharePlate;
  /** A `SHARE_THEMES` id; unknown or missing = Classic. */
  theme?: string;
  /** Post (4:5, default) or story (9:16). */
  format?: ShareFormat;
  /** Draw the owner's binder pages (cover, page and pocket styles, grid) in place of the card layout. */
  binder?: BinderShare;
  /** The "Share my stats" card: rank and score, six figures, and `cards` as a strip of their most valuable prints. */
  statsCard?: StatsCardShare;
}

/** One figure tile of the stats card. `progress` (0 to 1) draws a bar under it. */
export interface StatsFigure { label: string; value: string; sub?: string; progress?: number }
export interface StatsCardShare {
  rank: string;
  score: string;
  /** Six figures, drawn as two columns of three. */
  figures: StatsFigure[];
  /** The rarity colour of their rarest print: the card's accent. */
  accent?: string;
}

/** Where the parts of the stats card go for an image of height `h` (extra height in a story goes to the figures and the strip). */
export interface StatsLayout { hero: Rect; tiles: Rect[]; strip: Rect; stripLabelY: number; thumbs: Rect[] }
export function statsLayout(h = SHARE_H, thumbCount = 3): StatsLayout {
  const a = cardArea(h);
  const extra = h - SHARE_H;
  const heroH = 196 + Math.round(extra * 0.2), gap = 24;
  const tileH = 144 + Math.round(extra * 0.1), tileW = (a.w - gap) / 2;
  const hero: Rect = { x: a.x, y: a.y, w: a.w, h: heroH };
  const tiles: Rect[] = [];
  for (let i = 0; i < 6; i++) tiles.push({ x: a.x + (i % 2) * (tileW + gap), y: a.y + heroH + gap + Math.floor(i / 2) * (tileH + gap), w: tileW, h: tileH });
  const stripY = tiles[5].y + tileH + 34;
  const strip: Rect = { x: a.x, y: stripY, w: a.w, h: a.y + a.h - stripY };
  const labelH = 44;
  const tg = 28;
  // As tall as the strip allows, but never wider than the area (a story's strip is taller than three prints are wide).
  const tw = Math.min(Math.max(0, strip.h - labelH) * CARD_RATIO, (strip.w - tg * (thumbCount - 1)) / Math.max(1, thumbCount)), th = tw / CARD_RATIO;
  const total = thumbCount * tw + (thumbCount - 1) * tg;
  const thumbs: Rect[] = Array.from({ length: thumbCount }, (_, i) => ({ x: strip.x + (strip.w - total) / 2 + i * (tw + tg), y: strip.y + labelH, w: tw, h: th }));
  return { hero, tiles, strip, stripLabelY: strip.y + 28, thumbs };
}

/** The header takes the top of the image; cards get the rest. */
export const HEADER_H = 250;
export const FOOTER_H = 90;
export const cardArea = (h = SHARE_H): Rect => ({ x: 70, y: HEADER_H, w: SHARE_W - 140, h: h - HEADER_H - FOOTER_H - 20 });

/** Height of the big stat tile row (and the gap below it). */
export const BIG_STATS_H = 150;
export const BIG_STATS_GAP = 30;
/** The card area with the big stat tiles taken off the top. */
export const cardAreaWithStats = (h = SHARE_H): Rect => { const a = cardArea(h); return { ...a, y: a.y + BIG_STATS_H + BIG_STATS_GAP, h: a.h - BIG_STATS_H - BIG_STATS_GAP }; };

/** Height of the plate under a single copy's card, and the gap above it. A slim plate: the number is small and refined. */
export const PLATE_H = 210;
export const PLATE_GAP = 30;
/** Where the card goes when a plate is shown: the usual area minus the plate. */
export const cardAreaWithPlate = (h = SHARE_H): Rect => { const a = cardArea(h); return { ...a, h: a.h - PLATE_H - PLATE_GAP }; };
/** Where the plate itself goes (same width as the card area, bottom aligned with it). */
export const plateRect = (h = SHARE_H): Rect => { const a = cardArea(h); return { x: a.x, y: a.y + a.h - PLATE_H, w: a.w, h: PLATE_H }; };

// ── a binder page as an image ──

/** One pocket of a shared binder page. owned: false is a card the collector doesn't have yet (drawn in the binder's missing style). */
export interface BinderShareSlot {
  src: string;
  thumb?: string;
  name: string;
  number: number;
  hex?: string;
  owned: boolean;
  /** How many copies of the shown version (the ×N badge when above 1). */
  count: number;
  /** Version mark such as RH / FA / SH. */
  tag?: string;
  /** The pinned version's name, for a missing pocket. */
  label?: string;
}
export interface BinderSharePage { title: string; slots: (BinderShareSlot | null)[] }
export interface BinderShare {
  cols: number;
  rows: number;
  cover: { a: string; b: string; c: string; ink: string };
  material: 'leather' | 'cloth' | 'metal' | 'holo';
  page: { a: string; b: string; ink: string; muted: string; /** A pale page: empty pockets are drawn dark instead of light. */ light: boolean };
  pocket: 'plain' | 'sleeve' | 'frame' | 'flat';
  missing: 'name' | 'number' | 'ghost' | 'blank';
  badges: boolean;
  /** The page, or the two pages of an open spread. */
  pages: BinderSharePage[];
}

/** Space inside a page (14px padding and a 1px border), the heading row and its gap, between pockets: the same proportions as the website's pages. */
export const BINDER_PAGE_PAD = 15;
export const BINDER_HEAD_H = 16;
export const BINDER_HEAD_GAP = 8;
export const BINDER_GAP = 8;
export const BINDER_LEATHER_PAD = 16;

export interface BinderLayout {
  leather: Rect;
  /** Roughly one pocket's width relative to the website's 3x3 spread (to scale lettering and borders). */
  k: number;
  pages: { rect: Rect; head: Rect; pockets: Rect[] }[];
}

/**
 * Where the binder, its pages and their pockets go in an image of height h: as wide as the card area allows (two pages share it),
 * shrunk to fit the height when the grid is tall, and centred. Pockets are 2:3 like the card art.
 */
export function binderLayout(b: { cols: number; rows: number; pages: unknown[] }, h = SHARE_H): BinderLayout {
  const area = cardArea(h);
  const n = Math.max(1, Math.min(2, b.pages.length));
  const inner = { w: area.w - 2 * BINDER_LEATHER_PAD, h: area.h - 2 * BINDER_LEATHER_PAD };
  const chromeW = 2 * BINDER_PAGE_PAD, chromeH = 2 * BINDER_PAGE_PAD + BINDER_HEAD_H + BINDER_HEAD_GAP;
  const pocketByWidth = (inner.w / n - chromeW - (b.cols - 1) * BINDER_GAP) / b.cols;
  const pocketByHeight = (inner.h - chromeH - (b.rows - 1) * BINDER_GAP) / (b.rows * 1.5);
  const pw = Math.max(8, Math.min(pocketByWidth, pocketByHeight));
  const ph = pw * 1.5;
  const pageW = b.cols * pw + (b.cols - 1) * BINDER_GAP + chromeW;
  const pageH = b.rows * ph + (b.rows - 1) * BINDER_GAP + chromeH;
  const leather: Rect = {
    x: area.x + (area.w - (n * pageW + 2 * BINDER_LEATHER_PAD)) / 2,
    y: area.y + (area.h - (pageH + 2 * BINDER_LEATHER_PAD)) / 2,
    w: n * pageW + 2 * BINDER_LEATHER_PAD,
    h: pageH + 2 * BINDER_LEATHER_PAD,
  };
  const pages = Array.from({ length: n }, (_, i) => {
    const rect: Rect = { x: leather.x + BINDER_LEATHER_PAD + i * pageW, y: leather.y + BINDER_LEATHER_PAD, w: pageW, h: pageH };
    const head: Rect = { x: rect.x + BINDER_PAGE_PAD, y: rect.y + BINDER_PAGE_PAD, w: pageW - chromeW, h: BINDER_HEAD_H };
    const gx = rect.x + BINDER_PAGE_PAD, gy = head.y + BINDER_HEAD_H + BINDER_HEAD_GAP;
    const pockets: Rect[] = [];
    for (let r = 0; r < b.rows; r++) for (let c = 0; c < b.cols; c++) pockets.push({ x: gx + c * (pw + BINDER_GAP), y: gy + r * (ph + BINDER_GAP), w: pw, h: ph });
    return { rect, head, pockets };
  });
  return { leather, k: pw / 137, pages };
}
