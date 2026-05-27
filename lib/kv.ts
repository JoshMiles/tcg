import { kv } from '@vercel/kv';
import type { Season, Pack, Card, PullRecord } from './types';

// ── Seasons ───────────────────────────────────────────────

export async function listSeasonIds(): Promise<string[]> {
  return (await kv.get<string[]>('seasons:list')) ?? [];
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

export async function saveSeason(season: Season): Promise<void> {
  await kv.set(`season:${season.id}`, season);
  const ids = await listSeasonIds();
  if (!ids.includes(season.id)) {
    await kv.set('seasons:list', [...ids, season.id]);
  }
}

export async function deleteSeason(id: string): Promise<void> {
  const packIds = await listPackIds(id);
  await Promise.all([
    kv.del(`season:${id}`),
    kv.del(`season:${id}:packs`),
    ...packIds.map(pid => deletePack(pid)),
  ]);
  const ids = await listSeasonIds();
  await kv.set('seasons:list', ids.filter(i => i !== id));
}

// ── Packs ─────────────────────────────────────────────────

export async function listPackIds(seasonId: string): Promise<string[]> {
  return (await kv.get<string[]>(`season:${seasonId}:packs`)) ?? [];
}

export async function listPacks(seasonId: string): Promise<Pack[]> {
  const ids = await listPackIds(seasonId);
  const packs = await Promise.all(ids.map(id => kv.get<Pack>(`pack:${id}`)));
  return packs.filter((p): p is Pack => p !== null);
}

export async function getActivePacks(seasonId: string): Promise<Pack[]> {
  const packs = await listPacks(seasonId);
  return packs.filter(p => p.active);
}

export async function getPack(id: string): Promise<Pack | null> {
  return kv.get<Pack>(`pack:${id}`);
}

export async function savePack(pack: Pack): Promise<void> {
  await kv.set(`pack:${pack.id}`, pack);
  const ids = await listPackIds(pack.seasonId);
  if (!ids.includes(pack.id)) {
    await kv.set(`season:${pack.seasonId}:packs`, [...ids, pack.id]);
  }
}

export async function deletePack(id: string): Promise<void> {
  const pack = await getPack(id);
  await Promise.all([
    kv.del(`pack:${id}`),
    kv.del(`pack:${id}:cards`),
  ]);
  if (pack) {
    const ids = await listPackIds(pack.seasonId);
    await kv.set(`season:${pack.seasonId}:packs`, ids.filter(i => i !== id));
  }
}

// ── Cards ──────────────────────────────────────────────────

export async function getPackCards(packId: string): Promise<Card[]> {
  return (await kv.get<Card[]>(`pack:${packId}:cards`)) ?? [];
}

export async function savePackCards(packId: string, cards: Card[]): Promise<void> {
  await kv.set(`pack:${packId}:cards`, cards);
}

// ── Pulls (universal collection) ──────────────────────────

export async function getUserPulls(username: string): Promise<PullRecord[]> {
  return (await kv.get<PullRecord[]>(`user:${username.toLowerCase()}:pulls`)) ?? [];
}

export async function addUserPull(username: string, pull: PullRecord): Promise<void> {
  const existing = await getUserPulls(username);
  await kv.set(`user:${username.toLowerCase()}:pulls`, [...existing, pull]);
  await kv.sadd('users:all', username.toLowerCase());
}

export async function deleteUserPulls(username: string): Promise<void> {
  await kv.del(`user:${username.toLowerCase()}:pulls`);
  await kv.srem('users:all', username.toLowerCase());
}

export async function listAllUsers(): Promise<string[]> {
  return (await kv.smembers('users:all')) as string[];
}

// ── Composite ─────────────────────────────────────────────

export async function getActiveSeasonWithPacks(): Promise<{
  season: Season;
  packs: { pack: Pack; cards: Card[] }[];
} | null> {
  const season = await getActiveSeason();
  if (!season) return null;
  const packs = await getActivePacks(season.id);
  const packsWithCards = await Promise.all(
    packs.map(async pack => ({ pack, cards: await getPackCards(pack.id) }))
  );
  return { season, packs: packsWithCards };
}

// ── Legacy collection (kept for admin reset compatibility) ─

export async function getCollection(collectionName: string): Promise<Record<string, number[]>> {
  return (await kv.get<Record<string, number[]>>(`tcg_${collectionName}`)) ?? {};
}

export async function deleteCollection(collectionName: string): Promise<void> {
  await kv.del(`tcg_${collectionName}`);
}
