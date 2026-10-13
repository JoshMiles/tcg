import { kv } from './db';
import { DEFAULT_SETTINGS, sanitizeUserSettings, sparse, type UserSettings } from './user-settings';
import { syncWatchIndex } from './watch-index';

// Server side of viewer settings: KV `user:<u>:settings` (sparse) and the set `users:hidden:self` of viewers who made their
// own profile private. The admin-set hidden list (`users:hidden`) stays separate so each side can be switched off alone.

export const SELF_HIDDEN_KEY = 'users:hidden:self';
const key = (u: string) => `user:${u.toLowerCase()}:settings`;

export async function getUserSettings(username: string): Promise<UserSettings> {
  try { return sanitizeUserSettings(await kv.get(key(username))); } catch { return { ...DEFAULT_SETTINGS, experiments: [], watches: [] }; }
}

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

export async function deleteUserSettings(username: string): Promise<void> {
  const u = username.toLowerCase();
  try { const prev = await getUserSettings(u); await kv.del(key(u)); await kv.srem(SELF_HIDDEN_KEY, u); await syncWatchIndex(u, prev, DEFAULT_SETTINGS); } catch { /* best effort */ }
}
