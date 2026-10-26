import { getSelfHidden } from './user-settings-store';
import { kv, requestCached } from './db';
import { getCollection, getUserProfile, listSeasons, patchUserProfile, saveUserProfile, updateCollection, withCollectionLock, withLock, deleteUserProfile } from './kv';
import { cleanLogin } from './staff-core';
import { recordAudit } from './audit';
import { currentStaffLogin } from './staff-actor';
import { listOpenTrades } from './trades';
import { getOwnerCopies, isTracking, printsBlocked } from './serials';
import { entryOf } from './serials-core';
import type { UserProfile, Variant } from './types';

// Server-side helpers for the admin Users pages: tags and moderation flags, the hidden-viewers set, restore points (snapshots taken
// before a reset / delete / merge) and account merging.

// ── Tags and flags ──

export const MAX_TAGS = 8;
export const SUGGESTED_TAGS = ['vip', 'moderator', 'test account', 'streamer friend', 'watch'];

export function cleanTag(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9 _-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20);
}
export function cleanTags(list: string[]): string[] {
  return [...new Set(list.map(cleanTag).filter(Boolean))].slice(0, MAX_TAGS);
}

export interface UserFlags {
  /** Cannot make or accept trade offers, and cannot be offered one. */
  noTrading?: boolean;
  /** Left out of the public leaderboard, card owner lists and recent pulls. */
  hideFromBoard?: boolean;
  /** Why (admins only). */
  reason?: string;
  at?: number;
  /** The staff member who set them (Twitch login). */
  by?: string;
}

/** The old admin hidden list: one JSON array. Still read, and folded into the set below the first time anyone is hidden or shown. */
const HIDDEN_KEY = 'users:hidden';
/** The admin hidden list now: a KV set, so hiding or showing one viewer is a single atomic add / remove. */
const HIDDEN_SET = 'users:hidden:admin';

/** Viewers hidden from public rankings, kept in step by saveFlags. Read once per request; the set is shared, so copy it before changing it. */
export const getHiddenUsers = requestCached(async (): Promise<Set<string>> => {
  const [admin, self] = await Promise.all([getAdminHidden(), getSelfHidden()]);
  return new Set([...admin, ...self]);
});

/** Only the ones an admin hid (viewers who chose a private profile are tracked separately). */
export async function getAdminHidden(): Promise<Set<string>> {
  try {
    const [old, members] = await Promise.all([kv.get<string[]>(HIDDEN_KEY), kv.smembers(HIDDEN_SET)]);
    return new Set([...(Array.isArray(old) ? old : []), ...members.map(String)]);
  } catch { return new Set(); }
}

export async function setHidden(username: string, hidden: boolean): Promise<void> {
  if (await kv.exists(HIDDEN_KEY)) {
    await withLock('users_hidden_migrate', async () => {
      const old = await kv.get<string[]>(HIDDEN_KEY); // read again inside the lock: another save may have moved it already
      if (Array.isArray(old) && old.length > 0) await kv.sadd(HIDDEN_SET, old[0], ...old.slice(1));
      await kv.del(HIDDEN_KEY);
    });
  }
  if (hidden) await kv.sadd(HIDDEN_SET, username); else await kv.srem(HIDDEN_SET, username);
}

export const UNKNOWN_VIEWER = "We don't know that viewer. Check the spelling: they need to have signed in or pulled a card.";

/** The clean login of a viewer who exists (a profile, or cards in any season), or null: staff edits never create a viewer out of a typo. */
export async function knownViewer(input: string): Promise<string | null> {
  const name = cleanLogin(input);
  if (!name) return null;
  if (await getUserProfile(name)) return name;
  for (const s of await listSeasons()) {
    if (Object.keys(await getCollection(s.collectionName)).some(u => u.toLowerCase() === name)) return name;
  }
  return null;
}

const blankProfile = (name: string): UserProfile => ({ username: name, displayName: name, createdAt: Date.now() });

export async function saveTags(username: string, tags: string[]): Promise<{ ok: true; tags: string[] } | { ok: false; error: string }> {
  const name = await knownViewer(username);
  if (!name) return { ok: false, error: UNKNOWN_VIEWER };
  const clean = cleanTags(tags);
  await patchUserProfile(name, p => ({ ...(p ?? blankProfile(name)), tags: clean }));
  await recordAudit(name, 'Tags changed', clean.join(', ') || 'none');
  return { ok: true, tags: clean };
}

