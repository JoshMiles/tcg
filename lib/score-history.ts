import { kv } from './db';
import { HISTORY_CAP, shouldSample, type ScoreSample } from './score-history-core';

const key = (u: string, seasonId: string) => `user:${u.toLowerCase()}:scorehist:${seasonId}`;

/** Newest first. */
export async function getScoreHistory(username: string, seasonId: string): Promise<ScoreSample[]> {
  try { return (await kv.lrange<ScoreSample>(key(username, seasonId), 0, HISTORY_CAP - 1)) ?? []; } catch { return []; }
}

/** Stores a sample when it is worth keeping (see shouldSample). Best effort: never throws. Returns the history including it. */
export async function recordScoreSample(username: string, seasonId: string, score: number, rank: number | null, now = Date.now()): Promise<ScoreSample[]> {
  const history = await getScoreHistory(username, seasonId);
  try {
    if (shouldSample(history[0], { score, rank }, now)) {
      const sample: ScoreSample = { at: now, score, rank };
      await kv.lpush(key(username, seasonId), sample);
      await kv.ltrim(key(username, seasonId), 0, HISTORY_CAP - 1);
      return [sample, ...history].slice(0, HISTORY_CAP);
    }
  } catch { /* best effort */ }
  return history;
}
