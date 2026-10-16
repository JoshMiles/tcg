// Per-viewer pull limits in KV (`user:<name>:pulllimit`), see pull-limit-core.ts. Buff cards and admins both go through addBuff.
import { kv } from './db';
import { isEmpty, normalizePullLimit, withBase, withBuff, withoutBuff, type UserPullLimit } from './pull-limit-core';

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
