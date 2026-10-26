import { cleanLogin } from './staff-core';
import type { Card, OptionalVariant, Pack, UpgradeCosts, Variant, VariantWeights } from './types';

export const VARIANTS: readonly Variant[] = ['regular', 'reverse', 'full', 'shiny', 'golden'];

export const VARIANT_LABELS: Record<Variant, string> = {
  regular: 'Regular',
  reverse: 'Reverse Holo',
  full: 'Full Art',
  shiny: 'Full Art Holo',
  golden: 'Golden',
};

/** Full Art, Full Art Holo and Golden all use the card's full-art image when present. */
export const usesFullArt = (v: Variant): boolean => v === 'full' || v === 'shiny' || v === 'golden';

export const DEFAULT_VARIANT_WEIGHTS: VariantWeights = { regular: 100, reverse: 25, full: 5, shiny: 1, golden: 0 };
export const DEFAULT_UPGRADE_COSTS: UpgradeCosts = { reverse: 5, full: 3, shiny: 3, golden: 3 };

/**
 * A collection entry is a plain number: `cardNumber + VARIANT_OFFSET * variantIndex`.
 * Regular entries are just the card number, so every pre-upgrade collection is already valid.
 * Mirrored in public/widget.js and public/twitch-panel/panel.js (no build step there), keep in sync.
 * Card numbers must stay below VARIANT_OFFSET.
 */
export const VARIANT_OFFSET = 1_000_000;

export function encodeEntry(cardNumber: number, variant: Variant = 'regular'): number {
  return cardNumber + VARIANT_OFFSET * VARIANTS.indexOf(variant);
}

export function decodeEntry(entry: number): { cardNumber: number; variant: Variant } {
  const idx = Math.min(Math.floor(entry / VARIANT_OFFSET), VARIANTS.length - 1);
  return { cardNumber: entry - idx * VARIANT_OFFSET, variant: VARIANTS[idx] };
}

/**
 * Checks a whole-collection body at the trust boundary: an object of Twitch logins to arrays of valid entries
 * (a card number from 1 with a known variant). Returns the collection, or why it is not one.
 */
export function parseCollectionData(data: unknown): { ok: true; data: Record<string, number[]> } | { ok: false; error: string } {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, error: 'data must be an object of usernames to card lists' };
  for (const [name, entries] of Object.entries(data)) {
    if (cleanLogin(name) !== name) return { ok: false, error: `"${name}" is not a lower-case Twitch username` };
    if (!Array.isArray(entries)) return { ok: false, error: `${name}: cards must be a list` };
    for (const e of entries) {
      if (!Number.isInteger(e) || e < 1 || e >= VARIANT_OFFSET * VARIANTS.length || e % VARIANT_OFFSET === 0) {
        return { ok: false, error: `${name}: ${JSON.stringify(e)} is not a card entry` };
      }
    }
  }
  return { ok: true, data: data as Record<string, number[]> };
}

export type VariantCounts = Record<Variant, number>;

export function emptyCounts(): VariantCounts {
  return { regular: 0, reverse: 0, full: 0, shiny: 0, golden: 0 };
}

/** Per-card copy counts split by variant. */
export function countVariants(owned: number[]): Map<number, VariantCounts> {
  const map = new Map<number, VariantCounts>();
  for (const entry of owned) {
    const { cardNumber, variant } = decodeEntry(entry);
    const counts = map.get(cardNumber) ?? emptyCounts();
    counts[variant]++;
    map.set(cardNumber, counts);
  }
  return map;
}

export function nextVariant(variant: Variant): Variant | null {
  return VARIANTS[VARIANTS.indexOf(variant) + 1] ?? null;
}

/** Whether pulls roll variants and the card can be upgraded. Trainer cards never roll variants or upgrade. */
export function upgradesAllowed(pack: Pick<Pack, 'upgradesEnabled'>, card: Pick<Card, 'upgradesEnabled' | 'kind'>): boolean {
  return pack.upgradesEnabled && card.kind !== 'trainer' && card.upgradesEnabled !== false;
}

/** Keeps only real, switch-off-able variant ids (unknown values and "regular" are dropped), in ladder order, no repeats. */
export function cleanDisabled(input: unknown): OptionalVariant[] {
  const list = Array.isArray(input) ? input : [];
  return VARIANTS.filter((v): v is OptionalVariant => v !== 'regular' && list.includes(v));
}

/** The variants this card can be pulled as / upgraded to in this pack: Regular plus whatever neither the pack nor the card switched off. */
export function allowedVariants(pack: Pick<Pack, 'disabledVariants'>, card?: Pick<Card, 'disabledVariants' | 'kind' | 'upgradesEnabled'>): Variant[] {
  if (card?.kind === 'trainer' || card?.upgradesEnabled === false) return ['regular'];
  const off = new Set<string>([...(pack.disabledVariants ?? []), ...(card?.disabledVariants ?? [])]);
  return VARIANTS.filter(v => v === 'regular' || !off.has(v));
}

/** The pack's roll weights with the variants that are off for this pack / card zeroed. */
export function effectiveWeights(pack: Pick<Pack, 'variantWeights' | 'disabledVariants'>, card?: Pick<Card, 'disabledVariants' | 'kind' | 'upgradesEnabled'>): VariantWeights {
  const allowed = allowedVariants(pack, card);
  const w = { ...pack.variantWeights };
  for (const v of VARIANTS) if (!allowed.includes(v)) w[v] = 0;
  return w;
}

/**
 * Where an upgrade from `from` goes: the next variant up that is switched on. Skipping a switched-off variant does not
 * make it cheaper: the cost is the product of every step crossed (regular → full with Reverse off costs reverse × full
 * regular copies, exactly what crafting through it would take). Null when there is nothing above to upgrade to.
 */
export function upgradeStep(
  pack: Pick<Pack, 'disabledVariants' | 'upgradeCosts'>,
  card: Pick<Card, 'disabledVariants' | 'kind' | 'upgradesEnabled'> | undefined,
  from: Variant,
): { to: Variant; cost: number } | null {
  if (card?.kind === 'trainer' || card?.upgradesEnabled === false) return null;
  const allowed = allowedVariants(pack, card);
  let cost = 1;
  for (let i = VARIANTS.indexOf(from) + 1; i < VARIANTS.length; i++) {
    const v = VARIANTS[i];
    cost *= Math.max(1, pack.upgradeCosts[v as OptionalVariant] ?? 1);
    if (allowed.includes(v)) return { to: v, cost };
  }
  return null;
}

/** Weighted variant roll. Weights are relative, so 100/25/5/1 means ~76.6% regular. */
export function rollVariant(weights: VariantWeights, rand: () => number = Math.random): Variant {
  const total = VARIANTS.reduce((sum, v) => sum + Math.max(0, weights[v]), 0);
  if (total <= 0) return 'regular';
  let r = rand() * total;
  for (const v of VARIANTS) {
    r -= Math.max(0, weights[v]);
    if (r < 0) return v;
  }
  return 'regular';
}

/** Removes `n` copies of one entry (first occurrences). Returns null if fewer than `n` exist. */
export function removeEntries(owned: number[], entry: number, n: number): number[] | null {
  if (owned.filter(e => e === entry).length < n) return null;
  const result: number[] = [];
  let left = n;
  for (const e of owned) {
    if (e === entry && left > 0) left--;
    else result.push(e);
  }
  return result;
}
