// The event feed (ROADMAP 57.7): the last event rewards the site sent (the same lines as the Mix It Up log), cleaned for the Status tab and the
// live pull feed window. Plain TypeScript, no Electron. The windows show these strings with textContent only.

/** One event reward, ready to show: `time` is the local clock time, `amount` is '-' when there was none, `result` says what it earned or why it was ignored. */
export interface EventLine { at: number; time: string; event: string; viewer: string; amount: string; ok: boolean; result: string }
export const EVENTS_KEEP = 30;

const LABELS: Record<string, string> = { 'gifted-subs': 'Gifted subs', bits: 'Bits', raid: 'Raid', redeem: 'Channel point redeem', 'stream-online': 'Stream online', 'stream-offline': 'Stream offline' };
const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : '');
const pad = (n: number): string => String(n).padStart(2, '0');

/** Local clock time, 14:05:09. */
export const clock = (at: number): string => { const d = new Date(at); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };

/** What the line says it earned, or why it was ignored ("ok" with nothing said means the event was fine but earned nothing, such as bits under the price of a pack). */
export function resultText(ok: boolean, detail: string): string {
  const d = text(detail, 200);
  if (ok) return d && d !== 'ok' ? d : 'Nothing earned';
  return 'Ignored: ' + (d.replace(/_/g, ' ') || 'no reason given');
}

/** One line from the site's `events` answer; null when it is not one. */
export function cleanEvent(raw: unknown): EventLine | null {
  const o = (raw && typeof raw === 'object' ? raw : null) as Record<string, unknown> | null;
  if (!o || typeof o.at !== 'number' || !Number.isFinite(o.at) || o.at <= 0 || typeof o.event !== 'string' || typeof o.username !== 'string') return null;
  const amount = typeof o.amount === 'number' && Number.isFinite(o.amount) && o.amount > 0 ? Math.trunc(o.amount).toLocaleString('en-US') : '-';
  return { at: o.at, time: clock(o.at), event: LABELS[o.event] ?? (text(o.event, 30) || 'Event'), viewer: text(o.username, 40) || '-', amount, ok: o.ok === true, result: resultText(o.ok === true, text(o.detail, 200)) };
}

/** The site's list (newest first), cleaned: junk lines dropped, at most 30. */
export const cleanEvents = (raw: unknown): EventLine[] => (Array.isArray(raw) ? raw.slice(0, EVENTS_KEEP).flatMap(r => cleanEvent(r) ?? []) : []);

/** New lines in front of the ones already held (newest first), the same line never twice, kept to 30. */
export function mergeEvents(held: readonly EventLine[], fresh: readonly EventLine[]): EventLine[] {
  const seen = new Set<string>();
  const key = (e: EventLine) => `${e.at}|${e.viewer}|${e.event}`;
  return [...fresh, ...held].filter(e => !seen.has(key(e)) && !!seen.add(key(e))).slice(0, EVENTS_KEEP);
}

/** Where to ask from next: the newest line held, or 0 for everything. */
export const eventsAfter = (held: readonly EventLine[]): number => held.reduce((m, e) => Math.max(m, e.at), 0);
