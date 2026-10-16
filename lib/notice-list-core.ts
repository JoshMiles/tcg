import type { Notice } from './trade-notice-core';

// The /notifications page's grouping and filtering (client-safe, pure).

export type NoticeFilter = 'all' | 'unread' | 'offers' | 'results' | 'alerts' | 'admin';
export const NOTICE_FILTERS: { id: NoticeFilter; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'unread', label: 'Unread' }, { id: 'offers', label: 'Offers' },
  { id: 'results', label: 'Results' }, { id: 'alerts', label: 'Alerts' }, { id: 'admin', label: 'Admin' },
];

export function matchesFilter(n: Notice, filter: NoticeFilter, seen: number): boolean {
  switch (filter) {
    case 'unread': return n.at > seen;
    case 'offers': return n.kind === 'offer' || n.kind === 'countered';
    case 'results': return n.kind === 'accepted' || n.kind === 'declined' || n.kind === 'cancelled' || n.kind === 'expired';
    case 'alerts': return n.kind === 'watch';
    case 'admin': return n.kind === 'admin';
    default: return true;
  }
}

/** "Today", "Yesterday" or a date, in the viewer's own time zone. */
export function dayLabel(at: number, now = Date.now()): string {
  const day = (t: number) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
  const diff = Math.round((day(now) - day(at)) / 86_400_000);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return new Date(at).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

/** Newest first, split into consecutive groups with the same day label. */
export function groupByDay(notices: Notice[], now = Date.now()): { label: string; items: Notice[] }[] {
  const out: { label: string; items: Notice[] }[] = [];
  for (const n of [...notices].sort((a, b) => b.at - a.at)) {
    const label = dayLabel(n.at, now);
    const last = out[out.length - 1];
    if (last && last.label === label) last.items.push(n); else out.push({ label, items: [n] });
  }
  return out;
}

/** The time of day in the viewer's time zone (call only after the page has mounted, so server and browser output cannot differ). */
export const timeLabel = (at: number): string => new Date(at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
