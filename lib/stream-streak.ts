import { kv } from './db';
import { nextStreak, type Streak } from './achievements';
import { currentStreamNumber } from './twitch-live';

// TRIAL (ROADMAP 50.10): per viewer, the last stream they pulled on and their run of streams in a row (KV `user:<u>:streak`).

const key = (u: string) => `user:${u.toLowerCase()}:streak`;

/** Notes a pull. Only pulls during a stream count; a second pull in the same stream does not write. Never throws: a pull must not fail over this. */
export async function recordStreamPull(username: string): Promise<void> {
  try {
    const stream = await currentStreamNumber();
    if (stream === null) return;
    const prev = await kv.get<Streak>(key(username));
    const next = nextStreak(prev, stream);
    if (next !== prev) await kv.set(key(username), next);
  } catch (e) {
    console.error('[streak] failed:', e instanceof Error ? e.message : e);
  }
}

/** The viewer's current run of streams in a row (0 if none). */
export async function getStreakRun(username: string): Promise<number> {
  return (await kv.get<Streak>(key(username)))?.run ?? 0;
}
