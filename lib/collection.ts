import { decodeEntry } from './variants';

/**
 * Pull count per card number, across all variants. The stored collection array keeps duplicates (one entry
 * per pull); variant entries are decoded back to their card number so a card is one card regardless of variant.
 */
export function countPulls(owned: number[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const entry of owned) {
    const { cardNumber } = decodeEntry(entry);
    counts.set(cardNumber, (counts.get(cardNumber) ?? 0) + 1);
  }
  return counts;
}

/** Number of distinct cards owned, what completion % should be based on (duplicates and variants don't count). */
export function uniqueCount(owned: number[]): number {
  return new Set(owned.map(e => decodeEntry(e).cardNumber)).size;
}
