// Filtering and sorting for the Card Dex (pure, client-safe).

export type DexShow = 'all' | 'collected' | 'missing' | 'wanted' | 'undiscovered';
export type DexSort = 'number' | 'rarity' | 'value' | 'copies' | 'collectors' | 'name' | 'missing';

export const SORT_LABELS: Record<DexSort, string> = {
  number: 'Card number', rarity: 'Rarest first', value: 'Most valuable', copies: 'Most pulled', collectors: 'Most collectors', name: 'Name', missing: 'Missing first',
};

export interface DexRow {
  number: number; name: string; stars: number; packName: string; pullRate: number; copies: number; collectors: number;
  /** Points of one Regular copy. */
  value: number;
  owned?: boolean;
  wanted?: boolean;
}

export interface DexFilter { q: string; stars: number | null; pack: string; show: DexShow; sort: DexSort; dir: 1 | -1 }
export const DEFAULT_DEX: DexFilter = { q: '', stars: null, pack: '', show: 'all', sort: 'number', dir: 1 };

/** The natural direction of each sort (rarest, most valuable, most pulled and most collectors lead with the biggest). */
const NATURAL: Record<DexSort, 1 | -1> = { number: 1, rarity: 1, value: -1, copies: -1, collectors: -1, name: 1, missing: 1 };

export function applyDex<T extends DexRow>(cards: T[], f: DexFilter): T[] {
  const q = f.q.trim().toLowerCase();
  const keep = (c: T): boolean => {
    if (f.stars !== null && c.stars !== f.stars) return false;
    if (f.pack && c.packName !== f.pack) return false;
    if (q && !(c.name.toLowerCase().includes(q) || String(c.number) === q.replace('#', ''))) return false;
    switch (f.show) {
      case 'collected': return !!c.owned;
      case 'missing': return !c.owned;
      case 'wanted': return !!c.wanted;
      case 'undiscovered': return c.copies === 0;
      default: return true;
    }
  };
  const key = (c: T): number | string => {
    switch (f.sort) {
      case 'rarity': return c.pullRate;          // a smaller pull rate = rarer
      case 'value': return c.value;
      case 'copies': return c.copies;
      case 'collectors': return c.collectors;
      case 'name': return c.name.toLowerCase();
      case 'missing': return c.owned ? 1 : 0;
      default: return c.number;
    }
  };
  const sign = NATURAL[f.sort] * f.dir;
  return cards.filter(keep).sort((a, b) => {
    const ka = key(a), kb = key(b);
    const cmp = ka < kb ? -1 : ka > kb ? 1 : 0;
    return cmp * sign || a.number - b.number;
  });
}

/** Owned of total, for the viewer's progress bar. */
export function dexProgress(cards: DexRow[]): { owned: number; total: number; pct: number } {
  const owned = cards.filter(c => c.owned).length;
  return { owned, total: cards.length, pct: cards.length ? Math.round((owned / cards.length) * 100) : 0 };
}
