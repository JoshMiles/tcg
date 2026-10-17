// The Odds view's pure maths (ROADMAP 20.2d): normalise, balance by rarity and the draw simulator. Client-safe; the view feeds it the
// UNSAVED weights from the workspace, so what is simulated is what a save would store.
import type { Variant } from './types';
import { VARIANTS } from './variants';

export interface OddsCard { id: string; stars: number; probability: number }
export type VariantWeights = Record<Variant, number>;

export const TIER_DEFAULTS: Record<number, number> = { 5: 2, 4: 8, 3: 20, 2: 30, 1: 40 };

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

/** Every weight scaled so they add up to 100 (unchanged when the total is 0). */
export function normalizeWeights(cards: OddsCard[]): Record<string, number> {
  const total = cards.reduce((s, c) => s + (c.probability > 0 ? c.probability : 0), 0);
  return Object.fromEntries(cards.map(c => [c.id, total > 0 ? r4((Math.max(0, c.probability) / total) * 100) : c.probability]));
}

/** Each rarity gets its target share of all pulls, split equally among its cards. `targets` is stars -> wanted share (any scale). */
export function balanceByRarity(cards: OddsCard[], targets: Record<number, number>): Record<string, number> {
  const count = new Map<number, number>();
  for (const c of cards) count.set(c.stars, (count.get(c.stars) ?? 0) + 1);
  const want = (s: number) => Math.max(0, Number(targets[s]) || 0);
  const sum = [...count.keys()].reduce((t, s) => t + want(s), 0) || 1;
  return Object.fromEntries(cards.map(c => [c.id, r4(((want(c.stars) / sum) * 100) / (count.get(c.stars) ?? 1))]));
}

/** Cumulative draw: returns a function that picks an index by weight (-1 when nothing can be drawn). */
export function makePicker(weights: number[], random: () => number = Math.random): () => number {
  const cum: number[] = [];
  let t = 0;
  for (const w of weights) { t += Math.max(0, w); cum.push(t); }
  return () => {
    if (t <= 0) return -1;
    const r = random() * t;
    let lo = 0, hi = cum.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] > r) hi = mid; else lo = mid + 1; }
    return lo;
  };
}

export interface SimResult {
  draws: number;
  perCard: Record<string, number>;
  perStars: Record<number, number>;
  perVariant: Record<Variant, number>;
  found: number;
  fullSet: { median: number; p90: number } | null;
}

/** Draws `runs` packs (one card and, with upgrades on, one variant roll each) and how many packs it takes to see every card once. */
export function simulate(cards: OddsCard[], variantWeights: (id: string) => VariantWeights | undefined, upgrades: boolean, runs: number, random: () => number = Math.random): SimResult | null {
  const pick = makePicker(cards.map(c => c.probability), random);
  if (pick() < 0) return null;
  const perCard: Record<string, number> = {};
  const perStars: Record<number, number> = {};
  const perVariant = Object.fromEntries(VARIANTS.map(v => [v, 0])) as Record<Variant, number>;
  const variantPickers = new Map<string, () => number>();
  const pickVariant = (c: OddsCard): Variant => {
    if (!upgrades) return 'regular';
    let p = variantPickers.get(c.id);
    if (!p) { const w = variantWeights(c.id); p = makePicker(VARIANTS.map(v => w?.[v] ?? 0), random); variantPickers.set(c.id, p); }
    const i = p();
    return VARIANTS[i < 0 ? 0 : i];
  };
  for (let i = 0; i < runs; i++) {
    const c = cards[pick()];
    perCard[c.id] = (perCard[c.id] ?? 0) + 1;
    perStars[c.stars] = (perStars[c.stars] ?? 0) + 1;
    perVariant[pickVariant(c)]++;
  }
  const reachable = cards.filter(c => c.probability > 0).length;
  const trials: number[] = [];
  for (let t = 0; t < 300; t++) {
    const seen = new Set<number>();
    let n = 0;
    while (seen.size < reachable && n < 20_000) { seen.add(pick()); n++; }
    trials.push(n);
  }
  trials.sort((a, b) => a - b);
  return { draws: runs, perCard, perStars, perVariant, found: Object.keys(perCard).length, fullSet: reachable > 0 ? { median: trials[Math.floor(trials.length / 2)], p90: trials[Math.floor(trials.length * 0.9)] } : null };
}