export async function saveFlags(username: string, flags: UserFlags): Promise<{ ok: true } | { ok: false; error: string }> {
  const name = await knownViewer(username);
  if (!name) return { ok: false, error: UNKNOWN_VIEWER };
  const any = !!(flags.noTrading || flags.hideFromBoard);
  const by = any ? await currentStaffLogin() : null;
  const next: UserFlags | undefined = any ? { noTrading: !!flags.noTrading, hideFromBoard: !!flags.hideFromBoard, reason: (flags.reason ?? '').slice(0, 200), at: Date.now(), ...(by ? { by } : {}) } : undefined;
  await patchUserProfile(name, p => ({ ...(p ?? blankProfile(name)), flags: next }));
  await setHidden(name, !!flags.hideFromBoard);
  await recordAudit(name, any ? 'Restrictions set' : 'Restrictions cleared', any ? [flags.noTrading && 'no trading', flags.hideFromBoard && 'hidden from public boards', flags.reason].filter(Boolean).join(' · ') : undefined);
  return { ok: true };
}

/** True when this viewer is blocked from trading. */
export async function isTradeBlocked(username: string): Promise<boolean> {
  try { return !!(await getUserProfile(username))?.flags?.noTrading; } catch { return false; }
}

// ── Restore points ──

export interface UserSnapshot {
  id: string;
  at: number;
  reason: string;
  profile: UserProfile | null;
  collections: { collectionName: string; seasonName: string; entries: number[]; /** Copy ids, one per entry, when the season was numbered. */ prints?: string[] }[];
}

/** One saved print per entry the viewer holds. Undefined when the ledger does not match the collection (an older point then has no ids). */
function assignPrints(entries: number[], copies: { id: string; card: number; variant: Variant }[]): string[] | undefined {
  const pools = new Map<number, string[]>();
  for (const x of copies) {
    const e = entryOf(x);
    pools.set(e, [...(pools.get(e) ?? []), x.id]);
  }
  const ids: string[] = [];
  for (const e of entries) {
    const id = pools.get(e)?.pop();
    if (!id) return undefined;
    ids.push(id);
  }
  return ids;
}

const SNAP_TTL = 14 * 24 * 3600; // seconds
const SNAP_KEEP = 6;
const snapIndex = (u: string) => `user:${u}:snaps`;
const snapKey = (u: string, id: string) => `user:${u}:snap:${id}`;

/** Saves what is about to be removed (cards in every season, and the profile) for 14 days. Returns null when there was nothing to save. */
export async function takeUserSnapshot(username: string, reason: string): Promise<UserSnapshot | null> {
  const name = username.toLowerCase();
  const [seasons, profile] = await Promise.all([listSeasons(), getUserProfile(name)]);
  const collections: UserSnapshot['collections'] = [];
  for (const s of seasons) {
    const entries = (await getCollection(s.collectionName))[name];
    if (entries && entries.length > 0) {
      const prints = (await isTracking(s.collectionName)) ? assignPrints(entries, await getOwnerCopies(s.collectionName, name)) : undefined;
      collections.push({ collectionName: s.collectionName, seasonName: s.name, entries: [...entries], ...(prints ? { prints } : {}) });
    }
  }
  if (collections.length === 0 && !profile) return null;
  const snap: UserSnapshot = { id: Math.random().toString(36).slice(2, 10), at: Date.now(), reason, profile: profile ?? null, collections };
  await kv.set(snapKey(name, snap.id), snap, { ex: SNAP_TTL });
  const ids = ((await kv.get<string[]>(snapIndex(name))) ?? []).filter(Boolean);
  await kv.set(snapIndex(name), [snap.id, ...ids].slice(0, SNAP_KEEP), { ex: SNAP_TTL });
  return snap;
}

/** The restore points travel with the account (lib/account-move.ts). The saved profile is renamed too, so restoring one can never recreate the old login. Safe to repeat. */
export async function moveUserSnapshots(from: string, to: string): Promise<void> {
  const ids = ((await kv.get<string[]>(snapIndex(from))) ?? []).filter(Boolean);
  for (const id of ids) {
    const snap = await kv.get<UserSnapshot>(snapKey(from, id));
    if (snap) await kv.set(snapKey(to, id), { ...snap, profile: snap.profile ? { ...snap.profile, username: to } : null }, { ex: SNAP_TTL });
    await kv.del(snapKey(from, id));
  }
  if (ids.length > 0) await kv.set(snapIndex(to), ids, { ex: SNAP_TTL });
  await kv.del(snapIndex(from));
}

