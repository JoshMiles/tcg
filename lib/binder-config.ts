// A collector's binder settings (pure, client-safe): how it looks and, optionally, exactly which card sits in which pocket.
// Stored in `UserSettings.binder` (null = the default look and the automatic layout). Everything is validated on the way in,
// so a crafted request can never store an unknown option or an out-of-range value.

import { VARIANTS } from './variants';
import type { Variant } from './types';

export const BINDER_LIMITS = { title: 40, subtitle: 60, pageTitle: 40, pages: 40, cols: [2, 4], rows: [1, 4] } as const;
export const MAX_POCKETS = BINDER_LIMITS.cols[1] * BINDER_LIMITS.rows[1];

export interface CoverColour { id: string; label: string; /** Highlight, base and deep tones of the cover, and the colour of its lettering. */ a: string; b: string; c: string; ink: string; /** A matching look for share images. */ shareTheme: string }
export const COVER_COLOURS: CoverColour[] = [
  { id: 'saddle', label: 'Saddle', a: '#7a3b24', b: '#4a2417', c: '#2f170f', ink: '#f8dc8a', shareTheme: 'classic' },
  { id: 'navy', label: 'Navy', a: '#27458f', b: '#16295c', c: '#0b1636', ink: '#cfe0ff', shareTheme: 'classic' },
  { id: 'crimson', label: 'Crimson', a: '#a3202f', b: '#6b1220', c: '#3d0912', ink: '#ffd9a8', shareTheme: 'classic' },
  { id: 'forest', label: 'Forest', a: '#2f7a4d', b: '#1b4d31', c: '#0e2c1c', ink: '#d7f5c8', shareTheme: 'classic' },
  { id: 'violet', label: 'Violet', a: '#6d3fc0', b: '#432680', c: '#241347', ink: '#ead9ff', shareTheme: 'midnight' },
  { id: 'charcoal', label: 'Charcoal', a: '#3f4452', b: '#272a34', c: '#13151b', ink: '#e5e7eb', shareTheme: 'ink' },
  { id: 'cheddar', label: 'Cheddar', a: '#d6a017', b: '#a8760a', c: '#6b4806', ink: '#fff3c4', shareTheme: 'cheese' },
  { id: 'rose', label: 'Rose', a: '#c2477a', b: '#8a2a56', c: '#521533', ink: '#ffdceb', shareTheme: 'holo' },
];

export const MATERIALS = [
  { id: 'leather', label: 'Leather' }, { id: 'cloth', label: 'Cloth' }, { id: 'metal', label: 'Brushed metal' }, { id: 'holo', label: 'Holo foil' },
] as const;
export type Material = (typeof MATERIALS)[number]['id'];

/** Icons for the cover (names from app/components/Icon.tsx), or none. */
export const EMBLEMS = ['cheese', 'crown', 'gem', 'trophy', 'sparkles', 'zap', 'gift', 'target', 'cards', 'party', 'none'] as const;
export type Emblem = (typeof EMBLEMS)[number];

export interface PageColour { id: string; label: string; a: string; b: string; ink: string; muted: string }
export const PAGE_COLOURS: PageColour[] = [
  { id: 'midnight', label: 'Midnight', a: '#121a3a', b: '#0c1230', ink: '#8b93b5', muted: 'rgba(255,255,255,.28)' },
  { id: 'charcoal', label: 'Charcoal', a: '#22252d', b: '#15171c', ink: '#9ca3af', muted: 'rgba(255,255,255,.28)' },
  { id: 'forest', label: 'Forest', a: '#14301f', b: '#0b1d12', ink: '#8fb59a', muted: 'rgba(255,255,255,.28)' },
  { id: 'wine', label: 'Wine', a: '#3a1220', b: '#240a14', ink: '#c99aab', muted: 'rgba(255,255,255,.28)' },
  { id: 'parchment', label: 'Parchment', a: '#efe3c3', b: '#e0d0a6', ink: '#7a6638', muted: 'rgba(60,40,10,.4)' },
  { id: 'snow', label: 'Snow', a: '#f4f6fb', b: '#e3e8f3', ink: '#5b6482', muted: 'rgba(30,40,70,.4)' },
];

export const POCKET_STYLES = [
  { id: 'plain', label: 'Plain' }, { id: 'sleeve', label: 'Glossy sleeve' }, { id: 'frame', label: 'Thick frame' }, { id: 'flat', label: 'Borderless' },
] as const;
export type PocketStyle = (typeof POCKET_STYLES)[number]['id'];

/** What a pocket shows for a card the collector doesn't have yet. */
export const MISSING_STYLES = [
  { id: 'name', label: 'Number and name' }, { id: 'number', label: 'Number only' }, { id: 'ghost', label: 'Faded card' }, { id: 'blank', label: 'Empty' },
] as const;
export type MissingStyle = (typeof MISSING_STYLES)[number]['id'];

