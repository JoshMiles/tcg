import { kv, requestCached } from './db';
import { DEFAULT_SETTINGS, sanitizeUserSettings, sparse, type UserSettings } from './user-settings';
import { syncWatchIndex } from './watch-index';

// Server side of viewer settings: KV `user:<u>:settings` (sparse) and the set `users:hidden:self` of viewers who made their
// own profile private. The admin-set hidden list (`users:hidden`) stays separate so each side can be switched off alone.

export const SELF_HIDDEN_KEY = 'users:hidden:self';
const key = (u: string) => `user:${u.toLowerCase()}:settings`;

/** The stored settings; throws when KV can't be read. */
export async function loadUserSettings(username: string): Promise<UserSettings> {
  return sanitizeUserSettings(await kv.get(key(username)));
}

// Read once per request (keyed on the lowercase login); the object is shared, so copy it before changing it.
const readUserSettings = requestCached(async (u: string): Promise<UserSettings> => {
  try { return await loadUserSettings(u); } catch { return { ...DEFAULT_SETTINGS, experiments: [], watches: [], favourites: [] }; }
});
export const getUserSettings = (username: string): Promise<UserSettings> => readUserSettings(username.toLowerCase());

/** Viewers who chose a private profile. Never throws. */
export async function getSelfHidden(): Promise<Set<string>> {
  try { return new Set((await kv.smembers(SELF_HIDDEN_KEY)) as string[]); } catch { return new Set(); }
}

export async function saveUserSettings(username: string, input: unknown): Promise<UserSettings> {
  const u = username.toLowerCase();
  const next = sanitizeUserSettings(input);
  const prev = await getUserSettings(u);
  const small = sparse(next);
  if (Object.keys(small).length === 0) await kv.del(key(u)); else await kv.set(key(u), small);
  if (next.privateProfile) await kv.sadd(SELF_HIDDEN_KEY, u); else await kv.srem(SELF_HIDDEN_KEY, u);
  await syncWatchIndex(u, prev, next);
  return next;
}

/** The settings, the private-profile switch and the watch-index entries follow the account to a new login (lib/account-move.ts). Safe to repeat. */
export async function moveUserSettings(from: string, to: string): Promise<void> {
  const raw = await kv.get(key(from));
  if (raw) {
    await kv.set(key(to), raw);
    const settings = sanitizeUserSettings(raw);
    await syncWatchIndex(to, null, settings);
    await syncWatchIndex(from, settings, DEFAULT_SETTINGS);
  }
  if ((await getSelfHidden()).has(from)) { await kv.sadd(SELF_HIDDEN_KEY, to); await kv.srem(SELF_HIDDEN_KEY, from); }
  await kv.del(key(from));
}

export async function deleteUserSettings(username: string): Promise<void> {
  const u = username.toLowerCase();
  try { const prev = await getUserSettings(u); await kv.del(key(u)); await kv.srem(SELF_HIDDEN_KEY, u); await syncWatchIndex(u, prev, DEFAULT_SETTINGS); } catch { /* best effort */ }
}