export async function listUserSnapshots(username: string): Promise<UserSnapshot[]> {
  const name = username.toLowerCase();
  try {
    const ids = (await kv.get<string[]>(snapIndex(name))) ?? [];
    const snaps = await Promise.all(ids.map(id => kv.get<UserSnapshot>(snapKey(name, id))));
    return snaps.filter((s): s is UserSnapshot => !!s);
  } catch {
    return [];
  }
}

/** Puts a restore point back: each saved collection is replaced with the saved cards (a restore point is taken of what it overwrites). */
export async function restoreUserSnapshot(username: string, id: string): Promise<{ ok: true; cards: number } | { ok: false; error: string }> {
  const name = username.toLowerCase();
  const snap = await kv.get<UserSnapshot>(snapKey(name, id));
  if (!snap) return { ok: false, error: 'That restore point has expired or no longer exists.' };
  const open = await listOpenTrades();
  if (open.some(t => t.from === name || t.to === name)) return { ok: false, error: 'This viewer has open trade offers. Cancel or wait for them to end first (the cards in an offer belong to the trade).' };
  for (const c of snap.collections) {
    if (!c.prints || c.prints.length !== c.entries.length || !(await isTracking(c.collectionName))) continue;
    const block = await printsBlocked(c.collectionName, name, c.prints);
    if (block) return { ok: false, error: block };
  }
  await takeUserSnapshot(name, 'Before restoring');
  let cards = 0;
  for (const c of snap.collections) {
    await withCollectionLock(c.collectionName, async () => {
      const tracking = await isTracking(c.collectionName);
      const exact = tracking && c.prints && c.prints.length === c.entries.length ? c.prints : undefined;
      await updateCollection(c.collectionName, [name], () => ({
        result: undefined,
        cards: { [name]: [...c.entries] },
        ctx: exact ? { restore: { owner: name, ids: exact } } : tracking ? { restoreRetired: name } : undefined,
      }));
    });
    cards += c.entries.length;
  }
  if (snap.profile) await saveUserProfile(snap.profile);
  if (snap.profile?.flags?.hideFromBoard) await setHidden(name, true);
  await recordAudit(name, 'Restored from a restore point', `${cards} cards · ${snap.reason}`);
  return { ok: true, cards };
}

// ── Merge ──

/**
 * Moves every card of `from` into `into` (all seasons), unions their tags, keeps `into`'s profile and removes `from`'s. Refused while either
 * has open trade offers (escrowed cards belong to the trade). Restore points are taken of both first.
 */
export async function mergeUsers(fromRaw: string, intoRaw: string): Promise<{ ok: true; cards: number } | { ok: false; error: string }> {
  const from = fromRaw.toLowerCase().trim();
  const into = intoRaw.toLowerCase().trim().replace(/^@/, '');
  if (!from || !into || from === into) return { ok: false, error: 'Choose a different account to merge into.' };
  const open = await listOpenTrades();
  if (open.some(t => t.from === from || t.to === from || t.from === into || t.to === into)) return { ok: false, error: 'One of them has open trade offers. Cancel or wait for them to end first (the cards in an offer belong to the trade).' };

  await takeUserSnapshot(from, `Before merging into ${into}`);
  await takeUserSnapshot(into, `Before merging ${from} into it`);
  let moved = 0;
  for (const s of await listSeasons()) {
    await withCollectionLock(s.collectionName, () => updateCollection(s.collectionName, [from, into], cards => {
      const mine = cards[from];
      if (mine.length === 0) return { result: undefined };
      moved += mine.length;
      return { result: undefined, cards: { [into]: [...cards[into], ...mine], [from]: [] } };
    }));
  }
  const [fromProfile, intoProfile] = await Promise.all([getUserProfile(from), getUserProfile(into)]);
  const base = intoProfile ?? { username: into, displayName: into, createdAt: fromProfile?.createdAt ?? Date.now() };
  await saveUserProfile({ ...base, createdAt: Math.min(base.createdAt, fromProfile?.createdAt ?? base.createdAt), tags: cleanTags([...(base.tags ?? []), ...(fromProfile?.tags ?? [])]), twitchId: base.twitchId ?? fromProfile?.twitchId });
  await deleteUserProfile(from);
  await setHidden(from, false);
  await recordAudit(into, 'Merged an account into this one', `${from} → ${into} · ${moved} cards`);
  await recordAudit(from, 'Merged into another account', `${from} → ${into} · ${moved} cards`);
  return { ok: true, cards: moved };
}
