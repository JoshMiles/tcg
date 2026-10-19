// Per-viewer pull limits in KV (`user:<name>:pulllimit`), see pull-limit-core.ts. Buff cards and admins both go through addBuff.
import { kv } from './db';
import { isEmpty, normalizePullLimit, normalizeStreamBuff, streamAmount, withBase, withBuff, withoutBuff, type StreamPullBuff, type UserPullLimit } from './pull-limit-core';

const key = (u: string) => `user:${u.toLowerCase()}:pulllimit`;

export async function getUserPullLimit(username: string): Promise<UserPullLimit> {
  return normalizePullLimit(await kv.get(key(username)).catch(() => null));
}

async function save(username: string, rec: UserPullLimit): Promise<UserPullLimit> {
  if (isEmpty(rec)) await kv.del(key(username)); else await kv.set(key(username), rec);
  return rec;
}

/** This viewer's own base limit per stream (null = follow the default from Settings, 0 = no limit). */
export async function setUserBaseLimit(username: string, value: unknown): Promise<UserPullLimit> {
  return save(username, withBase(await getUserPullLimit(username), value));
}

/** A temporary bonus: +amount pulls per stream for `hours` (0 or empty = until removed). Null when the input is unusable or there are too many. */
export async function addUserPullBuff(username: string, o: { amount: unknown; hours?: unknown; source?: string; note?: string }): Promise<UserPullLimit | null> {
  const next = withBuff(await getUserPullLimit(username), { ...o, id: crypto.randomUUID() });
  return next ? save(username, next) : null;
}

export async function removeUserPullBuff(username: string, id: string): Promise<UserPullLimit> {
  return save(username, withoutBuff(await getUserPullLimit(username), id));
}

export async function deleteUserPullLimit(username: string): Promise<void> {
  await kv.del(key(username)).catch(() => {});
}

const STREAM_KEY = 'pulls:stream-buff';

/** The everyone-bonus, or null when none is stored. A stale stream key is ignored by the caller. */
export async function getStreamBuff(): Promise<StreamPullBuff | null> {
  return normalizeStreamBuff(await kv.get(STREAM_KEY).catch(() => null));
}

/** Sets the everyone-bonus for this stream key. 0 deletes it. Null when the amount is not a whole number. */
export async function setStreamPullBuff(amount: unknown, streamKey: string, by: string): Promise<StreamPullBuff | null> {
  const n = streamAmount(amount);
  if (n === null) return null;
  if (n === 0) { await kv.del(STREAM_KEY); return null; }
  const rec: StreamPullBuff = { amount: n, streamKey, by: by.slice(0, 60) || 'admin', at: Date.now() };
  await kv.set(STREAM_KEY, rec);
  return rec;
}
