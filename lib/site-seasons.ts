import type { Season } from './types';
import { getActiveSeason, listSeasons as listAllSeasons } from './kv';

/** Seasons the public can see (drafts are hidden), newest first. */
export async function listSeasons(): Promise<Season[]> {
  return (await listAllSeasons()).filter(s => s.status === 'published').sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Which season a public page should show: the requested one if it exists and is published, else the
 * active season, else the newest published season.
 */
export async function getActive(requestedId?: string): Promise<{ season: Season | null; seasons: Season[] }> {
  const seasons = await listSeasons();
  const requested = requestedId ? seasons.find(s => s.id === requestedId) : undefined;
  const season = requested ?? (await getActiveSeason()) ?? seasons[0] ?? null;
  return { season, seasons };
}
