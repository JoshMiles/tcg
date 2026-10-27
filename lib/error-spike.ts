import { kv, inSandbox } from './db';
import { hourKey } from './stats';
import { notifyAdminLog } from './discord';

// Error spike alert (ROADMAP 51.13). Every server failure that goes through serverError() (lib/trade-api.ts) bumps one hourly counter
// in the hash `stats:h:errors` (field "<UTC hour>", same format as lib/stats.ts). The minute cron calls errorSpikeOncePerHour(), which
// once per hour compares the last complete hour with the average of the 24 hours before it and posts to the Discord admin log on a jump.

export const SPIKE_MIN = 10; // never alert below this many failures in an hour
export const SPIKE_FACTOR = 3; // ... or below this many times the usual hour
const ERRORS_KEY = 'stats:h:errors';
const HOUR = 3_600_000;
const KEEP_HOURS = 48;

/** The rule: a jump is at least SPIKE_MIN failures and at least SPIKE_FACTOR times the average hour. */
export const isSpike = (count: number, average: number): boolean => count >= Math.max(SPIKE_MIN, SPIKE_FACTOR * average);

/** Counts one server failure. Fire and forget: it never throws and the caller never waits for it. */
export function recordServerError(at = Date.now()): void {
  try { void kv.hincrby(ERRORS_KEY, hourKey(at), 1).catch(() => {}); } catch { /* counting must never break the response */ }
}

export type SpikeOutcome = { status: 'alerted'; hour: string; count: number; average: number } | { status: 'quiet' | 'already' | 'skipped'; hour: string } | { status: 'error'; error: string };

/** The minute cron's step: looks at the last complete hour once per hour (a lock per hour) and posts when it is a spike. */
export async function errorSpikeOncePerHour(now = Date.now()): Promise<SpikeOutcome> {
  const hour = hourKey(now - HOUR);
  if (await inSandbox()) return { status: 'skipped', hour };
  if (!(await kv.set(`errors:alerted:${hour}`, now, { nx: true, ex: 3 * 3600 }))) return { status: 'already', hour };
  try {
    const counts = (await kv.hgetall<Record<string, number | string>>(ERRORS_KEY)) ?? {};
    const n = (h: string) => Number(counts[h]) || 0;
    const count = n(hour);
    let sum = 0;
    for (let i = 2; i <= 25; i++) sum += n(hourKey(now - i * HOUR));
    const average = sum / 24;
    const stale = Object.keys(counts).filter(h => h < hourKey(now - KEEP_HOURS * HOUR));
    if (stale.length) await kv.hdel(ERRORS_KEY, ...stale).catch(() => {});
    if (!isSpike(count, average)) return { status: 'quiet', hour };
    await notifyAdminLog({ action: 'Error spike', detail: `${count} server errors in the last hour (usual: ${average.toFixed(1)} an hour).` });
    return { status: 'alerted', hour, count, average };
  } catch (e) {
    return { status: 'error', error: e instanceof Error ? e.message : 'Error spike check failed.' };
  }
}
