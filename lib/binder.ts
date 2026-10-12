// The collection binder's page layout (pure, client-safe). A binder is a cover followed by pages of 3x3 pockets, a pack at a time
// (every pack starts on a fresh page, in set order), shown two pages at a time on wide screens and one on phones.

export const POCKETS = 9;

export interface BinderPage {
  kind: 'cover' | 'cards';
  pack?: string;
  /** Page number within its pack (1-based) and how many pages the pack has. */
  part?: number;
  parts?: number;
  /** Indexes into the card list, null for an empty pocket. */
  slots: (number | null)[];
}

/** Packs in the order they first appear, each pack's cards by card number, nine to a page, after a cover. */
export function buildBinderPages(cards: { packName: string; number: number }[]): BinderPage[] {
  const packs: string[] = [];
  for (const c of cards) if (!packs.includes(c.packName)) packs.push(c.packName);
  const pages: BinderPage[] = [{ kind: 'cover', slots: [] }];
  for (const pack of packs) {
    const idx = cards.map((c, i) => ({ c, i })).filter(x => x.c.packName === pack).sort((a, b) => a.c.number - b.c.number).map(x => x.i);
    const parts = Math.max(1, Math.ceil(idx.length / POCKETS));
    for (let p = 0; p < parts; p++) {
      const slice: (number | null)[] = idx.slice(p * POCKETS, (p + 1) * POCKETS);
      while (slice.length < POCKETS) slice.push(null);
      pages.push({ kind: 'cards', pack, part: p + 1, parts, slots: slice });
    }
  }
  return pages;
}

export interface Spread { left?: BinderPage; right?: BinderPage; /** Page numbers shown (1-based, cover = 1) for the label. */ label: string }

/**
 * What is on view at each position. Two-page mode opens on the cover alone (its right side), then pairs of pages like a real book.
 * One-page mode shows a page at a time.
 */
export function buildSpreads(pages: BinderPage[], double: boolean): Spread[] {
  if (!double) return pages.map((p, i) => ({ right: p, label: `Page ${i + 1} of ${pages.length}` }));
  const out: Spread[] = [{ right: pages[0], label: `Cover` }];
  for (let i = 1; i < pages.length; i += 2) {
    const a = pages[i], b = pages[i + 1];
    out.push({ left: a, right: b, label: b ? `Pages ${i + 1}-${i + 2} of ${pages.length}` : `Page ${i + 1} of ${pages.length}` });
  }
  return out;
}

/** Which spread a page index lives in (so a pack's name can jump to it). */
export function spreadOfPage(pageIndex: number, double: boolean): number {
  return double ? (pageIndex === 0 ? 0 : Math.ceil(pageIndex / 2)) : pageIndex;
}

/** Keeps a spread number on the book. */
export const clampSpread = (n: number, count: number) => Math.max(0, Math.min(Math.max(0, count - 1), Math.floor(n)));
