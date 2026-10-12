import { VARIANTS, type VariantCounts } from './variants';
import type { Variant } from './types';

// Filtering, sorting and per-pack progress for the profile's Collection tab (pure, client-safe).

export type ShowFilter = 'default' | 'all' | 'owned' | 'missing' | 'dupes' | 'versions' | 'theyHave' | 'iHave' | 'shared';
export type SortKey = 'number' | 'rarity' | 'value' | 'copies' | 'name';

export interface ViewCard {
  number: number; name: string; stars: number; packName: string;
  counts: VariantCounts; values: Record<Variant, number>;
  /** Points the viewer's low serial numbers add to this card (see lib/leaderboard.ts). */
  serial?: { points: number };
}
export interface ViewState { show: ShowFilter; q: string; stars: number; pack: string; sort: SortKey; dir: 1 | -1 }

export const DEFAULT_VIEW: ViewState = { show: 'default', q: '', stars: 0, pack: '', sort: 'number', dir: 1 };

export const SHOW_LABELS: Record<ShowFilter, string> = {
  default: 'Collected', all: 'Everything', owned: 'Collected', missing: 'Still missing', dupes: 'Duplicates (2+ copies)', versions: 'Special versions',
  theyHave: 'They have, I lack', iHave: 'I have, they lack', shared: 'We both have',
};
export const SORT_LABELS: Record<SortKey, string> = { number: 'Card number', rarity: 'Rarity', value: 'Points', copies: 'Copies', name: 'Name' };

export const copiesOf = (c: VariantCounts) => VARIANTS.reduce((s, v) => s + c[v], 0);
export const pointsOf = (c: ViewCard) => VARIANTS.reduce((s, v) => s + c.counts[v] * c.values[v], 0) + (c.serial?.points ?? 0);

/** Which cards show, in which order: indexes into `cards`. `mine` = the signed-in viewer's copies per card number (only when comparing). */
export function applyView(cards: ViewCard[], view: ViewState, opts: { hideUncollected: boolean; mine?: Record<number, number> }): number[] {
  const q = view.q.trim().toLowerCase();
  const mine = opts.mine ?? {};
  const keep = (c: ViewCard): boolean => {
    const n = copiesOf(c.counts);
    if (view.stars && c.stars !== view.stars) return false;
    if (view.pack && c.packName !== view.pack) return false;
    if (q && !(c.name.toLowerCase().includes(q) || String(c.number) === q.replace('#', ''))) return false;
    const m = mine[c.number] ?? 0;
    switch (view.show) {
      case 'default': return opts.hideUncollected ? n > 0 : true;
      case 'all': return true;
      case 'owned': return n > 0;
      case 'missing': return n === 0;
      case 'dupes': return n > 1;
      case 'versions': return VARIANTS.some(v => v !== 'regular' && c.counts[v] > 0);
      case 'theyHave': return n > 0 && m === 0;
      case 'iHave': return m > 0 && n === 0;
      case 'shared': return n > 0 && m > 0;
    }
  };
  const idx = cards.map((_, i) => i).filter(i => keep(cards[i]));
  const key = (c: ViewCard): number | string => {
    switch (view.sort) {
      case 'rarity': return c.stars;
      case 'value': return pointsOf(c);
      case 'copies': return copiesOf(c.counts);
      case 'name': return c.name.toLowerCase();
      default: return c.number;
    }
  };
  // Descending is the natural direction for rarity / points / copies.
  const nat: 1 | -1 = view.sort === 'rarity' || view.sort === 'value' || view.sort === 'copies' ? -1 : 1;
  const sign = nat * view.dir;
  return idx.sort((a, b) => {
    const ka = key(cards[a]), kb = key(cards[b]);
    const cmp = ka < kb ? -1 : ka > kb ? 1 : 0;
    return cmp !== 0 ? cmp * sign : cards[a].number - cards[b].number;
  });
}

export interface PackProgress { pack: string; owned: number; total: number; pct: number }

/** Owned / total per pack, in order of first appearance. */
export function packProgress(cards: ViewCard[]): PackProgress[] {
  const map = new Map<string, { owned: number; total: number }>();
  for (const c of cards) {
    const p = map.get(c.packName) ?? { owned: 0, total: 0 };
    p.total++; if (copiesOf(c.counts) > 0) p.owned++;
    map.set(c.packName, p);
  }
  return [...map.entries()].map(([pack, p]) => ({ pack, ...p, pct: p.total ? Math.round((p.owned / p.total) * 100) : 0 }));
}

export interface Comparison { shared: number; theyHave: number; iHave: number; both: number; total: number }

/** How two collections relate, by card (variants ignored). */
export function compareCollections(cards: ViewCard[], mine: Record<number, number>): Comparison {
  let shared = 0, theyHave = 0, iHave = 0;
  for (const c of cards) {
    const t = copiesOf(c.counts) > 0, m = (mine[c.number] ?? 0) > 0;
    if (t && m) shared++; else if (t) theyHave++; else if (m) iHave++;
  }
  return { shared, theyHave, iHave, both: shared + theyHave + iHave, total: cards.length };
}