export const SORTS = [
  { id: 'number', label: 'Card number' }, { id: 'rarity', label: 'Rarest first' }, { id: 'name', label: 'Name' }, { id: 'collected', label: 'Collected first' },
] as const;
export type BinderSort = (typeof SORTS)[number]['id'];

/** One pocket's card, and optionally the version to show (null = the best one they own). */
export interface BinderSlot { card: number; variant: Variant | null }
export interface BinderPageCfg { title: string; slots: (BinderSlot | null)[] }

export interface BinderConfig {
  /** Cover lettering; empty = "<name>'s binder". */
  title: string;
  /** Under the title; empty = "N of M cards collected". */
  subtitle: string;
  cover: string;
  material: Material;
  emblem: Emblem;
  pageColour: string;
  pocketStyle: PocketStyle;
  missing: MissingStyle;
  cols: number;
  rows: number;
  /** ×N and version badges on the pockets. */
  badges: boolean;
  /** The holographic shimmer on pockets. */
  holo: boolean;
  /** auto: pages built from the collection; custom: the pages below, placed by hand. */
  mode: 'auto' | 'custom';
  sort: BinderSort;
  groupByPack: boolean;
  /** Auto mode: leave out cards they don't have. */
  hideUncollected: boolean;
  /** The season the custom pages were made for (card numbers mean different cards in another season). */
  pagesSeason: string | null;
  pages: BinderPageCfg[];
}

export const DEFAULT_BINDER: BinderConfig = {
  title: '', subtitle: '', cover: 'saddle', material: 'leather', emblem: 'cheese', pageColour: 'midnight', pocketStyle: 'plain', missing: 'name',
  cols: 3, rows: 3, badges: true, holo: true, mode: 'auto', sort: 'number', groupByPack: true, hideUncollected: false, pagesSeason: null, pages: [],
};

export const coverColour = (id: string) => COVER_COLOURS.find(c => c.id === id) ?? COVER_COLOURS[0];
export const pageColour = (id: string) => PAGE_COLOURS.find(c => c.id === id) ?? PAGE_COLOURS[0];
export const capacity = (c: Pick<BinderConfig, 'cols' | 'rows'>) => c.cols * c.rows;

const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');
const pick = <T extends string>(v: unknown, ok: readonly T[], fallback: T): T => (typeof v === 'string' && (ok as readonly string[]).includes(v) ? (v as T) : fallback);
const int = (v: unknown, [lo, hi]: readonly [number, number] | readonly number[], fallback: number) => (typeof v === 'number' && Number.isInteger(v) ? Math.max(lo, Math.min(hi, v)) : fallback);

function sanitizeSlot(s: unknown): BinderSlot | null {
  if (!s || typeof s !== 'object') return null;
  const card = Number((s as { card?: unknown }).card);
  if (!Number.isInteger(card) || card < 1 || card >= 1_000_000) return null;
  const v = (s as { variant?: unknown }).variant;
  return { card, variant: typeof v === 'string' && (VARIANTS as readonly string[]).includes(v) ? (v as Variant) : null };
}

/** Anything → a valid, complete config, or null when it is just the defaults (so nothing needs storing). */
export function sanitizeBinder(input: unknown): BinderConfig | null {
  if (!input || typeof input !== 'object') return null;
  const o = input as Record<string, unknown>;
  const cfg: BinderConfig = {
    title: clean(o.title, BINDER_LIMITS.title),
    subtitle: clean(o.subtitle, BINDER_LIMITS.subtitle),
    cover: pick(o.cover, COVER_COLOURS.map(c => c.id), DEFAULT_BINDER.cover),
    material: pick(o.material, MATERIALS.map(m => m.id), DEFAULT_BINDER.material),
    emblem: pick(o.emblem, EMBLEMS, DEFAULT_BINDER.emblem),
    pageColour: pick(o.pageColour, PAGE_COLOURS.map(c => c.id), DEFAULT_BINDER.pageColour),
    pocketStyle: pick(o.pocketStyle, POCKET_STYLES.map(p => p.id), DEFAULT_BINDER.pocketStyle),
    missing: pick(o.missing, MISSING_STYLES.map(m => m.id), DEFAULT_BINDER.missing),
    cols: int(o.cols, BINDER_LIMITS.cols, DEFAULT_BINDER.cols),
    rows: int(o.rows, BINDER_LIMITS.rows, DEFAULT_BINDER.rows),
    badges: typeof o.badges === 'boolean' ? o.badges : DEFAULT_BINDER.badges,
    holo: typeof o.holo === 'boolean' ? o.holo : DEFAULT_BINDER.holo,
    mode: o.mode === 'custom' ? 'custom' : 'auto',
    sort: pick(o.sort, SORTS.map(s => s.id), DEFAULT_BINDER.sort),
    groupByPack: typeof o.groupByPack === 'boolean' ? o.groupByPack : DEFAULT_BINDER.groupByPack,
    hideUncollected: typeof o.hideUncollected === 'boolean' ? o.hideUncollected : DEFAULT_BINDER.hideUncollected,
    pagesSeason: typeof o.pagesSeason === 'string' && o.pagesSeason.length > 0 && o.pagesSeason.length <= 80 ? o.pagesSeason : null,
    pages: [],
  };
  const cap = capacity(cfg);
  if (Array.isArray(o.pages)) {
    for (const p of o.pages.slice(0, BINDER_LIMITS.pages)) {
      if (!p || typeof p !== 'object') continue;
      const raw = Array.isArray((p as { slots?: unknown }).slots) ? ((p as { slots: unknown[] }).slots).slice(0, MAX_POCKETS) : [];
      cfg.pages.push({ title: clean((p as { title?: unknown }).title, BINDER_LIMITS.pageTitle), slots: raw.map(sanitizeSlot) });
    }
    cfg.pages = reflowPages(cfg.pages, cap); // pads every page to the grid and moves any overflow to a page of its own
  }
  if (cfg.pages.length === 0) { cfg.pagesSeason = null; if (cfg.mode === 'custom') cfg.mode = 'auto'; }
  return JSON.stringify(cfg) === JSON.stringify(DEFAULT_BINDER) ? null : cfg;
}

