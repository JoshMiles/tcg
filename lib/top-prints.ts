import { copyId } from './serials-core';
import { getCopy } from './serials';
import { topPrintHref } from './copy-link';
import type { UserStats } from './user-stats';

/** The link of each "Most valuable prints" row, in order (looks up the unique edition number of the numbered ones). */
export async function topPrintLinks(season: { id: string; collectionName: string }, rows: UserStats['topCopies']): Promise<string[]> {
  return Promise.all(rows.map(async r => {
    const uid = r.serial ? (await getCopy(season.collectionName, copyId(r.card.number, r.variant, r.serial)).catch(() => null))?.uid : undefined;
    return topPrintHref(r, season.id, uid);
  }));
}
