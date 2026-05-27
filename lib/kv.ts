import { kv } from '@vercel/kv';
import type { Season, Card, Collection } from './types';

const SEASONS_KEY = 'seasons:list';

// ── Seasons ──────────────────────────────────────────────

export async function listSeasonIds(): Promise<string[]> {
  return (await kv.get<string[]>(SEASONS_KEY)) ?? [];
}

export async function listSeasons(): Promise<Season[]> {
  const ids = await listSeasonIds();
  const seasons = await Promise.all(ids.map(id => kv.get<Season>(`season:${id}`)));
  return seasons.filter((s): s is Season => s !== null);
}

export async function getSeason(id: string): Promise<Season | null> {
  return kv.get<Season>(`season:${id}`);
}

export async function getActiveSeason(): Promise<Season | null> {
  const seasons = await listSeasons();
  return seasons.find(s => s.active) ?? null;
}

export async function getActiveSeasonWithCards(): Promise<{ season: Season; cards: Card[] } | null> {
  const season = await getActiveSeason();
  if (!season) return null;
  const cards = await getSeasonCards(season.id);
  return { season, cards };
}

export async function saveSeason(season: Season): Promise<void> {
  await kv.set(`season:${season.id}`, season);
  const ids = await listSeasonIds();
  if (!ids.includes(season.id)) {
    await kv.set(SEASONS_KEY, [...ids, season.id]);
  }
}

export async function deleteSeason(id: string): Promise<void> {
  await Promise.all([
    kv.del(`season:${id}`),
    kv.del(`season:${id}:cards`),
  ]);
  const ids = await listSeasonIds();
  await kv.set(SEASONS_KEY, ids.filter(i => i !== id));
}

// ── Cards ─────────────────────────────────────────────────

export async function getSeasonCards(seasonId: string): Promise<Card[]> {
  return (await kv.get<Card[]>(`season:${seasonId}:cards`)) ?? [];
}

export async function saveSeasonCards(seasonId: string, cards: Card[]): Promise<void> {
  await kv.set(`season:${seasonId}:cards`, cards);
}

// ── Collections ───────────────────────────────────────────

export async function getCollection(collectionName: string): Promise<Collection> {
  return (await kv.get<Collection>(`tcg_${collectionName}`)) ?? {};
}

export async function saveCollection(collectionName: string, data: Collection): Promise<void> {
  await kv.set(`tcg_${collectionName}`, data);
}

export async function deleteCollection(collectionName: string): Promise<void> {
  await kv.del(`tcg_${collectionName}`);
}
