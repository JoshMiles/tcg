import type { Card } from './types';

export interface Rarity {
  stars: number;
  label: string;
  /** Tailwind text color class */
  text: string;
  /** Tailwind background class for bars */
  bar: string;
  /** Hex color for inline styles (borders, glows) */
  hex: string;
}

// Ordered rarest → most common.
export const RARITIES: Rarity[] = [
  { stars: 5, label: 'Legendary', text: 'text-amber-400',  bar: 'bg-amber-500',  hex: '#f59e0b' },
  { stars: 4, label: 'Epic',      text: 'text-purple-400', bar: 'bg-purple-500', hex: '#a855f7' },
  { stars: 3, label: 'Rare',      text: 'text-blue-400',   bar: 'bg-blue-500',   hex: '#3b82f6' },
  { stars: 2, label: 'Uncommon',  text: 'text-green-400',  bar: 'bg-green-500',  hex: '#22c55e' },
  { stars: 1, label: 'Common',    text: 'text-gray-400',   bar: 'bg-gray-600',   hex: '#6b7280' },
];

export function getRarity(stars: number): Rarity | undefined {
  return RARITIES.find(r => r.stars === stars);
}

export interface RarityStat extends Rarity {
  count: number;
  /** Share of total draw probability, rounded to a whole percent */
  pct: number;
}

/** Per-rarity card count and probability share. Tiers with no cards are omitted unless `includeEmpty`. */
export function rarityStats(cards: Card[], { includeEmpty = false } = {}): RarityStat[] {
  const total = cards.reduce((s, c) => s + c.probability, 0);
  return RARITIES.map(r => {
    const tier = cards.filter(c => c.stars === r.stars);
    const prob = tier.reduce((s, c) => s + c.probability, 0);
    return { ...r, count: tier.length, pct: total > 0 ? Math.round((prob / total) * 100) : 0 };
  }).filter(r => includeEmpty || r.count > 0);
}
