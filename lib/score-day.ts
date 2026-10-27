// Daily score snapshots behind the home page's "Rising this week" (ROADMAP 54.5). Pure rules first, then the two KV touches.
//
// `scoreday:<collection>` is a hash: field = UTC day `YYYY-MM-DD`, value = `{ username: score }` for that season's board as it stood at
// the nightly backup. Nothing else records a viewer's score a week ago (score history only exists for viewers who open My Stats).

import { kv } from './db';
import type { Season } from './types';
import { getActiveSeason } from './kv';
import { getSeasonLeaderboard } from './leaderboard';

export const SCOREDAY_KEEP_DAYS = 8;
export const RISING_DAYS = 7;
export const RISING_LIMIT = 5;
const DAY_MS = 86_400_000;

export type ScoreDay = Record<string, number>;
export const scoreDayKey = (collectionName: string) => `scoreday:${collectionName}`;
export const dayOf = (at: number) => new Date(at).toISOString().slice(0, 10);
const dayStart = (day: string) => Date.parse(day + 'T00:00:00Z');

/** The map to store: every ranked viewer's rounded score. */
export function scoresOf(rows: { username: string; score: number }[]): ScoreDay {
  return Object.fromEntries(rows.map(r => [r.username, Math.round(r.score)]));
}

/** Which day fields to delete: those more than `keep` days before today. */
export function daysToPrune(fields: string[], now: number, keep = SCOREDAY_KEEP_DAYS): string[] {
  const oldest = dayStart(dayOf(now)) - keep * DAY_MS;
  return fields.filter(f => dayStart(f) < oldest);
}

export interface Rising {
  /** Biggest gains first, positive only. */
  gains: { username: string; gain: number; score: number }[];
  /** The baseline day, or null when there is no snapshot to compare with yet. */
  since: string | null;
  /** The baseline is under 7 days old, so the gains cover a shorter stretch than a week. */
  partial: boolean;
}

/** Gain = current score minus the score in the oldest snapshot at most 7 days old (a viewer missing from it counts from 0). */
export function risingGains(rows: { username: string; score: number }[], days: Record<string, ScoreDay>, now: number, limit = RISING_LIMIT): Rising {
  const earliest = dayStart(dayOf(now)) - RISING_DAYS * DAY_MS;
  const since = Object.keys(days).filter(d => dayStart(d) >= earliest).sort()[0] ?? null;
  if (!since) return { gains: [], since: null, partial: false };
  const base = days[since] ?? {};
  const gains = rows
    .map(r => ({ username: r.username, score: Math.round(r.score), gain: Math.round(r.score) - (base[r.username] ?? 0) }))
    .filter(g => g.gain > 0)
    .sort((a, b) => b.gain - a.gain || a.username.localeCompare(b.username))
    .slice(0, limit);
  return { gains, since, partial: dayStart(since) > earliest };
}

/** Cron step: store today's board for the season, then drop days older than 8. Throws on KV errors; the caller isolates it. */
export async function writeScoreDay(season: Season, rows: { username: string; score: number }[], now = Date.now()): Promise<number> {
  const key = scoreDayKey(season.collectionName);
  await kv.hset(key, { [dayOf(now)]: scoresOf(rows) });
  const old = daysToPrune(await kv.hkeys(key), now);
  if (old.length) await kv.hdel(key, ...old);
  return old.length;
}

/** Every stored day for a season (one read). Empty when none, or on a KV error: the home page then shows its fallback. */
export async function readScoreDays(season: Season): Promise<Record<string, ScoreDay>> {
  try { return (await kv.hgetall<Record<string, ScoreDay>>(scoreDayKey(season.collectionName))) ?? {}; } catch { return {}; }
}

/** The nightly step: snapshot the active season's board (the same builder the home page uses, hidden players already left out). Null when no season is active. */
export async function snapshotActiveSeason(now = Date.now()): Promise<{ season: string; viewers: number; pruned: number } | null> {
  const season = await getActiveSeason();
  if (!season) return null;
  const { rows } = await getSeasonLeaderboard(season);
  return { season: season.id, viewers: rows.length, pruned: await writeScoreDay(season, rows, now) };
}

/** Account deletion: take the viewer out of every stored day so their name does not linger the 8 days the snapshots live. */
export async function removeUserFromScoreDays(collectionName: string, username: string): Promise<void> {
  const user = username.toLowerCase();
  const key = scoreDayKey(collectionName);
  const days = (await kv.hgetall<Record<string, ScoreDay>>(key)) ?? {};
  const fixed = Object.fromEntries(Object.entries(days).filter(([, m]) => user in m).map(([d, m]) => { const { [user]: _, ...rest } = m; return [d, rest]; }));
  if (Object.keys(fixed).length) await kv.hset(key, fixed);
}
