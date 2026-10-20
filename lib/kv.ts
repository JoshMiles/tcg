import { dropLedger, isTracking, lastCopy, syncAfterSave, type SyncContext } from './serials';
import type { Origin } from './serials-core';
import { kv } from './db';
import type { Season, Pack, Card, UserProfile, UpgradeCosts, VariantWeights } from './types';
import { DEFAULT_UPGRADE_COSTS, DEFAULT_VARIANT_WEIGHTS, cleanDisabled } from './variants';
import { SEED_SEASON, SEED_PACK, SEED_CARDS } from './seed';

// ── Normalizers (handle legacy KV shapes) ─────────────────

function normalizeSeason(raw: unknown): Season {
  const s = raw as Record<string, unknown>;
  return {
    id: s.id as string,
    name: s.name as string,
    collectionName: (s.collectionName as string) ?? '',
    active: ((s.active as boolean) ?? false) && s.status !== 'draft',
    status: s.status === 'draft' ? 'draft' : 'published',
    createdAt: (s.createdAt as number) ?? Date.now(),
    maxConcurrentPacks: (s.maxConcurrentPacks as number) ?? 1,
    packIds: (s.packIds as string[]) ?? [],
    ...(typeof s.startsAt === 'number' ? { startsAt: s.startsAt } : {}),
    ...(typeof s.endsAt === 'number' ? { endsAt: s.endsAt } : {}),
    ...(s.autoStart === true ? { autoStart: true } : {}),
    ...(typeof s.endedAt === 'number' ? { endedAt: s.endedAt } : {}),
    ...(s.tradingFrozen === true ? { tradingFrozen: true } : {}),
  };
}

// Card art used to ship as 20MB+ GIFs in /assets/GIF; it now lives as animated WebP in /assets/cards.
// Rewrite stored legacy URLs on read so existing KV data keeps working without a migration.
function normalizeCard(card: Card): Card {
  const imageUrl = card.imageUrl?.replace(/^\/assets\/GIF\/(.+)\.gif$/i, '/assets/cards/$1.webp');
  const isTrainer = card.kind === 'trainer';
  const disabled = isTrainer ? [] : cleanDisabled(card.disabledVariants);
  let next = imageUrl === card.imageUrl ? card : { ...card, imageUrl };
  if (isTrainer && next.upgradesEnabled !== false) next = { ...next, upgradesEnabled: false };
  // Only carry the field when something is switched off, so existing records are unchanged.
  return disabled.length ? { ...next, disabledVariants: disabled } : next.disabledVariants ? { ...next, disabledVariants: undefined } : next;
}

