import { getSelfHidden } from './user-settings-store';
import { kv } from './db';
import { getCollection, getUserProfile, listSeasons, saveCollection, saveUserProfile, withCollectionLock, deleteUserProfile } from './kv';
import { recordAudit } from './audit';
import { listOpenTrades } from './trades';
import type { UserProfile } from './types';

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
}

const HIDDEN_KEY = 'users:hidden';

/** Viewers hidden from public rankings. One small array, kept in step by saveFlags. */
export async function getHiddenUsers(): Promise<Set<string>> {
  const [admin, self] = await Promise.all([getAdminHidden(), getSelfHidden()]);
  for (const u of self) admin.add(u);
  return admin;
}

/** Only the ones an admin hid (viewers who chose a private profile are tracked separately). */
async function getAdminHidden(): Promise<Set<string>> {
  try { return new Set((await kv.get<string[]>(HIDDEN_KEY)) ?? []); } catch { return new Set(); }
}

async function setHidden(username: string, hidden: boolean): Promise<void> {
  const set = await getAdminHidden();
  if (hidden) set.add(username); else set.delete(username);
  await kv.set(HIDDEN_KEY, [...set]);
}

async function ensureProfile(username: string): Promise<UserProfile> {
  return (await getUserProfile(username)) ?? { username, displayName: username, createdAt: Date.now() };
}

export async function saveTags(username: string, tags: string[]): Promise<string[]> {
  const name = username.toLowerCase();
  const profile = await ensureProfile(name);
  const clean = cleanTags(tags);
  await saveUserProfile({ ...profile, tags: clean });
  await recordAudit(name, 'Tags changed', clean.join(', ') || 'none');
  return clean;
}

export async function saveFlags(username: string, flags: UserFlags): Promise<void> {
  const name = username.toLowerCase();
  const profile = await ensureProfile(name);
  const any = !!(flags.noTrading || flags.hideFromBoard);
  const next: UserFlags | undefined = any ? { noTrading: !!flags.noTrading, hideFromBoard: !!flags.hideFromBoard, reason: (flags.reason ?? '').slice(0, 200), at: Date.now() } : undefined;
  await saveUserProfile({ ...profile, flags: next });
  await setHidden(name, !!flags.hideFromBoard);
  await recordAudit(name, any ? 'Restrictions set' : 'Restrictions cleared', any ? [flags.noTrading && 'no trading', flags.hideFromBoard && 'hidden from public boards', flags.reason].filter(Boolean).join(' · ') : undefined);
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
  collections: { collectionName: string; seasonName: string; entries: number[] }[];
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
    if (entries && entries.length > 0) collections.push({ collectionName: s.collectionName, seasonName: s.name, entries: [...entries] });
  }
  if (collections.length === 0 && !profile) return null;
  const snap: UserSnapshot = { id: Math.random().toString(36).slice(2, 10), at: Date.now(), reason, profile: profile ?? null, collections };
  await kv.set(snapKey(name, snap.id), snap, { ex: SNAP_TTL });
  const ids = ((await kv.get<string[]>(snapIndex(name))) ?? []).filter(Boolean);
  await kv.set(snapIndex(name), [snap.id, ...ids].slice(0, SNAP_KEEP), { ex: SNAP_TTL });
  return snap;
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
  await takeUserSnapshot(name, 'Before restoring');
  let cards = 0;
  for (const c of snap.collections) {
    await withCollectionLock(c.collectionName, async () => {
      const data = await getCollection(c.collectionName);
      data[name] = [...c.entries];
      await saveCollection(c.collectionName, data);
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
    await withCollectionLock(s.collectionName, async () => {
      const data = await getCollection(s.collectionName);
      const mine = data[from];
      if (!mine || mine.length === 0) return;
      data[into] = [...(data[into] ?? []), ...mine];
      delete data[from];
      moved += mine.length;
      await saveCollection(s.collectionName, data);
    });
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
