import { dropLedger, lastCopy, syncAfterSave, type SyncContext } from './serials';
import { ESCROW_PREFIX, type Origin } from './serials-core';
import { currentSandboxId, kv, requestCached } from './db';
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
    ...(typeof p.price === 'number' && p.price >= 1 ? { price: Math.floor(p.price) } : {}),
    ...(p.archived === true ? { archived: true, archivedAt: (p.archivedAt as number | undefined) ?? undefined } : {}),
  };
}

// ── Seasons ───────────────────────────────────────────────

export async function listSeasonIds(): Promise<string[]> {
  return (await kv.get<string[]>('seasons:list')) ?? [];
}

/** Uncached read: use it where a write has just happened or is about to (setActiveSeason, season-wrap). */
export async function readSeasons(): Promise<Season[]> {
  const ids = await listSeasonIds();
  const raws = await Promise.all(ids.map(id => kv.get(`season:${id}`)));
  return raws.filter(Boolean).map(normalizeSeason);
}

/** Read once per request. The array is shared: copy it before sorting. */
export const listSeasons = requestCached(readSeasons);

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

// Not memoised itself: applying a due schedule can re-enter it (takeSnapshot reads score bonuses), which would wait on its own promise.
// The season read inside it is memoised, which is the cost.
export async function getActiveSeason(): Promise<Season | null> {
  let seasons = await listSeasons();
  // There is no background job: a scheduled start / end is applied the first time anything asks for the active season after it is due.
  if (scheduleDue(seasons)) {
    try {
      const { applySeasonSchedule } = await import('./season-wrap');
      await applySeasonSchedule();
      seasons = await readSeasons();
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
  const all = await readSeasons();
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
  const seasons = await readSeasons();
  await Promise.all(
    seasons
      .filter(s => s.packIds.includes(id))
      .map(s => saveSeason({ ...s, packIds: s.packIds.filter(pid => pid !== id) }))
  );
}

// Keyed on the pack ids (a Season object would never repeat). Read once per request; the array is shared, so copy it before sorting.
const readPacks = requestCached(async (ids: string): Promise<Pack[]> => {
  const raws = await Promise.all((ids ? ids.split(',') : []).map(id => kv.get(`pack:${id}`)));
  return raws.filter(Boolean).map(normalizePack);
});
export const getPacksForSeason = (season: Season): Promise<Pack[]> => readPacks(season.packIds.join(','));

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

export const getActiveSeasonWithPacks = requestCached(async (): Promise<{
  season: Season;
  packs: { pack: Pack; cards: Card[] }[];
} | null> => {
  const season = await getActiveSeason();
  if (!season) return null;
  const activePacks = await getActivePacksForSeason(season);
  const packsWithCards = await Promise.all(
    activePacks.map(async pack => ({ pack, cards: await getPackCards(pack.id) }))
  );
  return { season, packs: packsWithCards };
});

// ── User Profiles ─────────────────────────────────────────

export async function getUserProfile(username: string): Promise<UserProfile | null> {
  return kv.get<UserProfile>(`user:${username.toLowerCase()}:profile`);
}

const PROFILE_CHUNK = 100;

/** Several profiles with one `mget` per 100 names (lists: Users, Viewers, trades). Keys are the lowercased names; a missing profile is null. */
export async function getUserProfiles(usernames: string[]): Promise<Map<string, UserProfile | null>> {
  const names = [...new Set(usernames.map(u => u.toLowerCase()))];
  const parts: string[][] = [];
  for (let i = 0; i < names.length; i += PROFILE_CHUNK) parts.push(names.slice(i, i + PROFILE_CHUNK));
  const got = (await Promise.all(parts.map(part => kv.mget<(UserProfile | null)[]>(...part.map(n => `user:${n}:profile`))))).flat();
  return new Map(names.map((n, i) => [n, got[i] ?? null]));
}

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  await kv.set(`user:${profile.username}:profile`, profile);
}

/** Creates a profile if missing; backfills twitchId on an existing one. */
export async function ensureUserProfile(username: string, twitchId?: string): Promise<void> {
  const name = username.toLowerCase();
  const existing = await getUserProfile(name);
  if (existing && !(twitchId && !existing.twitchId)) return;
  await patchUserProfile(name, p => p ? { ...p, twitchId: p.twitchId ?? twitchId } : { username: name, displayName: name, twitchId, createdAt: Date.now() });
}

/** Reads, changes and saves a profile under a per-viewer lock, so two staff edits (or a staff edit and a sign-in) cannot overwrite each other. */
export async function patchUserProfile(username: string, change: (current: UserProfile | null) => UserProfile): Promise<UserProfile> {
  const name = username.toLowerCase();
  return withLock(`profile_${name}`, async () => {
    const next = change(await getUserProfile(name));
    await saveUserProfile(next);
    return next;
  });
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

// ── Collections ───────────────────────────────────────────
//
// One hash per season, `coll:<collectionName>`: field = lowercase login, value = that viewer's `number[]` (a viewer with no cards has
// no field). Whole-season readers get the `Record<login, number[]>` they always had (`getCollection`); a writer touches only the
// viewers it changes (`updateCollection`). Before ROADMAP 48.7 a season was ONE string, `tcg_<name>`, rewritten whole on every save.
// The first request that touches a season moves it (`ensureMigrated`); the old string is kept as `tcg_<name>:old` for 30 days.

const collKey = (c: string) => `coll:${c}`;
const oldKey = (c: string) => `tcg_${c}`;
/** Hash: collection name -> { viewers, entries, at } for every season moved to the hash layout (Data health lists it). Outside `coll:` so no season name can collide with it. */
const MIGRATION_LOG = 'collmig';
/** Fields per HSET/HDEL, so one request stays small for a season with thousands of viewers. */
const CHUNK = 200;
/** How long the old string is kept after the move before Data health offers to delete it. */
export const OLD_COPY_DAYS = 30;

export interface CollectionMigration { collection: string; viewers: number; entries: number; at: number; oldCopy: boolean }

/** Seasons this instance has seen in the hash layout, per sandbox (a sandbox is its own namespace). Only success is remembered. */
const migrated = new Set<string>();
/** Forget what this instance knows (a script that rebuilds the old layout under a running process, a sandbox reset). */
export function forgetMigrations(): void { migrated.clear(); }

async function hsetChunked(key: string, fields: Record<string, number[]>): Promise<void> {
  const names = Object.keys(fields);
  for (let i = 0; i < names.length; i += CHUNK) {
    await kv.hset(key, Object.fromEntries(names.slice(i, i + CHUNK).map(n => [n, fields[n]])));
  }
}
async function hdelChunked(key: string, names: string[]): Promise<void> {
  for (let i = 0; i < names.length; i += CHUNK) await kv.hdel(key, ...names.slice(i, i + CHUNK));
}

/** Builds the hash beside the live key, checks it, then renames it into place, so a reader never sees a half-built hash. Call under the season's lock. */
async function migrateCollection(c: string): Promise<void> {
  const raw = await kv.get<Record<string, number[]>>(oldKey(c));
  if (raw === null || raw === undefined) return; // a new or empty season: nothing to copy
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`Collection ${c} is not in a shape that can be moved; nothing was changed.`);
  const rec: Record<string, number[]> = {};
  let entries = 0;
  for (const [login, cards] of Object.entries(raw)) if (Array.isArray(cards) && cards.length > 0) { rec[login] = cards; entries += cards.length; }
  const viewers = Object.keys(rec).length;
  const tmp = `${collKey(c)}:new`;
  await kv.del(tmp);
  if (viewers > 0) {
    await hsetChunked(tmp, rec);
    const back = (await kv.hgetall<Record<string, number[]>>(tmp)) ?? {};
    const backViewers = Object.keys(back).length;
    const backEntries = Object.values(back).reduce((n, cards) => n + (Array.isArray(cards) ? cards.length : 0), 0);
    if (backViewers !== viewers || backEntries !== entries) {
      await kv.del(tmp);
      throw new Error(`Moving collection ${c} failed its check (${backViewers} of ${viewers} viewers, ${backEntries} of ${entries} entries); nothing was changed.`);
    }
    await kv.rename(tmp, collKey(c));
  }
  await kv.rename(oldKey(c), `${oldKey(c)}:old`);
  await kv.hset(MIGRATION_LOG, { [c]: { viewers, entries, at: Date.now() } });
}

/**
 * Moves a season from the old string to the hash on its first use, and does nothing after: one EXISTS per instance per season. The move
 * runs under the season's lock, so two instances starting together move it once. Every reader and writer below calls it first;
 * `withCollectionLock` calls it before taking the lock (the lock is not reentrant).
 */
export async function ensureMigrated(c: string): Promise<void> {
  const memo = `${(await currentSandboxId()) ?? ''}|${c}`;
  if (migrated.has(memo)) return;
  if (!(await kv.exists(collKey(c)))) {
    await withLock(oldKey(c), async () => {
      if (!(await kv.exists(collKey(c)))) await migrateCollection(c);
    });
  }
  migrated.add(memo);
}

/** Every viewer's cards for one season: `HGETALL`. For the readers that need the whole season (leaderboard, search, admin lists). */
export async function getCollection(collectionName: string): Promise<Record<string, number[]>> {
  await ensureMigrated(collectionName);
  return (await kv.hgetall<Record<string, number[]>>(collKey(collectionName))) ?? {};
}

/** One viewer's cards (`login` lowercase): `HGET`. Use it instead of `getCollection` when only one viewer matters. */
export async function getUserCards(collectionName: string, login: string): Promise<number[]> {
  await ensureMigrated(collectionName);
  return (await kv.hget<number[]>(collKey(collectionName), login)) ?? [];
}

const sameList = (a: number[], b: number[]) => a.length === b.length && a.every((e, i) => e === b[i]);

/** Writes the viewers that differ between `before` and `after`: an emptied viewer loses its field, everyone else is HSET. Call under the lock. */
async function writeViewers(c: string, before: Record<string, number[]>, after: Record<string, number[]>): Promise<void> {
  const sets: Record<string, number[]> = {};
  const dels: string[] = [];
  for (const login of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const was = before[login] ?? [];
    const now = after[login] ?? [];
    if (sameList(was, now)) continue;
    if (now.length > 0) sets[login] = now; else dels.push(login);
  }
  // Writes first, removals second: a failure in between can only leave a card in two places (the trade audit shows it), never lose one.
  await hsetChunked(collKey(c), sets);
  await hdelChunked(collKey(c), dels);
}

export interface CollectionUpdate<T> {
  /** What `updateCollection` returns to its caller. */
  result: T;
  /** The new list of each viewer that changes, by login (an empty list removes the viewer). Leave it out to write nothing (a refusal). */
  cards?: Record<string, number[]>;
  /** Serial sync context: where new copies came from, or which copies moved. */
  ctx?: SyncContext;
}

/** Everyone a serial context names (escrow is not a viewer): each must have been loaded, or the ledger would be reconciled against an empty list. */
function ctxLogins(ctx: SyncContext | undefined): string[] {
  if (!ctx) return [];
  const names: string[] = [];
  for (const m of ctx.moves ?? []) names.push(m.from, m.to);
  if (ctx.retire) names.push(ctx.retire.owner);
  if (ctx.upgrade) names.push(ctx.upgrade.user);
  if (ctx.restore) names.push(ctx.restore.owner);
  if (ctx.restoreRetired) names.push(ctx.restoreRetired);
  return names.filter(n => n && !n.startsWith(ESCROW_PREFIX));
}

/**
 * Reads only `logins` (HMGET), hands `fn` a record holding just them (a viewer with no cards is `[]`), then writes only the viewers
 * that changed and runs the serial sync for those viewers alone. `fn` returns what the caller gets (`result`) plus `cards` to write and
 * the sync `ctx`; with no `cards` nothing is written. Call it inside `withCollectionLock`: a pull, trade or upgrade also does its own
 * ledger reads and other writes in that lock, exactly as before.
 */
export async function updateCollection<T>(
  collectionName: string,
  logins: string[],
  fn: (cards: Record<string, number[]>) => CollectionUpdate<T> | Promise<CollectionUpdate<T>>,
): Promise<T> {
  await ensureMigrated(collectionName);
  const names = [...new Set(logins)];
  const got = names.length > 0 ? await kv.hmget<Record<string, number[] | null>>(collKey(collectionName), ...names) : null;
  const before: Record<string, number[]> = {};
  for (const n of names) before[n] = got?.[n] ?? [];
  const out = await fn(Object.fromEntries(names.map(n => [n, [...before[n]]])));
  if (!out.cards) return out.result;
  for (const n of Object.keys(out.cards)) if (!names.includes(n)) throw new Error(`updateCollection: ${n} was not among the viewers loaded.`);
  for (const n of ctxLogins(out.ctx)) if (!names.includes(n)) throw new Error(`updateCollection: the serial context names ${n}, who was not loaded.`);
  const after: Record<string, number[]> = {};
  for (const n of names) after[n] = out.cards[n] ?? before[n];
  await writeViewers(collectionName, before, after);
  await syncAfterSave(collectionName, before, after, out.ctx);
  return out.result;
}

/**
 * Writes a whole collection (sandbox tools, undo, the legacy import, the admin full replace): the hash is diffed against `data`, changed
 * viewers are written and missing ones removed. Call under `withCollectionLock`. When the collection's copies are being tracked
 * (lib/serials.ts) the write is followed by a ledger sync, so every route that changes a collection keeps card serials correct without
 * knowing about them. `ctx` says where new copies came from, or which copies a trade / upgrade moved, so their identity is kept.
 */
export async function saveCollection(collectionName: string, data: Record<string, number[]>, ctx?: SyncContext): Promise<void> {
  const before = await getCollection(collectionName);
  await writeViewers(collectionName, before, data);
  await syncAfterSave(collectionName, before, data, ctx);
}

/**
 * Runs `fn` while holding a short per-collection lock. Any read-modify-write of a season's cards (pull, grant, remove, upgrade) must
 * go through this or concurrent serverless invocations overwrite each other's changes. A season still in the old layout is moved first.
 */
export async function withCollectionLock<T>(collectionName: string, fn: () => Promise<T>): Promise<T> {
  await ensureMigrated(collectionName);
  return withLock(oldKey(collectionName), fn);
}

/**
 * The account move: puts all of `from`'s cards after `to`'s in one season and drops `from`. It writes the collection only, with no serial
 * sync (the caller renames the ledger owner, so no print is retired or re-minted). Call under the lock. One HSET sets both fields, so a
 * crash before the HDEL leaves `from` with an empty list (a resumed move then finds nothing to add twice). True when cards moved.
 */
export async function moveCollectionCards(collectionName: string, from: string, to: string): Promise<boolean> {
  await ensureMigrated(collectionName);
  const key = collKey(collectionName);
  const mine = (await kv.hget<number[]>(key, from)) ?? [];
  if (mine.length === 0) { await kv.hdel(key, from); return false; }
  const theirs = (await kv.hget<number[]>(key, to)) ?? [];
  await kv.hset(key, { [to]: [...theirs, ...mine], [from]: [] });
  await kv.hdel(key, from);
  return true;
}

/** Seasons moved to the hash layout, newest first, and whether the old string copy is still there (Data health). */
export async function listCollectionMigrations(): Promise<CollectionMigration[]> {
  const log = (await kv.hgetall<Record<string, { viewers: number; entries: number; at: number }>>(MIGRATION_LOG)) ?? {};
  const rows = await Promise.all(Object.entries(log).map(async ([collection, m]) => ({
    collection, viewers: m.viewers, entries: m.entries, at: m.at, oldCopy: !!(await kv.exists(`${oldKey(collection)}:old`)),
  })));
  return rows.sort((a, b) => b.at - a.at);
}

/** Deletes the old string copies kept for rollback, for seasons moved more than OLD_COPY_DAYS ago. Returns how many were deleted. */
export async function deleteOldCollectionCopies(): Promise<number> {
  const cutoff = Date.now() - OLD_COPY_DAYS * 86_400_000;
  let n = 0;
  for (const m of await listCollectionMigrations()) {
    if (m.oldCopy && m.at <= cutoff) { await kv.del(`${oldKey(m.collection)}:old`); n++; }
  }
  return n;
}

// Compare-and-delete in one step: a holder whose lock expired must not delete the lock another request now owns.
// scripts/mock-kv.cjs recognises this exact script, so change both together.
const RELEASE_LOCK = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

/**
 * A short named lock (Redis SET NX EX, released by compare-and-delete), for any read-modify-write that must not interleave across serverless invocations.
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
        await kv.eval(RELEASE_LOCK, [key], [token]);
      }
    }
    await new Promise(r => setTimeout(r, 80 + Math.random() * 120));
  }
  throw new Error('That is busy, try again');
}

/** Appends one entry (card + variant, see lib/variants.ts) to a user's collection. Returns their new array. */
export async function addCollectionEntry(collectionName: string, username: string, entry: number, origin: Origin = 'other'): Promise<number[]> {
  const lower = username.toLowerCase();
  return withCollectionLock(collectionName, () => updateCollection(collectionName, [lower], cards => {
    const owned = [...cards[lower], entry];
    return { result: owned, cards: { [lower]: owned }, ctx: { origin } };
  }));
}

/** Like addCollectionEntry, and also says which serial number, copy id and unique number the new copy got (nulls before the collection is numbered). */
export async function addCollectionEntryWithSerial(collectionName: string, username: string, entry: number, origin: Origin = 'other'): Promise<{ owned: number[]; serial: number | null; copyId: string | null; uid: number | null }> {
  const lower = username.toLowerCase();
  return withCollectionLock(collectionName, async () => {
    const owned = await updateCollection(collectionName, [lower], cards => {
      const next = [...cards[lower], entry];
      return { result: next, cards: { [lower]: next }, ctx: { origin } };
    });
    return { owned, ...(await lastCopy(collectionName, entry)) };
  });
}

export async function deleteCollection(collectionName: string): Promise<void> {
  return withCollectionLock(collectionName, async () => {
    const users = Object.keys(await getCollection(collectionName).catch(() => ({} as Record<string, number[]>)));
    await kv.del(`coll:${collectionName}`, `tcg_${collectionName}`, `tcg_${collectionName}:old`);
    await dropLedger(collectionName, users);
    await kv.hdel(MIGRATION_LOG, collectionName);
  });
}

/** Removes a user's entry from one collection. Returns true if there was anything to remove. */
export async function removeUserFromCollection(collectionName: string, username: string): Promise<boolean> {
  const lower = username.toLowerCase();
  return withCollectionLock(collectionName, () => updateCollection(collectionName, [lower], cards => (
    cards[lower].length === 0 ? { result: false } : { result: true, cards: { [lower]: [] } }
  )));
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
