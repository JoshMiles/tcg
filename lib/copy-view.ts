import { getPackCards, getPacksForSeason, listSeasons } from './kv';
import { findByUid, getCopy } from './serials';
import type { Copy } from './serials-core';
import type { Card, Pack, Season } from './types';

/** A copy found by its unique number, with the season, pack and card it belongs to. Null when it, or its season, is gone or a draft. */
export async function loadCopyByUid(uid: number): Promise<{ season: Season; copy: Copy; pack: Pack; card: Card } | null> {
  const hit = await findByUid(uid);
  if (!hit) return null;
  const season = (await listSeasons()).find(s => s.collectionName === hit.collection && s.status !== 'draft');
  if (!season) return null;
  const copy = await getCopy(hit.collection, hit.copyId);
  if (!copy) return null;
  for (const pack of await getPacksForSeason(season)) {
    const card = (await getPackCards(pack.id)).find(c => c.number === copy.card);
    if (card) return { season, copy, pack, card };
  }
  return null;
}