// ── page editing (all pure, so the editor and the checks share one set of rules) ──

const emptySlots = (n: number): (BinderSlot | null)[] => Array.from({ length: n }, () => null);
export const blankPage = (cap: number, title = ''): BinderPageCfg => ({ title, slots: emptySlots(cap) });

/**
 * Makes every page fit `cap` pockets. Cards that no longer fit (the grid got smaller) move to a new page right after, so
 * shrinking the grid never throws a card out of the binder.
 */
export function reflowPages(pages: BinderPageCfg[], cap: number): BinderPageCfg[] {
  const out: BinderPageCfg[] = [];
  for (const p of pages) {
    const kept = p.slots.slice(0, cap);
    while (kept.length < cap) kept.push(null);
    out.push({ title: p.title, slots: kept });
    const spill = p.slots.slice(cap).filter((s): s is BinderSlot => !!s);
    for (let i = 0; i < spill.length; i += cap) {
      const chunk: (BinderSlot | null)[] = spill.slice(i, i + cap);
      while (chunk.length < cap) chunk.push(null);
      out.push({ title: p.title ? `${p.title} (more)` : '', slots: chunk });
    }
  }
  return out.slice(0, BINDER_LIMITS.pages);
}

export function addPage(pages: BinderPageCfg[], cap: number, at = pages.length): BinderPageCfg[] {
  if (pages.length >= BINDER_LIMITS.pages) return pages;
  const i = Math.max(0, Math.min(pages.length, at));
  return [...pages.slice(0, i), blankPage(cap), ...pages.slice(i)];
}
export const removePage = (pages: BinderPageCfg[], i: number): BinderPageCfg[] => pages.filter((_, k) => k !== i);
export function movePage(pages: BinderPageCfg[], from: number, to: number): BinderPageCfg[] {
  if (from < 0 || from >= pages.length) return pages;
  const t = Math.max(0, Math.min(pages.length - 1, to));
  const next = pages.slice();
  const [p] = next.splice(from, 1);
  next.splice(t, 0, p);
  return next;
}
export const renamePage = (pages: BinderPageCfg[], i: number, title: string): BinderPageCfg[] =>
  pages.map((p, k) => (k === i ? { ...p, title: clean(title, BINDER_LIMITS.pageTitle) } : p));
export const clearPage = (pages: BinderPageCfg[], i: number): BinderPageCfg[] =>
  pages.map((p, k) => (k === i ? { ...p, slots: emptySlots(p.slots.length) } : p));
export function setSlot(pages: BinderPageCfg[], page: number, slot: number, value: BinderSlot | null): BinderPageCfg[] {
  return pages.map((p, k) => (k === page && slot >= 0 && slot < p.slots.length ? { ...p, slots: p.slots.map((s, j) => (j === slot ? value : s)) } : p));
}
/** The next empty pocket after (page, slot), or null when the binder is full from there on. */
export function nextEmpty(pages: BinderPageCfg[], page: number, slot: number): { page: number; slot: number } | null {
  for (let p = page; p < pages.length; p++) for (let s = p === page ? slot + 1 : 0; s < pages[p].slots.length; s++) if (!pages[p].slots[s]) return { page: p, slot: s };
  return null;
}
/** Moves a card from one pocket to another (swapping if the target is taken). */
export function swapSlots(pages: BinderPageCfg[], a: { page: number; slot: number }, b: { page: number; slot: number }): BinderPageCfg[] {
  const va = pages[a.page]?.slots[a.slot] ?? null, vb = pages[b.page]?.slots[b.slot] ?? null;
  return setSlot(setSlot(pages, a.page, a.slot, vb), b.page, b.slot, va);
}
