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
  default: 'Collected', all: 'Everything', owned: 'Collected', missing: 'Still missing', dupes: 'Duplicates (2+ prints)', versions: 'Special versions',
  theyHave: 'They have, I lack', iHave: 'I have, they lack', shared: 'We both have',
};
export const SORT_LABELS: Record<SortKey, string> = { number: 'Card number', rarity: 'Rarity', value: 'Points', copies: 'Prints', name: 'Name' };

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

export interface DialogGroup<T> { variant: Variant; /** How many prints of this version are owned. */ count: number; /** The tiles to show: edition ascending (newest edition last). Empty when the season's prints are not tracked. */ copies: T[] }
export interface DialogCopies<T> {
  /** Whether the season tracks individual prints (otherwise one tile per version with its count). */
  tracked: boolean;
  /** Versions in Regular, RH, FA, SH order; owned ones only. */
  groups: DialogGroup<T>[];
  /** Prints owned in all. */
  total: number;
  /** Tiles shown after the cap, and how many were left out. */
  shown: number; more: number;
  /** The one print when the card has exactly one tracked print: the dialog opens straight on it. */
  only: T | null;
}

/** How the card dialog lays out a card's prints: grouped by version, edition ascending, capped at `limit` tiles (pass Infinity for "Show all"). Pure. */
export function copiesForDialog<T extends { variant: Variant; n: number }>(copies: T[] | undefined, counts: VariantCounts, limit = 60): DialogCopies<T> {
  const list = copies ?? [];
  if (list.length === 0) {
    const groups = VARIANTS.filter(v => counts[v] > 0).map(v => ({ variant: v, count: counts[v], copies: [] as T[] }));
    const total = copiesOf(counts);
    return { tracked: false, groups, total, shown: groups.length, more: 0, only: null };
  }
  let left = Math.max(0, limit);
  let shown = 0;
  const groups: DialogGroup<T>[] = [];
  for (const v of VARIANTS) {
    const all = list.filter(c => c.variant === v).sort((a, b) => a.n - b.n);
    if (all.length === 0) continue;
    const take = all.slice(0, left);
    if (take.length === 0) continue; // cut off by the cap: shown under "Show all"
    left -= take.length; shown += take.length;
    groups.push({ variant: v, count: all.length, copies: take });
  }
  return { tracked: true, groups, total: list.length, shown, more: list.length - shown, only: list.length === 1 ? list[0] : null };
}

export interface PrintLike { id: string; card: number; variant: Variant; n: number }

/** The holder's best print of one card in one version: the lowest edition number (the biggest edition bonus). */
export function bestPrintOf<T extends PrintLike>(copies: T[], card: number, variant: Variant): T | undefined {
  let best: T | undefined;
  for (const c of copies) if (c.card === card && c.variant === variant && (!best || c.n < best.n)) best = c;
  return best;
}

/** The rarest prints a collector holds: one per card and version (their lowest edition of it), rarest first by `chance` (the odds of pulling
 * that card in that version), ties to the lower edition number, then the lower card number. Prints with no known chance are left out. */
export function rarestPrints<T extends PrintLike>(copies: T[], chance: (card: number, variant: Variant) => number, limit = 5): (T & { chance: number })[] {
  const best = new Map<string, T>();
  for (const c of copies) {
    const k = `${c.card}.${c.variant}`;
    const cur = best.get(k);
    if (!cur || c.n < cur.n) best.set(k, c);
  }
  return [...best.values()]
    .map(c => ({ ...c, chance: chance(c.card, c.variant) }))
    .filter(c => c.chance > 0)
    .sort((a, b) => a.chance - b.chance || a.n - b.n || a.card - b.card)
    .slice(0, limit);
}
