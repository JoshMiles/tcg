// Cleaning and checking what the admin forms send for a pack and its cards. Pure (no database), so the wizard's autosave, the pack
// settings form and the card forms all apply the SAME limits on the server, and a script can test them.
import type { OptionalVariant, Pack, UpgradeCosts, VariantWeights } from './types';
import { DEFAULT_UPGRADE_COSTS, DEFAULT_VARIANT_WEIGHTS, VARIANT_OFFSET, cleanDisabled } from './variants';

export interface PackInput {
  name: string;
  coverImageUrl: string;
  active: boolean;
  weight: number;
  accentColor: string;
  tearBorderColor: string;
  holoMinStars: number;
  cardTime: number;
  cooldownTime: number;
  soundVolume: number;
  upgradesEnabled: boolean;
  variantWeights: VariantWeights;
  upgradeCosts: UpgradeCosts;
  disabledVariants?: OptionalVariant[];
  /** Price per paid pull of this pack (ROADMAP 55.4f). 0 or missing = no override. */
  price?: number;
}

/** A finite number clamped into [min, max]; anything else (NaN, a missing field) becomes the fallback. */
export const num = (v: unknown, fallback: number, min = 0, max = Infinity) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
export const int = (v: unknown, fallback: number, min = 1) => Math.max(min, Math.floor(num(v, fallback)));
export const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.slice(0, max) : '');

export function defaultPackInput(name = ''): PackInput {
  return {
    name,
    coverImageUrl: '',
    active: true,
    weight: 1,
    accentColor: 'rgb(241,187,6)',
    tearBorderColor: 'rgb(218,163,18)',
    holoMinStars: 5,
    cardTime: 3,
    cooldownTime: 1,
    soundVolume: 1,
    upgradesEnabled: false,
    variantWeights: { ...DEFAULT_VARIANT_WEIGHTS },
    upgradeCosts: { ...DEFAULT_UPGRADE_COSTS },
    disabledVariants: [],
  };
}

export function cleanPackInput(i: PackInput): Omit<Pack, 'id' | 'createdAt' | 'status'> {
  const w = i.variantWeights ?? DEFAULT_VARIANT_WEIGHTS;
  const c = i.upgradeCosts ?? DEFAULT_UPGRADE_COSTS;
  const price = Math.floor(num(i.price, 0, 0, 1_000_000));
  return {
    name: str(i.name, 80).trim(),
    coverImageUrl: str(i.coverImageUrl),
    active: !!i.active,
    weight: num(i.weight, 1, 0.01),
    accentColor: str(i.accentColor, 60) || 'rgb(241,187,6)',
    tearBorderColor: str(i.tearBorderColor, 60) || 'rgb(218,163,18)',
    holoMinStars: Math.min(5, int(i.holoMinStars, 5)),
    cardTime: num(i.cardTime, 3, 1),
    cooldownTime: num(i.cooldownTime, 1, 0),
    soundVolume: num(i.soundVolume, 1, 0, 1),
    upgradesEnabled: !!i.upgradesEnabled,
    variantWeights: {
      regular: num(w.regular, DEFAULT_VARIANT_WEIGHTS.regular),
      reverse: num(w.reverse, DEFAULT_VARIANT_WEIGHTS.reverse),
      full: num(w.full, DEFAULT_VARIANT_WEIGHTS.full),
      shiny: num(w.shiny, DEFAULT_VARIANT_WEIGHTS.shiny),
      golden: num(w.golden, DEFAULT_VARIANT_WEIGHTS.golden),
    },
    upgradeCosts: {
      reverse: int(c.reverse, DEFAULT_UPGRADE_COSTS.reverse),
      full: int(c.full, DEFAULT_UPGRADE_COSTS.full),
      shiny: int(c.shiny, DEFAULT_UPGRADE_COSTS.shiny),
      golden: int(c.golden, DEFAULT_UPGRADE_COSTS.golden),
    },
    disabledVariants: cleanDisabled(i.disabledVariants),
    // The key is always there (undefined = none) so that `{ ...pack, ...clean }` clears a price that was removed.
    price: price >= 1 ? price : undefined,
  };
}

/** The highest card number a pack may use: entries are `number + 1,000,000 x version`, so a number must stay below the offset. */
export const MAX_CARD_NUMBER = VARIANT_OFFSET - 1;

export interface CardFields {
  name: string;
  stars: number;
  probability: number;
  number: number;
  kind?: 'collector' | 'trainer';
  buffId?: string;
}

export const cleanCardKind = (v: unknown): 'collector' | 'trainer' => (v === 'trainer' ? 'trainer' : 'collector');

/**
 * What is wrong with a card's fields, in plain words (empty = fine). `otherNumbers` are the numbers of the pack's OTHER cards: a
 * second card with the same number would share every viewer's copies with the first.
 */
export function cardProblems(c: CardFields, otherNumbers: number[]): string[] {
  const out: string[] = [];
  if (!str(c.name, 200).trim()) out.push('Give the card a name.');
  if (!Number.isInteger(c.stars) || c.stars < 1 || c.stars > 5) out.push('Stars must be a whole number from 1 to 5.');
  if (!Number.isFinite(c.probability) || c.probability < 0) out.push('Odds must be a number, 0 or more.');
  if (!Number.isInteger(c.number) || c.number < 1 || c.number > MAX_CARD_NUMBER) out.push(`The card number must be a whole number from 1 to ${MAX_CARD_NUMBER.toLocaleString('en-GB')}.`);
  else if (otherNumbers.includes(c.number)) out.push(`Another card in this pack is already #${c.number}, and viewers' editions would be shared between the two.`);
  if (c.kind === 'trainer' && !str(c.buffId, 60).trim()) out.push('Choose a buff for this trainer card.');
  return out;
}
