import { listSeasons } from '@/lib/kv';
import { cardProblems } from '@/lib/pack-clean';
import type { OptionalVariant, Variant } from '@/lib/types';
import { VARIANTS, DEFAULT_VARIANT_WEIGHTS, DEFAULT_UPGRADE_COSTS } from '@/lib/variants';
import type { ActionResult } from '../action-types';

// ── Upgrade/variant form parsing ──────────────────────────

export function parseVariant(raw: FormDataEntryValue | null): Variant {
  const v = String(raw ?? 'regular');
  return (VARIANTS as readonly string[]).includes(v) ? (v as Variant) : 'regular';
}

export function positiveInt(raw: FormDataEntryValue | null, fallback: number): number {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n >= 1 ? n : fallback;
}

export function nonNegative(raw: FormDataEntryValue | null, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export const OPTIONAL: OptionalVariant[] = ['reverse', 'full', 'shiny', 'golden'];

// A form that carries the variant switches (marker `variant_switches`) lists the ones that are ticked; a form without them
// leaves whatever is stored alone, so no other form can switch variants off by accident.
export function disabledFromForm(formData: FormData, fallback: OptionalVariant[] = []): OptionalVariant[] {
  if (formData.get('variant_switches') !== '1') return fallback;
  return OPTIONAL.filter(v => formData.get(`variant_on_${v}`) !== 'on');
}

export function upgradeSettings(formData: FormData) {
  return {
    upgradesEnabled: formData.get('upgradesEnabled') === 'on',
    ...(formData.get('variant_switches') === '1' && { disabledVariants: disabledFromForm(formData) }),
    variantWeights: {
      regular: nonNegative(formData.get('weight_regular'), DEFAULT_VARIANT_WEIGHTS.regular),
      reverse: nonNegative(formData.get('weight_reverse'), DEFAULT_VARIANT_WEIGHTS.reverse),
      full:    nonNegative(formData.get('weight_full'),    DEFAULT_VARIANT_WEIGHTS.full),
      shiny:   nonNegative(formData.get('weight_shiny'),   DEFAULT_VARIANT_WEIGHTS.shiny),
      golden:  nonNegative(formData.get('weight_golden'),  DEFAULT_VARIANT_WEIGHTS.golden),
    },
    upgradeCosts: {
      reverse: positiveInt(formData.get('cost_reverse'), DEFAULT_UPGRADE_COSTS.reverse),
      full:    positiveInt(formData.get('cost_full'),    DEFAULT_UPGRADE_COSTS.full),
      shiny:   positiveInt(formData.get('cost_shiny'),   DEFAULT_UPGRADE_COSTS.shiny),
      golden:  positiveInt(formData.get('cost_golden'),  DEFAULT_UPGRADE_COSTS.golden),
    },
  };
}

// ── Cards ─────────────────────────────────────────────────

/** Reads a card form into clean fields, or says what is wrong. `otherNumbers` are the pack's other cards' numbers. */
export function cardFromForm(formData: FormData, otherNumbers: number[], fallbackNumber: number, useFormNumber = true) {
  const numberRaw = useFormNumber ? formData.get('number') : null;
  const fields = {
    name: String(formData.get('name') ?? '').trim().slice(0, 80),
    stars: Number(formData.get('stars')),
    probability: Number(formData.get('probability')),
    number: numberRaw === null || String(numberRaw).trim() === '' ? fallbackNumber : Number(numberRaw),
  };
  return { fields, problems: cardProblems(fields, otherNumbers) };
}

export const withoutVariant = (list: OptionalVariant[] | undefined, v: OptionalVariant) => (list ?? []).filter(x => x !== v);
export const withVariant = (list: OptionalVariant[] | undefined, v: OptionalVariant) => [...new Set([...(list ?? []), v])];

export type BulkCardOp = 'upgrades-on' | 'upgrades-off' | 'fullart-off-without-art' | 'all-variants-on';

// ── Users ─────────────────────────────────────────────────

/** A server action is a public endpoint, so a collection name that arrives as an argument must be one of the seasons' own. */
export async function requireSeasonCollection(collectionName: string): Promise<void> {
  if (!(await listSeasons()).some(s => s.collectionName === collectionName)) throw new Error('That is not a season collection.');
}

export function cleanUsername(raw: FormDataEntryValue | null): string | null {
  const u = String(raw ?? '').trim().replace(/^@/, '').toLowerCase();
  return /^[a-z0-9_]{1,25}$/.test(u) ? u : null;
}

export const BAD_USERNAME: ActionResult = { ok: false, message: 'Enter a valid Twitch username (letters, numbers and underscores).' };
