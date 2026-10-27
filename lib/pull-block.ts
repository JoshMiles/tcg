// Block a viewer from pulls (ROADMAP 55.12). Set from TCG Bridge's Staff tab, listed on the Mix It Up page with "Lift". While a block holds, a
// paid pull, a !pack (queuePull) and a gifted pack (lib/staff-actions.ts) are refused. KV hash `pulls:blocked`: viewer -> { by, at, streamKey? }.
// A block with a `streamKey` ends with that stream (the key is the stream marker of currentStreamKey()); one without lasts until lifted.
import { kv } from './db';
import { currentStreamKey, logMixItUp } from './mixitup';
import { refusalMessage } from './mixitup-core';

const KEY = 'pulls:blocked';
export interface PullBlock { username: string; by: string; at: number; streamKey?: string }

export async function blockPulls(username: string, by: string, thisStreamOnly: boolean): Promise<void> {
  const user = username.toLowerCase();
  await kv.hset(KEY, { [user]: { by: by.slice(0, 80), at: Date.now(), ...(thisStreamOnly ? { streamKey: await currentStreamKey() } : {}) } });
}

/** True when there was a block to lift. */
export async function liftPullBlock(username: string): Promise<boolean> {
  return ((await kv.hdel(KEY, username.toLowerCase())) ?? 0) > 0;
}

/** Every block that still holds (a block from an earlier stream is skipped; it is cleaned out the next time its viewer is checked). */
export async function listPullBlocks(): Promise<PullBlock[]> {
  const all = await kv.hgetall<Record<string, Omit<PullBlock, 'username'>>>(KEY).catch(() => null);
  const key = Object.values(all ?? {}).some(b => b.streamKey) ? await currentStreamKey() : '';
  return Object.entries(all ?? {}).filter(([, b]) => !b.streamKey || b.streamKey === key).map(([username, b]) => ({ username, ...b })).sort((a, b) => b.at - a.at);
}

/** The refusal to send a viewer who is blocked, else null. It is logged like any other refusal (the Mix It Up log). */
export async function blockedRefusal(username: string): Promise<{ reason: 'blocked'; message: string } | null> {
  const user = username.toLowerCase();
  const b = await kv.hget<Omit<PullBlock, 'username'>>(KEY, user).catch(() => null);
  if (!b) return null;
  if (b.streamKey && b.streamKey !== (await currentStreamKey())) { await kv.hdel(KEY, user).catch(() => {}); return null; }
  await logMixItUp({ username: user, what: 'refused', ok: false, detail: 'blocked' });
  return { reason: 'blocked', message: refusalMessage('blocked', { cost: 0, currency: '', limit: 0 }, user) };
}
