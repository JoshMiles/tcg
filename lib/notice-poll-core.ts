// How the bell polls (client-safe, pure): the version counter that lets the server answer "nothing changed", and the polling pace.

export const POLL_FAST_MS = 10_000;
export const POLL_SLOW_MS = 60_000;
/** After this long without any input the bell slows down. */
export const IDLE_AFTER_MS = 5 * 60_000;

/** The `since` query value as a version, or null when absent or not a whole number. */
export function parseSince(raw: string | null | undefined): number | null {
  if (raw == null || !/^\d{1,15}$/.test(raw)) return null;
  return Number(raw);
}

/** Should the server answer 204 (nothing changed)? Only when the caller states the version it already has. */
export function isUnchanged(since: number | null, version: number): boolean {
  return since !== null && since === version;
}

/** Wait before the next poll, or null to stop (the tab is hidden: a check runs at once when it is shown again). */
export function pollDelay(hidden: boolean, idleMs: number): number | null {
  if (hidden) return null;
  return idleMs >= IDLE_AFTER_MS ? POLL_SLOW_MS : POLL_FAST_MS;
}

/** The tab title with a `(N)` prefix for N unread notices (any old prefix replaced). */
export function titleWithCount(title: string, unread: number): string {
  const base = title.replace(/^\(\d+\+?\)\s*/, '');
  return unread > 0 ? `(${unread > 99 ? '99+' : unread}) ${base}` : base;
}

/** Notices newer than what the viewer last saw that this browser has not announced yet (toast, shake, sound). */
export function freshNotices<T extends { id: string; at: number }>(notices: T[], seen: number, announced: Set<string>): T[] {
  return notices.filter(n => n.at > seen && !announced.has(n.id));
}
