// The collection binder's page layout (pure, client-safe). A binder is a cover followed by pages of pockets (3x3 by default,
// up to 4x4), either built automatically (a pack at a time, in set order) or placed by hand (see lib/binder-config.ts), shown two
// pages at a time on wide screens and one on phones.

import { capacity, reflowPages, type BinderConfig, type BinderPageCfg, type BinderSort } from './binder-config';
import type { Variant } from './types';

export const POCKETS = 9;

export interface BinderPage {
  kind: 'cover' | 'cards';
  pack?: string;
  /** Page number within its pack (1-based) and how many pages the pack has. */
  part?: number;
  parts?: number;
  /** Indexes into the card list, null for an empty pocket. */
  slots: (number | null)[];
  /** Custom pages: the version pinned in each pocket (null = best owned). */
  pins?: (Variant | null)[];
  /** Custom pages: this page's index in the saved config, so the editor knows which page a pocket belongs to. */
  cfgIndex?: number;
  /** Custom pages: the page's own title. */
  title?: string;
}

export interface BinderCardInfo { packName: string; number: number; stars?: number; name?: string; owned?: boolean }

export interface AutoOptions { cap?: number; sort?: BinderSort; group?: boolean; hideUncollected?: boolean }

function ordered(idx: number[], cards: BinderCardInfo[], sort: BinderSort): number[] {
  const byNumber = (a: number, b: number) => cards[a].number - cards[b].number;
  const cmp: Record<BinderSort, (a: number, b: number) => number> = {
    number: byNumber,
    rarity: (a, b) => (cards[b].stars ?? 0) - (cards[a].stars ?? 0) || byNumber(a, b),
    name: (a, b) => (cards[a].name ?? '').localeCompare(cards[b].name ?? '') || byNumber(a, b),
    collected: (a, b) => Number(!!cards[b].owned) - Number(!!cards[a].owned) || byNumber(a, b),
  };
  return idx.slice().sort(cmp[sort]);
}

/** Packs in the order they first appear, each pack's cards sorted (by card number unless asked otherwise), `cap` to a page, after a cover. */
export function buildBinderPages(cards: BinderCardInfo[], opts: AutoOptions = {}): BinderPage[] {
  const cap = Math.max(1, opts.cap ?? POCKETS);
  const sort = opts.sort ?? 'number';
  const group = opts.group ?? true;
  const keep = cards.map((c, i) => i).filter(i => !opts.hideUncollected || cards[i].owned !== false);
  const groups: { name: string; idx: number[] }[] = [];
  if (group) {
    for (const i of keep) {
      let g = groups.find(x => x.name === cards[i].packName);
      if (!g) groups.push(g = { name: cards[i].packName, idx: [] });
      g.idx.push(i);
    }
  } else if (keep.length) groups.push({ name: 'All cards', idx: keep });
  const pages: BinderPage[] = [{ kind: 'cover', slots: [] }];
  for (const g of groups) {
    const idx = ordered(g.idx, cards, sort);
    const parts = Math.max(1, Math.ceil(idx.length / cap));
    for (let p = 0; p < parts; p++) {
      const slice: (number | null)[] = idx.slice(p * cap, (p + 1) * cap);
      while (slice.length < cap) slice.push(null);
      pages.push({ kind: 'cards', pack: g.name, part: p + 1, parts, slots: slice });
    }
  }
  return pages;
}

/** The automatic layout as editable pages (what "Start from my collection" fills the hand-made binder with). */
export function autoFillPages(cards: BinderCardInfo[], cfg: Pick<BinderConfig, 'cols' | 'rows' | 'sort' | 'groupByPack' | 'hideUncollected'>): BinderPageCfg[] {
  const pages = buildBinderPages(cards, { cap: capacity(cfg), sort: cfg.sort, group: cfg.groupByPack, hideUncollected: cfg.hideUncollected });
  return pages.filter(p => p.kind === 'cards').map(p => ({
    title: (p.parts ?? 1) > 1 ? `${p.pack} ${p.part}/${p.parts}` : p.pack ?? '',
    slots: p.slots.map(i => (i === null ? null : { card: cards[i].number, variant: null })),
  }));
}

/** The hand-made pages: each pocket's card number becomes an index into the card list (a number that isn't in the season is an empty pocket). */
export function buildCustomPages(cards: { number: number }[], pages: BinderPageCfg[], cap: number): BinderPage[] {
  const byNumber = new Map<number, number>();
  cards.forEach((c, i) => { if (!byNumber.has(c.number)) byNumber.set(c.number, i); });
  const out: BinderPage[] = [{ kind: 'cover', slots: [] }];
  reflowPages(pages, cap).forEach((p, k) => {
    const slots = p.slots.map(s => (s ? byNumber.get(s.card) ?? null : null));
    out.push({ kind: 'cards', pack: p.title, title: p.title, cfgIndex: k, slots, pins: p.slots.map(s => (s && byNumber.has(s.card) ? s.variant : null)) });
  });
  return out;
}

export interface Spread { left?: BinderPage; right?: BinderPage; /** Page numbers shown (1-based, cover = 1) for the label. */ label: string }

/**
 * What is on view at each position. Two-page mode opens on the cover alone (its right side), then pairs of pages like a real book.
 * One-page mode shows a page at a time.
 */
export function buildSpreads(pages: BinderPage[], double: boolean): Spread[] {
  if (!double) return pages.map((p, i) => ({ right: p, label: `Page ${i + 1} of ${pages.length}` }));
  const out: Spread[] = [{ right: pages[0], label: `Cover` }];
  for (let i = 1; i < pages.length; i += 2) {
    const a = pages[i], b = pages[i + 1];
    out.push({ left: a, right: b, label: b ? `Pages ${i + 1}-${i + 2} of ${pages.length}` : `Page ${i + 1} of ${pages.length}` });
  }
  return out;
}

/** Which spread a page index lives in (so a pack's name can jump to it). */
export function spreadOfPage(pageIndex: number, double: boolean): number {
  return double ? (pageIndex === 0 ? 0 : Math.ceil(pageIndex / 2)) : pageIndex;
}

/** Keeps a spread number on the book. */
export const clampSpread = (n: number, count: number) => Math.max(0, Math.min(Math.max(0, count - 1), Math.floor(n)));
