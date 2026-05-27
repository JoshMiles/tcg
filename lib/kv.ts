import { kv } from '@vercel/kv';
import type { Season, Pack, Card, PullRecord } from './types';

// ── Normalizers (handle legacy KV shapes) ─────────────────

function normalizeSeason(raw: unknown): Season {
  const s = raw as Record<string, unknown>;
  return {
    id: s.id as string,
    name: s.name as string,
    collectionName: (s.collectionName as string) ?? '',
    active: (s.active as boolean) ?? false,
    createdAt: (s.createdAt as number) ?? Date.now(),
    maxConcurrentPacks: (s.maxConcurrentPacks as number) ?? 1,
    packIds: (s.packIds as string[]) ?? [],
  };
}

function normalizePack(raw: unknown): Pack {
  const p = raw as Record<string, unknown>;
  return {
    id: p.id as string,
    name: p.name as string,
    coverImageUrl: (p.coverImageUrl as string) ?? '',
    active: (p.active as boolean) ?? true,
    weight: (p.weight as number) ?? 1,
    accentColor: (p.accentColor as string) ?? 'rgb(241,187,6)',
    tearBorderColor: (p.tearBorderColor as string) ?? 'rgb(218,163,18)',
    holoMinStars: (p.holoMinStars as number) ?? 5,
    cardTime: (p.cardTime as number) ?? 3,
    cooldownTime: (p.cooldownTime as number) ?? 1,
    soundVolume: (p.soundVolume as number) ?? 1.0,
    createdAt: (p.createdAt as number) ?? Date.now(),
  };
}

// ── Seasons ───────────────────────────────────────────────

export async function listSeasonIds(): Promise<string[]> {
  return (await kv.get<string[]>('seasons:list')) ?? [];
}

export async function listSeasons(): Promise<Season[]> {
  const ids = await listSeasonIds();
  const raws = await Promise.all(ids.map(id => kv.get(`season:${id}`)));
  return raws.filter(Boolean).map(normalizeSeason);
}

export async function getSeason(id: string): Promise<Season | null> {
  const raw = await kv.get(`season:${id}`);
  return raw ? normalizeSeason(raw) : null;
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
  await kv.del(`season:${id}`);
  const ids = await listSeasonIds();
  await kv.set('seasons:list', ids.filter(i => i !== id));
}

// ── Packs (global) ────────────────────────────────────────

export async function listAllPackIds(): Promise<string[]> {
  return (await kv.get<string[]>('packs:list')) ?? [];
}

export async function listAllPacks(): Promise<Pack[]> {
  const ids = await listAllPackIds();
  const raws = await Promise.all(ids.map(id => kv.get(`pack:${id}`)));
  return raws.filter(Boolean).map(normalizePack);
}

export async function getPack(id: string): Promise<Pack | null> {
  const raw = await kv.get(`pack:${id}`);
  return raw ? normalizePack(raw) : null;
}

export async function savePack(pack: Pack): Promise<void> {
  await kv.set(`pack:${pack.id}`, pack);
  const ids = await listAllPackIds();
  if (!ids.includes(pack.id)) {
    await kv.set('packs:list', [...ids, pack.id]);
  }
}

export async function deletePack(id: string): Promise<void> {
  await Promise.all([kv.del(`pack:${id}`), kv.del(`pack:${id}:cards`)]);
  const ids = await listAllPackIds();
  await kv.set('packs:list', ids.filter(i => i !== id));
  // remove from any seasons that reference this pack
  const seasons = await listSeasons();
  await Promise.all(
    seasons
      .filter(s => s.packIds.includes(id))
      .map(s => saveSeason({ ...s, packIds: s.packIds.filter(pid => pid !== id) }))
  );
}

export async function getPacksForSeason(season: Season): Promise<Pack[]> {
  const raws = await Promise.all(season.packIds.map(id => kv.get(`pack:${id}`)));
  return raws.filter(Boolean).map(normalizePack);
}

export async function getActivePacksForSeason(season: Season): Promise<Pack[]> {
  const packs = await getPacksForSeason(season);
  return packs.filter(p => p.active);
}

// ── Cards ──────────────────────────────────────────────────

export async function getPackCards(packId: string): Promise<Card[]> {
  return (await kv.get<Card[]>(`pack:${packId}:cards`)) ?? [];
}

export async function savePackCards(packId: string, cards: Card[]): Promise<void> {
  await kv.set(`pack:${packId}:cards`, cards);
}

// ── Pulls ──────────────────────────────────────────────────

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
  const activePacks = await getActivePacksForSeason(season);
  const packsWithCards = await Promise.all(
    activePacks.map(async pack => ({ pack, cards: await getPackCards(pack.id) }))
  );
  return { season, packs: packsWithCards };
}

// ── Legacy collection ─────────────────────────────────────

export async function getCollection(collectionName: string): Promise<Record<string, number[]>> {
  return (await kv.get<Record<string, number[]>>(`tcg_${collectionName}`)) ?? {};
}

export async function saveCollection(collectionName: string, data: Record<string, number[]>): Promise<void> {
  await kv.set(`tcg_${collectionName}`, data);
}

export async function deleteCollection(collectionName: string): Promise<void> {
  await kv.del(`tcg_${collectionName}`);
}
