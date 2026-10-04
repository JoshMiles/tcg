/** Pull count per card number. The stored collection array keeps duplicates (one entry per pull). */
export function countPulls(owned: number[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const n of owned) counts.set(n, (counts.get(n) ?? 0) + 1);
  return counts;
}

/** Number of distinct cards owned — what completion % should be based on (duplicates don't count). */
export function uniqueCount(owned: number[]): number {
  return new Set(owned).size;
}
