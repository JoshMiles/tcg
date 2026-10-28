// The Home dashboard's pure parts (ROADMAP 59.5): the one live feed (pulls, event rewards, Mix It Up jobs), its filters, the "this stream"
// numbers and the checklist's summary line. Plain TypeScript, no Electron. The window shows these strings with textContent only.
import type { LedgerRow } from './bucks';
import { clock, type EventLine } from './events';
import type { ChecklistLine } from './checklist';
import type { FeedItem } from './feed';
import type { JobEntry } from './service';

/** One pull the app was told about (the live feed's item, with the time it arrived). */
export interface PullEntry { at: number; viewer: string; card: string; rarity: string; stars: number; variant: string; serial?: number; image?: string }
export const PULLS_KEEP = 500;
export const FEED_KEEP = 100;

export type FeedKind = 'pull' | 'event' | 'job';
/** Filters of the feed. A Twitch filter (58.x) joins here later; the window shows only the ones in this list. */
export type FeedFilter = 'all' | 'pulls' | 'events' | 'jobs';
export const FEED_FILTERS: { id: FeedFilter; label: string; kind: FeedKind | null }[] = [
  { id: 'all', label: 'All', kind: null },
  { id: 'pulls', label: 'Pulls', kind: 'pull' },
  { id: 'events', label: 'Events', kind: 'event' },
  { id: 'jobs', label: 'Jobs', kind: 'job' },
];

/** What the pull feed window shows of a pull beyond the line (59.8): the card's own parts, its edition and its image (already a trusted address or empty). */
export interface PullFacts { card: string; rarity: string; variant: string; serial: number; image: string }

/** One row of the feed. `badge` is P pull, E event, J job, or ! when it was refused or failed; `tone` colours the tag. `pull` is set on a pull row only. */
export interface FeedRow { at: number; time: string; kind: FeedKind; badge: 'P' | 'E' | 'J' | '!'; viewer: string; text: string; tag: string; tone: 'ok' | 'rare' | 'bad'; pull?: PullFacts }

/** A pull from the live feed, kept for the dashboard. */
export const pullEntry = (item: FeedItem, at: number): PullEntry => ({ at, viewer: item.viewer, card: item.card, rarity: item.rarity, stars: item.stars, variant: item.variant, serial: item.serial, image: item.image });

/** The new pull in front of the ones held (newest first), kept to the newest 500. */
export const keepPull = (held: readonly PullEntry[], p: PullEntry): PullEntry[] => [p, ...held].slice(0, PULLS_KEEP);

/** A 4 star or better pull counts as big (the same line the live feed window uses for its sound). */
export const BIG_STARS = 4;

const pullRow = (p: PullEntry): FeedRow => ({
  at: p.at, time: clock(p.at), kind: 'pull', badge: 'P', viewer: p.viewer || '-',
  text: p.variant && p.variant !== 'Regular' ? `${p.card} (${p.variant})` : p.card,
  tag: p.rarity || `${p.stars} star${p.stars === 1 ? '' : 's'}`, tone: p.stars >= BIG_STARS ? 'rare' : 'ok',
  pull: { card: p.card, rarity: p.rarity, variant: p.variant, serial: p.serial ?? 0, image: p.image ?? '' },
});

const eventRow = (e: EventLine): FeedRow => ({
  at: e.at, time: e.time, kind: 'event', badge: e.ok ? 'E' : '!', viewer: e.viewer,
  text: `${e.event}${e.amount !== '-' ? ` ${e.amount}` : ''}: ${e.result}`, tag: e.ok ? 'rewarded' : 'refused', tone: e.ok ? 'ok' : 'bad',
});

const jobRow = (j: JobEntry): FeedRow => ({
  at: j.at, time: clock(j.at), kind: 'job', badge: j.ok ? 'J' : '!', viewer: j.username || '-', text: j.detail, tag: j.ok ? 'ok' : 'failed', tone: j.ok ? 'ok' : 'bad',
});

/** Pulls, event rewards and jobs in one list, newest first (a tie keeps pulls, then events, then jobs), at most `limit`. */
export function mergeFeed(pulls: readonly PullEntry[], events: readonly EventLine[], jobs: readonly JobEntry[], limit = FEED_KEEP): FeedRow[] {
  return [...pulls.map(pullRow), ...events.map(eventRow), ...jobs.map(jobRow)].sort((a, b) => b.at - a.at).slice(0, limit); // sort is stable
}

/** The rows a filter shows. */
export function filterFeed(rows: readonly FeedRow[], filter: FeedFilter): FeedRow[] {
  const kind = FEED_FILTERS.find(f => f.id === filter)?.kind ?? null;
  return kind ? rows.filter(r => r.kind === kind) : [...rows];
}

/** The "This stream" strip. A number is null when the app cannot know it. */
export interface StreamNumbers { pulls: number; big: number; spent: number; top: { viewer: string; pulls: number } | null }

/**
 * Pulls, big pulls and the top puller from the pulls the app was told about since `since`; Brie Bucks spent from the ledger's accepted deducts since then.
 * shortcut: the pulls count only what reached this app while it ran and the site was told its window was open, so a restart mid-stream starts the count again; upgrade when the site sends a stream total.
 */
export function streamNumbers(pulls: readonly PullEntry[], ledger: readonly LedgerRow[], since: number): StreamNumbers {
  const mine = pulls.filter(p => p.at >= since);
  const counts = new Map<string, number>();
  for (const p of mine) counts.set(p.viewer, (counts.get(p.viewer) ?? 0) + 1);
  let top: StreamNumbers['top'] = null;
  for (const [viewer, n] of counts) if (!top || n > top.pulls) top = { viewer, pulls: n };
  const spent = ledger.filter(r => r.at >= since && r.amount < 0 && r.answer === 'ok').reduce((s, r) => s - r.amount, 0);
  return { pulls: mine.length, big: mine.filter(p => p.stars >= BIG_STARS).length, spent, top };
}

/** What the Ready to go live card shows: `done` is the one-line state, else `lines` are the red ones (none and `text` when it has not run). */
export interface ReadySummary { done: boolean; text: string; lines: ChecklistLine[] }

const hhmm = (at: number): string => clock(at).slice(0, 5);

export function readySummary(c: { lines: ChecklistLine[]; ready: boolean; at: number } | null): ReadySummary {
  if (!c) return { done: false, text: 'Not run yet', lines: [] };
  if (c.ready) return { done: true, text: `All ${c.lines.length} checks passed at ${hhmm(c.at)}`, lines: [] };
  const lines = c.lines.filter(l => l.tone === 'bad');
  return { done: false, text: `${lines.length} ${lines.length === 1 ? 'thing needs' : 'things need'} fixing (checked at ${hhmm(c.at)})`, lines };
}
