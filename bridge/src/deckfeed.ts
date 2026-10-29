// The queue list and the live feed the OBS dock reads from the Stream Deck link (ROADMAP 62.2), the pure parts. Plain TypeScript, no Electron.
import { DECK_FEED_MAX, DECK_QUEUE_MAX, type DeckFeedLine, type DeckQueueRow } from './deckprotocol';
import type { FeedRow } from './home';
import type { QueueRow } from './site';

const line = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** The site's overlay queue (next pull first) as the dock shows it: the first DECK_QUEUE_MAX, the first one `showing`. `what` is the pack of a pull, else "Show-off". */
export function deckQueue(rows: readonly QueueRow[]): DeckQueueRow[] {
  return rows.slice(0, DECK_QUEUE_MAX).map((r, i) => ({
    viewer: line(r.username, 40) || '-',
    what: r.kind === 'pull' ? line(r.pack, 80) || 'Pack pull' : 'Show-off',
    waitingSec: Number.isFinite(r.waitedS) && r.waitedS > 0 ? Math.trunc(r.waitedS) : 0,
    showing: i === 0,
  }));
}

/**
 * The Home feed's rows (newest first) as the dock's feed: the last DECK_FEED_MAX lines. A pull is `pulls`, a job `requests`, an event reward `events`;
 * one that was refused or failed (badge "!") is a `problem` whatever it was.
 */
export function deckFeed(rows: readonly FeedRow[]): DeckFeedLine[] {
  return rows.slice(0, DECK_FEED_MAX).map(r => {
    const who = r.viewer && r.viewer !== '-' ? r.viewer : '';
    const body = r.kind === 'pull' ? `${who || 'Someone'} pulled ${r.text}${r.tag ? ` (${r.tag})` : ''}` : [who, r.text].filter(Boolean).join(' ');
    return { at: r.at, kind: r.badge === '!' ? 'problems' : r.kind === 'pull' ? 'pulls' : r.kind === 'job' ? 'requests' : 'events', text: line(body, 200) };
  });
}
