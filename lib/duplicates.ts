import { VARIANTS, type VariantCounts } from './variants';
import type { Variant } from './types';

// Repeat editions: the same card in the same version, held more than once (pure, client-safe).

export interface Repeat { variant: Variant; count: number; /** What can go on the board while one edition stays. */ spare: number }

/** The versions of one card held twice or more, rarest version first. */
export const repeatsOf = (counts: VariantCounts): Repeat[] =>
  [...VARIANTS].reverse().filter(v => counts[v] > 1).map(v => ({ variant: v, count: counts[v], spare: counts[v] - 1 }));

/** Cards with at least one repeat, most spare editions first (ties by card number). */
export function duplicateGroups<T extends { number: number; counts: VariantCounts }>(cards: T[]): { card: T; repeats: Repeat[]; spare: number }[] {
  return cards
    .map(card => { const repeats = repeatsOf(card.counts); return { card, repeats, spare: repeats.reduce((s, r) => s + r.spare, 0) }; })
    .filter(g => g.repeats.length > 0)
    .sort((a, b) => b.spare - a.spare || a.card.number - b.card.number);
}
