// Packs a collector is 1 to 3 base cards from finishing, for the profile's "Close to complete" strip (pure, client-safe).
// "Owned" is the same test the profile's progress bars use: at least one copy of the base card, any version.

export interface ClosePack { packId: string; pack: string; owned: number; total: number; missing: { number: number; name: string }[] }

/** Packs with 1 to `maxMissing` cards left, fewest missing first (ties keep pack order), at most `limit` of them. */
export function closePacks(
  packs: { pack: { id: string; name: string }; cards: { number: number; name: string }[] }[],
  owned: { has(n: number): boolean },
  maxMissing = 3,
  limit = 3,
): ClosePack[] {
  return packs
    .map(({ pack, cards }) => {
      const missing = cards.filter(c => !owned.has(c.number)).map(c => ({ number: c.number, name: c.name }));
      return { packId: pack.id, pack: pack.name, owned: cards.length - missing.length, total: cards.length, missing };
    })
    .filter(p => p.owned > 0 && p.missing.length >= 1 && p.missing.length <= maxMissing) // a tiny pack you have not started is not "close"
    .sort((a, b) => a.missing.length - b.missing.length)
    .slice(0, limit);
}

/** The board link for the missing cards: listings that give any of them (`?give=1,2,3`). */
export function boardHrefForGive(numbers: number[], seasonId?: string): string {
  return `/trade?tab=board&give=${numbers.join(',')}${seasonId ? `&season=${encodeURIComponent(seasonId)}` : ''}`;
}

/** Card numbers from a `give` query value; junk and duplicates dropped, capped so a hand-made URL stays small. */
export function parseGive(raw: string | undefined): number[] {
  const out = new Set<number>();
  for (const s of (raw ?? '').split(',')) {
    const n = Number(s);
    if (Number.isInteger(n) && n > 0) out.add(n);
    if (out.size >= 12) break;
  }
  return [...out];
}
