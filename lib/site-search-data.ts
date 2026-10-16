import { currentSandboxId } from './db';
import { getActiveSeasonWithPacks, getCollection } from './kv';
import { getHiddenUsers } from './user-admin';
import { stillFor } from './card-art';
import { createTtlCache } from './ttl-cache';
import { buildEntityItems, rankSearch, type SearchItem } from './site-search';
import { findByUid } from './serials';
import { parseUid } from './serials-core';

// The server side of the public search: the active season's collectors and cards, kept for a short while (per server instance and
// per sandbox) so typing in the search box doesn't read the whole collection on every keystroke.

const viewerCache = createTtlCache<string[]>(30_000);
const cardCache = createTtlCache<{ number: number; name: string; stars: number; thumb?: string }[]>(60_000);

export async function searchPublic(query: string, limit = 9): Promise<SearchItem[]> {
  // A unique copy number ("#1023381"): offer that copy when it exists.
  const uid = parseUid(query);
  if (uid) {
    const hit = await findByUid(uid);
    return hit ? [{ id: `copy:${uid}`, kind: 'copy', label: `Print #${uid}`, href: `/c/${uid}`, hint: 'Card print' }] : [];
  }
  const box = (await currentSandboxId().catch(() => null)) ?? 'prod';
  const active = await getActiveSeasonWithPacks();
  if (!active) return [];
  const [usernames, cards, hidden] = await Promise.all([
    viewerCache.get(`${box}:${active.season.id}`, async () => Object.keys(await getCollection(active.season.collectionName))),
    cardCache.get(`${box}:${active.season.id}`, async () => active.packs.flatMap(p => p.cards.map(c => ({ number: c.number, name: c.name, stars: c.stars, thumb: stillFor(c, c.imageUrl) })))),
    getHiddenUsers().catch(() => new Set<string>()),
  ]);
  return rankSearch(buildEntityItems(usernames, hidden, cards), query, limit);
}
