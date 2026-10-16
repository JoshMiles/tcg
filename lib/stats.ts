import { kv } from './db';

// A small time-series store behind the dashboard charts. recordActivity() calls recordStats() for every event, which bumps hourly
// counters in one hash per season collection (`stats:h:<collection>`, field "<UTC hour>|<metric>") and adds the viewer to that
// day's set (`stats:u:<collection>:<UTC day>`). The activity log is capped at 500 events, so it can't answer "pulls per day this
// season"; these counters can. They only count from when tracking began (`stats:since:<collection>`).

export type Metric = 'pull' | 'newCard' | 'newViewer' | 'upgrade' | 'trade' | 'grant' | 'v:reverse' | 'v:full' | 'v:shiny';
export const METRICS: Metric[] = ['pull', 'newCard', 'newViewer', 'upgrade', 'trade', 'grant', 'v:reverse', 'v:full', 'v:shiny'];

const pad = (n: number) => String(n).padStart(2, '0');
const hourKey = (t: number) => { const d = new Date(t); return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}`; };
const dayKey = (t: number) => hourKey(t).slice(0, 8);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

interface StatEvent {
  type: string;
  username: string;
  collectionName?: string;
  [k: string]: unknown;
}

/** Counts one activity event. Never throws: statistics must not break the action they describe. */
export async function recordStats(e: StatEvent, at = Date.now()): Promise<void> {
  const coll = e.collectionName;
  if (!coll) return;
  try {
    const bumps: Metric[] = [];
    // A card granted by webhook (a Mix It Up reward) counts as a pull everywhere the numbers are shown (the weekly digest, the dashboard charts).
    if (e.type === 'pull' || (e.type === 'grant' && e.source === 'webhook')) {
      bumps.push('pull');
      if (e.isNew) bumps.push('newCard');
      if (e.copies === 1 && e.uniqueOwned === 1) bumps.push('newViewer');
      if (typeof e.packName === 'string' && e.packName) bumps.push(`p:${e.packName}` as Metric);
      const v = e.variant as string | undefined;
      if (v === 'reverse' || v === 'full' || v === 'shiny') bumps.push(`v:${v}` as Metric);
    } else if (e.type === 'upgrade') bumps.push('upgrade');
    else if (e.type === 'trade' && e.action === 'accepted') bumps.push('trade');
    else if (e.type === 'grant') bumps.push('grant'); // an admin grant
    if (bumps.length === 0) return;

    const key = `stats:h:${coll}`;
    const h = hourKey(at);
    await Promise.all(bumps.map(m => kv.hincrby(key, `${h}|${m}`, 1)));
    await kv.set(`stats:since:${coll}`, at, { nx: true });
    if (e.username) {
      await kv.sadd(`stats:u:${coll}:${dayKey(at)}`, e.username);
      await kv.hset('stats:last', { [e.username]: at }); // when each viewer was last seen (the Users page)
    }
  } catch { /* best effort */ }
}

export interface Series {
  /** Bucket start times (ms), oldest first. */
  starts: number[];
  step: 'hour' | 'day';
  /** One number per bucket, per metric. */
  data: Record<Metric, number[]>;
  /** Distinct active viewers per day-bucket (day step only; hour step leaves it empty). */
  viewers: number[];
  /** When tracking began, or null if nothing has been recorded. */
  since: number | null;
}

export interface Range { id: '24h' | '7d' | 'season'; label: string }
export const RANGES: Range[] = [{ id: '24h', label: '24 hours' }, { id: '7d', label: '7 days' }, { id: 'season', label: 'Season' }];

/** Buckets for a range ending now: hourly for 24h, daily otherwise (the season range starts at `seasonStart`, at most 90 days back). */
export function bucketsFor(range: Range['id'], seasonStart: number, now = Date.now()): { starts: number[]; step: 'hour' | 'day' } {
  if (range === '24h') {
    const end = Math.floor(now / HOUR) * HOUR;
    return { step: 'hour', starts: Array.from({ length: 24 }, (_, i) => end - (23 - i) * HOUR) };
  }
  const endDay = Math.floor(now / DAY) * DAY;
  const days = range === '7d' ? 7 : Math.max(2, Math.min(90, Math.ceil((endDay - Math.floor(seasonStart / DAY) * DAY) / DAY) + 1));
  return { step: 'day', starts: Array.from({ length: days }, (_, i) => endDay - (days - 1 - i) * DAY) };
}

/** The series for the given buckets (and, for a comparison, pass the previous period's buckets). */
export async function getSeries(coll: string, starts: number[], step: 'hour' | 'day'): Promise<Series> {
  const empty = () => Object.fromEntries(METRICS.map(m => [m, starts.map(() => 0)])) as Record<Metric, number[]>;
  try {
    const [hash, since] = await Promise.all([kv.hgetall<Record<string, number | string>>(`stats:h:${coll}`), kv.get<number>(`stats:since:${coll}`)]);
    const data = empty();
    const span = step === 'hour' ? HOUR : DAY;
    const index = new Map(starts.map((s, i) => [step === 'hour' ? hourKey(s) : dayKey(s), i]));
    for (const [field, value] of Object.entries(hash ?? {})) {
      const bar = field.indexOf('|');
      const h = field.slice(0, bar);
      const i = index.get(step === 'hour' ? h : h.slice(0, 8));
      if (i === undefined) continue;
      const bucket = data[field.slice(bar + 1) as Metric];
      if (bucket) bucket[i] += Number(value) || 0; // per-pack counters (p:<name>) aren't part of a series
    }
    const viewers = step === 'day'
      ? await Promise.all(starts.map(s => kv.scard(`stats:u:${coll}:${dayKey(s)}`).catch(() => 0)))
      : [];
    void span;
    return { starts, step, data, viewers, since: since ?? null };
  } catch {
    return { starts, step, data: empty(), viewers: [], since: null };
  }
}

export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Pulls per pack name since tracking began, summed over the given season collections. Powers the "share of draws" on the pack library. */
export async function getPackPulls(collections: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  try {
    const hashes = await Promise.all(collections.map(c => kv.hgetall<Record<string, number | string>>(`stats:h:${c}`)));
    for (const hash of hashes) {
      for (const [field, value] of Object.entries(hash ?? {})) {
        const bar = field.indexOf('|');
        const metric = field.slice(bar + 1);
        if (!metric.startsWith('p:')) continue;
        out[metric.slice(2)] = (out[metric.slice(2)] ?? 0) + (Number(value) || 0);
      }
    }
  } catch { /* best effort */ }
  return out;
}

/** When each viewer was last seen doing something (pull, upgrade, trade, grant), since tracking began. */
export async function getLastSeen(): Promise<Record<string, number>> {
  try {
    const all = await kv.hgetall<Record<string, number | string>>('stats:last');
    return Object.fromEntries(Object.entries(all ?? {}).map(([u, t]) => [u, Number(t) || 0]));
  } catch { return {}; }
}
