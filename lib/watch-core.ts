import type { Variant } from './types';
import { VARIANT_LABELS } from './variants';
import type { UserSettings, Watch } from './user-settings';

// Listing alerts (pure, client-safe): which of a viewer's alerts a set of offered cards matches. A card on the Looking for list alerts
// in every version; a saved watch can name one version ("tell me when someone lists a Shiny Gouda").

export interface OfferedCard { cardNumber: number; variant: Variant }

/** The offered stacks this viewer has asked to hear about. */
export function matchingAlerts(s: Pick<UserSettings, 'wanted' | 'watches'>, items: OfferedCard[]): OfferedCard[] {
  return items.filter(i => s.wanted.includes(i.cardNumber) || s.watches.some(w => w.card === i.cardNumber && (w.variant === null || w.variant === i.variant)));
}

/** Every card number a viewer wants to hear about (the index key set). */
export function alertCards(s: Pick<UserSettings, 'wanted' | 'watches'>): number[] {
  return [...new Set([...s.wanted, ...s.watches.map(w => w.card)])];
}

/** "Shiny Full Art Gouda" / "Gouda (any version)". */
export function watchLabel(w: Watch, nameOf: (n: number) => string | undefined): string {
  const name = nameOf(w.card) ?? `#${w.card}`;
  return w.variant ? `${VARIANT_LABELS[w.variant]} ${name}` : `${name} (any version)`;
}

/**
 * How many viewers want each card a listing gives: the people on that card's watch list, minus the `exclude` logins (the lister, and the
 * trade's own recipient if it has one). Only cards with at least one are returned. Counts only, never names.
 */
export function wantedCounts(given: Pick<OfferedCard, 'cardNumber'>[], watchersByCard: Record<number, string[]>, exclude: string[] = []): Record<number, number> {
  const skip = new Set(exclude.map(u => u.toLowerCase()));
  const out: Record<number, number> = {};
  for (const { cardNumber } of given) {
    const n = new Set((watchersByCard[cardNumber] ?? []).map(u => u.toLowerCase()).filter(u => !skip.has(u))).size;
    if (n > 0) out[cardNumber] = n;
  }
  return out;
}