function normalizePack(raw: unknown): Pack {
  const p = raw as Record<string, unknown>;
  return {
    id: p.id as string,
    name: p.name as string,
    coverImageUrl: (p.coverImageUrl as string) ?? '',
    active: (p.active as boolean) ?? true,
    status: p.status === 'draft' ? 'draft' : 'published',
    weight: (p.weight as number) ?? 1,
    accentColor: (p.accentColor as string) ?? 'rgb(241,187,6)',
    tearBorderColor: (p.tearBorderColor as string) ?? 'rgb(218,163,18)',
    holoMinStars: (p.holoMinStars as number) ?? 5,
    cardTime: (p.cardTime as number) ?? 3,
    cooldownTime: (p.cooldownTime as number) ?? 1,
    soundVolume: (p.soundVolume as number) ?? 1.0,
    createdAt: (p.createdAt as number) ?? Date.now(),
    upgradesEnabled: (p.upgradesEnabled as boolean) ?? false,
    variantWeights: { ...DEFAULT_VARIANT_WEIGHTS, ...(p.variantWeights as Partial<VariantWeights> | undefined) },
    upgradeCosts: { ...DEFAULT_UPGRADE_COSTS, ...(p.upgradeCosts as Partial<UpgradeCosts> | undefined) },
    disabledVariants: cleanDisabled(p.disabledVariants),
    ...(p.archived === true ? { archived: true, archivedAt: (p.archivedAt as number | undefined) ?? undefined } : {}),
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

/** True when a season's start or end time has passed and nothing has acted on it yet (see lib/season-wrap.ts applySeasonSchedule). */
export function scheduleDue(seasons: Season[], now = Date.now()): boolean {
  return seasons.some(s => s.status === 'published' && (
    (!s.active && s.autoStart && !s.endedAt && s.startsAt !== undefined && s.startsAt <= now && (s.endsAt === undefined || s.endsAt > now)) ||
    (s.active && !s.endedAt && s.endsAt !== undefined && s.endsAt <= now)
  ));
}

export async function getActiveSeason(): Promise<Season | null> {
  let seasons = await listSeasons();
  // There is no background job: a scheduled start / end is applied the first time anything asks for the active season after it is due.
  if (scheduleDue(seasons)) {
    try {
      const { applySeasonSchedule } = await import('./season-wrap');
      await applySeasonSchedule();
      seasons = await listSeasons();
    } catch { /* scheduling must never break a read */ }
  }
  return seasons.find(s => s.active && s.status === 'published') ?? null;
}

export async function saveSeason(season: Season): Promise<void> {
  await kv.set(`season:${season.id}`, season);
  const ids = await listSeasonIds();
  if (!ids.includes(season.id)) {
    await kv.set('seasons:list', [...ids, season.id]);
  }
}

/** Makes exactly one season active (or none, if `activeId` is omitted). */
export async function setActiveSeason(activeId?: string): Promise<void> {
  const all = await listSeasons();
  if (activeId && all.find(s => s.id === activeId)?.status === 'draft') {
    throw new Error('A draft season cannot be activated. Publish it first.');
  }
  await Promise.all(
    all
      .filter(s => s.active !== (s.id === activeId))
      .map(s => saveSeason({ ...s, active: s.id === activeId }))
  );
}

export async function deleteSeason(id: string): Promise<void> {
  // Open offers still name this season. Deleting it makes the later refund find no collection and, if the flag were cleared, drop the prints.
  const open = (await kv.get<{ seasonId?: string }[]>('trades:open').catch(() => null)) ?? [];
  if (open.some(t => t.seasonId === id)) {
    throw new Error('This season still has open trade offers. Cancel them first so those editions can be returned.');
  }
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

/** The pack's revision counter: raised by every write to the pack or its cards, so the workspace can tell that someone else saved first. */
export async function getPackRev(id: string): Promise<number> {
  return Number(await kv.get(`pack:${id}:rev`)) || 0;
}
const bumpRev = async (id: string) => { await kv.incr(`pack:${id}:rev`); };

export async function savePack(pack: Pack): Promise<void> {
  await kv.set(`pack:${pack.id}`, pack);
  await bumpRev(pack.id);
  const ids = await listAllPackIds();
  if (!ids.includes(pack.id)) {
    await kv.set('packs:list', [...ids, pack.id]);
  }
}

export async function deletePack(id: string): Promise<void> {
  await Promise.all([kv.del(`pack:${id}`), kv.del(`pack:${id}:cards`), kv.del(`pack:${id}:cardback`), kv.del(`pack:${id}:rev`)]);
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
  return packs.filter(p => p.active && p.status === 'published');
}

// ── Cards ──────────────────────────────────────────────────

export async function getPackCards(packId: string): Promise<Card[]> {
  return ((await kv.get<Card[]>(`pack:${packId}:cards`)) ?? []).map(normalizeCard);
}

export async function savePackCards(packId: string, cards: Card[]): Promise<void> {
  await kv.set(`pack:${packId}:cards`, cards);
  await bumpRev(packId);
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

// ── User Profiles ─────────────────────────────────────────

export async function getUserProfile(username: string): Promise<UserProfile | null> {
  return kv.get<UserProfile>(`user:${username.toLowerCase()}:profile`);
}

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  await kv.set(`user:${profile.username}:profile`, profile);
}

/** Creates a profile if missing; backfills twitchId on an existing one. */
export async function ensureUserProfile(username: string, twitchId?: string): Promise<void> {
  const name = username.toLowerCase();
  const existing = await getUserProfile(name);
  if (!existing) {
    await saveUserProfile({ username: name, displayName: name, twitchId, createdAt: Date.now() });
  } else if (twitchId && !existing.twitchId) {
    await saveUserProfile({ ...existing, twitchId });
  }
}

export async function deleteUserProfile(username: string): Promise<void> {
  await kv.del(`user:${username.toLowerCase()}:profile`);
}

// Aggregate all users across every season's legacy collection.
// Returns one entry per unique username with per-season card arrays.
export async function getAllCollectionUsers(): Promise<{
  username: string;
  seasons: { id: string; name: string; collectionName: string; cards: number[] }[];
}[]> {
  const seasons = await listSeasons();
  const collections = await Promise.all(seasons.map(s => getCollection(s.collectionName)));

  const userMap = new Map<string, { id: string; name: string; collectionName: string; cards: number[] }[]>();

  seasons.forEach((season, i) => {
    for (const [username, cards] of Object.entries(collections[i])) {
      const lower = username.toLowerCase();
      if (!userMap.has(lower)) userMap.set(lower, []);
      userMap.get(lower)!.push({
        id: season.id,
        name: season.name,
        collectionName: season.collectionName,
        cards,
      });
    }
  });

  return Array.from(userMap.entries()).map(([username, seasons]) => ({ username, seasons }));
}

// ── Twitch opaque user ID mapping ─────────────────────────

export async function getTwitchOpaqueUser(opaqueId: string): Promise<string | null> {
  return kv.get<string>(`twitch_opaque:${opaqueId}`);
}

export async function saveTwitchOpaqueUser(opaqueId: string, username: string): Promise<void> {
  await kv.set(`twitch_opaque:${opaqueId}`, username.toLowerCase());
}

export async function deleteTwitchOpaqueUser(opaqueId: string): Promise<void> {
  await kv.del(`twitch_opaque:${opaqueId}`);
}

// ── Legacy collection ─────────────────────────────────────

export async function getCollection(collectionName: string): Promise<Record<string, number[]>> {
  return (await kv.get<Record<string, number[]>>(`tcg_${collectionName}`)) ?? {};
}

/**
 * Writes a collection. When the collection's copies are being tracked (lib/serials.ts) the write is followed by a ledger sync, so
 * every route that changes a collection keeps card serials correct without knowing about them. `ctx` says where new copies came
 * from, or which copies a trade / upgrade moved, so their identity is kept.
 */
export async function saveCollection(collectionName: string, data: Record<string, number[]>, ctx?: SyncContext): Promise<void> {
  const before = (await isTracking(collectionName)) ? await getCollection(collectionName) : null;
  await kv.set(`tcg_${collectionName}`, data);
  if (before) await syncAfterSave(collectionName, before, data, ctx);
}

/**
 * Runs `fn` while holding a short per-collection lock. The whole collection is one JSON blob, so any
 * read-modify-write (pull, grant, remove, upgrade) must go through this or concurrent serverless
 * invocations overwrite each other's changes.
 */
export async function withCollectionLock<T>(collectionName: string, fn: () => Promise<T>): Promise<T> {
  return withLock(`tcg_${collectionName}`, fn);
}

/**
 * A short named lock (Redis SET NX EX), for any read-modify-write that must not interleave across serverless invocations.
 * Locks are never held across anything slow. If one code path takes two locks it must always take them in the same order
 * (trading takes 'trades' first, then a collection's lock; nothing takes them the other way round).
 */
export async function withLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const key = `lock:${name}`;
  const token = crypto.randomUUID();
  for (let attempt = 0; attempt < 30; attempt++) {
    const got = await kv.set(key, token, { nx: true, ex: 10 });
    if (got) {
      try {
        return await fn();
      } finally {
        if ((await kv.get(key)) === token) await kv.del(key);
      }
    }
    await new Promise(r => setTimeout(r, 80 + Math.random() * 120));
  }
  throw new Error('That is busy, try again');
}

/** Appends one entry (card + variant, see lib/variants.ts) to a user's collection. Returns their new array. */
export async function addCollectionEntry(collectionName: string, username: string, entry: number, origin: Origin = 'other'): Promise<number[]> {
  const lower = username.toLowerCase();
  return withCollectionLock(collectionName, async () => {
    const data = await getCollection(collectionName);
    data[lower] = [...(data[lower] ?? []), entry];
    await saveCollection(collectionName, data, { origin });
    return data[lower];
  });
}

/** Like addCollectionEntry, and also says which serial number, copy id and unique number the new copy got (nulls before the collection is numbered). */
export async function addCollectionEntryWithSerial(collectionName: string, username: string, entry: number, origin: Origin = 'other'): Promise<{ owned: number[]; serial: number | null; copyId: string | null; uid: number | null }> {
  const lower = username.toLowerCase();
  return withCollectionLock(collectionName, async () => {
    const data = await getCollection(collectionName);
    data[lower] = [...(data[lower] ?? []), entry];
    await saveCollection(collectionName, data, { origin });
    return { owned: data[lower], ...(await lastCopy(collectionName, entry)) };
  });
}

export async function deleteCollection(collectionName: string): Promise<void> {
  return withCollectionLock(collectionName, async () => {
    const users = Object.keys(await getCollection(collectionName).catch(() => ({} as Record<string, number[]>)));
    await kv.del(`tcg_${collectionName}`);
    await dropLedger(collectionName, users);
  });
}

/** Removes a user's entry from one collection. Returns true if there was anything to remove. */
export async function removeUserFromCollection(collectionName: string, username: string): Promise<boolean> {
  const lower = username.toLowerCase();
  return withCollectionLock(collectionName, async () => {
    const data = await getCollection(collectionName);
    if (!(lower in data)) return false;
    delete data[lower];
    await saveCollection(collectionName, data);
    return true;
  });
}

// ── Seed ──────────────────────────────────────────────────

/** Idempotently installs Season 1 / Cheesy Starter Pack and backfills missing card sounds. */
export async function seedSeason1(): Promise<void> {
  const [seasonIds, packIds] = await Promise.all([listSeasonIds(), listAllPackIds()]);

  if (!packIds.includes(SEED_PACK.id)) {
    await savePack(SEED_PACK);
    await savePackCards(SEED_PACK.id, SEED_CARDS);
  } else {
    const seedSound = new Map(SEED_CARDS.map(c => [c.id, c.soundUrl]));
    const existing = await getPackCards(SEED_PACK.id);
    if (existing.some(c => !c.soundUrl && seedSound.get(c.id))) {
      await savePackCards(
        SEED_PACK.id,
        existing.map(c => (c.soundUrl ? c : { ...c, soundUrl: seedSound.get(c.id) }))
      );
    }
  }

  if (!seasonIds.includes(SEED_SEASON.id)) {
    await saveSeason(SEED_SEASON);
  } else {
    const existing = await getSeason(SEED_SEASON.id);
    if (existing && !existing.packIds.includes(SEED_PACK.id)) {
      await saveSeason({ ...existing, packIds: [...existing.packIds, SEED_PACK.id] });
    }
  }
}
