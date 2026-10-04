/** Pull count per card number. The stored collection array keeps duplicates (one entry per pull). */
export function countPulls(owned: number[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const n of owned) counts.set(n, (counts.get(n) ?? 0) + 1);
  return counts;
}
