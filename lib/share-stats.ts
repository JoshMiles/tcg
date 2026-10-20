import type { Variant } from './types';
import { VARIANT_LABELS } from './variants';
import type { StatsCardShare } from './share-image';

// The figures on the "Share my stats" image (pure, client-safe): what the account page gives the stats card.

export interface StatsCardInput {
  rank: number | null;
  score: number;
  uniqueCards: number;
  totalCards: number;
  copies: number;
  /** The scoring setting: the completion bonus as a percentage of the set's value, reached at 100% of the cards. */
  completionBonusPct: number;
  /** Their prints with a ledger (empty when the season does not track prints). */
  prints: { card: number; variant: Variant; n: number }[];
  /** The chance of pulling that card in that version, 0 when unknown. */
  chance: (card: number, variant: Variant) => number;
  nameOf: (card: number) => string;
  hexOf: (card: number) => string | undefined;
  tradesCompleted: number;
}

/** Their rarest print: the lowest chance of a card in a version; ties go to the lower edition number. Null when nothing is known. */
export function rarestPrint(i: Pick<StatsCardInput, 'prints' | 'chance'>): { card: number; variant: Variant; n: number; chance: number } | null {
  let best: { card: number; variant: Variant; n: number; chance: number } | null = null;
  for (const p of i.prints) {
    const chance = i.chance(p.card, p.variant);
    if (!(chance > 0)) continue;
    if (!best || chance < best.chance || (chance === best.chance && (p.n < best.n || (p.n === best.n && p.card < best.card)))) best = { ...p, chance };
  }
  return best;
}

/** Everything the stats image draws besides the header and the strip of prints. */
export function buildStatsCard(i: StatsCardInput): StatsCardShare {
  const rarest = rarestPrint(i);
  const lowest = i.prints.reduce<number | null>((m, p) => (m === null || p.n < m ? p.n : m), null);
  const bonus = i.totalCards > 0 ? (i.completionBonusPct * i.uniqueCards) / i.totalCards : 0;
  return {
    rank: i.rank ? `#${i.rank}` : '-',
    score: Math.round(i.score).toLocaleString('en-US'),
    accent: rarest ? i.hexOf(rarest.card) : undefined,
    figures: [
      { label: 'Different cards', value: `${i.uniqueCards}/${i.totalCards}`, progress: i.totalCards > 0 ? i.uniqueCards / i.totalCards : 0 },
      { label: 'Editions', value: i.copies.toLocaleString('en-US') },
      { label: 'Progress bonus', value: `+${bonus.toFixed(1)}%`, sub: 'of the set value' },
      { label: 'Best edition', value: lowest === null ? '-' : `#${lowest}`, sub: lowest === null ? undefined : 'lowest held' },
      { label: 'Rarest edition', value: rarest ? i.nameOf(rarest.card) : '-', sub: rarest ? `${rarest.variant === 'regular' ? 'Regular' : VARIANT_LABELS[rarest.variant]} · 1 in ${Math.round(1 / rarest.chance).toLocaleString('en-US')}` : undefined },
      { label: 'Trades', value: String(i.tradesCompleted), sub: 'completed' },
    ],
  };
}
