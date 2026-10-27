// Up and down history of TCG Bridge, Mix It Up and OBS per stream (ROADMAP 55.11), the pure part. lib/bridge-uptime.ts keeps the list in KV.
// A stream is opened when the site first sees it live and closed when the recap is built; changes outside a stream are not kept.

export const UPTIME_PARTS = ['bridge', 'mix', 'obs'] as const;
export type UptimePart = (typeof UPTIME_PARTS)[number];
export const UPTIME_LABEL: Record<UptimePart, string> = { bridge: 'TCG Bridge', mix: 'Mix It Up', obs: 'OBS' };
export const UPTIME_STREAMS_MAX = 10;
const CHANGES_MAX = 300;

export interface UptimeChange { at: number; part: UptimePart; up: boolean }
export interface UptimeStream { from: number; to?: number; changes: UptimeChange[] }

/** A new stream at the end of the list; a stream still open is closed first. Only the last 10 are kept. */
export const openStream = (list: UptimeStream[], at: number): UptimeStream[] =>
  [...list.map(s => (s.to === undefined ? { ...s, to: at } : s)), { from: at, changes: [] }].slice(-UPTIME_STREAMS_MAX);

/** The open stream closed at `at`, or null when none is open. */
export function closeStream(list: UptimeStream[], at: number): UptimeStream[] | null {
  const last = list[list.length - 1];
  return last && last.to === undefined ? [...list.slice(0, -1), { ...last, to: at }] : null;
}

/** The list with this change added, or null when nothing needs writing: no open stream, or the part is already in that state. */
export function recordChange(list: UptimeStream[], part: UptimePart, up: boolean, at: number): UptimeStream[] | null {
  const last = list[list.length - 1];
  if (!last || last.to !== undefined || last.changes.length >= CHANGES_MAX) return null;
  const prev = last.changes.filter(c => c.part === part).pop();
  if (prev?.up === up) return null;
  return [...list.slice(0, -1), { ...last, changes: [...last.changes, { at: Math.max(at, last.from), part, up }] }];
}

export interface Segment { state: 'up' | 'down' | 'unknown'; pct: number }
/** One part's bar for a stream: its states from start to end (or `now`) as shares of the whole, which add up to 100. */
export function segments(s: UptimeStream, part: UptimePart, now: number): Segment[] {
  const end = Math.max(s.to ?? now, s.from + 1);
  const span = end - s.from;
  const out: Segment[] = [];
  let at = s.from;
  let state: Segment['state'] = 'unknown';
  const push = (until: number) => {
    const to = Math.min(Math.max(until, at), end);
    if (to > at) out.push({ state, pct: ((to - at) / span) * 100 });
    at = to;
  };
  for (const c of s.changes.filter(x => x.part === part)) { push(c.at); state = c.up ? 'up' : 'down'; }
  push(end);
  return out;
}

/** Stored junk never reaches the page: only well-formed streams. */
export function readUptimeList(raw: unknown): UptimeStream[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((x): UptimeStream[] => {
    const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    if (typeof o.from !== 'number' || !Array.isArray(o.changes)) return [];
    const changes = o.changes.filter((c): c is UptimeChange => !!c && typeof c.at === 'number' && typeof c.up === 'boolean' && (UPTIME_PARTS as readonly string[]).includes(c.part));
    return [{ from: o.from, ...(typeof o.to === 'number' ? { to: o.to } : {}), changes }];
  }).slice(-UPTIME_STREAMS_MAX);
}
