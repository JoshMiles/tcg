import type { ActivityEvent } from './activity';
import { VARIANT_LABELS } from './variants';

// Client-safe helpers for the Live Activity page: categories, search text, "notable" moments, burst grouping, rates and export.

export type Category = 'pulls' | 'upgrades' | 'grants' | 'trades' | 'stream' | 'resets';
export const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'pulls', label: 'Pulls' },
  { id: 'upgrades', label: 'Upgrades' },
  { id: 'grants', label: 'Grants & removals' },
  { id: 'trades', label: 'Trades' },
  { id: 'stream', label: 'Stream' },
  { id: 'resets', label: 'Resets' },
];

export function categoryOf(e: ActivityEvent): Category {
  switch (e.type) {
    case 'pull': return 'pulls';
    case 'upgrade': return 'upgrades';
    case 'grant': return e.source === 'webhook' ? 'pulls' : 'grants'; // a webhook reward reads as a pull
    case 'remove': return 'grants';
    case 'trade': return 'trades';
    case 'trigger':
    case 'collection_shown': return 'stream';
    default: return 'resets';
  }
}

/** Looks a card name up by number (and pack, where known); supplied by the page. */
export type CardNamer = (number: number, packName?: string) => string | undefined;

/** One event as a plain sentence (used for search, the detail panel title and CSV export). */
export function plainText(e: ActivityEvent, cardName: CardNamer): string {
  const text = plainBase(e, cardName);
  return e.staff ? `${text} (by ${e.staff})` : text;
}

function plainBase(e: ActivityEvent, cardName: CardNamer): string {
  const name = (n: number, pack?: string) => cardName(n, pack) ?? `Card #${n}`;
  const v = (x?: string) => (x && x !== 'regular' ? ` (${VARIANT_LABELS[x as keyof typeof VARIANT_LABELS] ?? x})` : '');
  switch (e.type) {
    case 'pull': return `${e.username} pulled ${e.cardName || name(e.cardNumber, e.packName)}${v(e.variant)}${e.serial ? ` #${e.serial}` : ''}${e.isNew ? ' (new)' : ` (x${e.copies})`}`;
    case 'grant': return e.source === 'webhook'
      ? `${e.username} pulled ${e.cardName || name(e.cardNumber)}${v(e.variant)}${e.serial ? ` #${e.serial}` : ''} (granted by webhook)`
      : `${name(e.cardNumber)}${v(e.variant)} granted to ${e.username} (${e.source})`;
    case 'remove': return `${name(e.cardNumber)}${v(e.variant)} removed from ${e.username}`;
    case 'upgrade': return `${e.username} upgraded ${e.cardName || name(e.cardNumber)} to ${VARIANT_LABELS[e.to]} (${e.cost}x ${VARIANT_LABELS[e.from]})`;
    case 'trade': {
      const what = { offered: e.kind === 'listing' ? 'posted a listing' : `offered ${e.partner ?? '?'} a trade`, countered: `countered ${e.partner ?? '?'}'s offer`, accepted: `traded with ${e.partner ?? '?'}`, declined: 'had an offer declined', cancelled: e.by === 'admin' ? 'had an offer cancelled by an admin' : 'cancelled an offer', expired: 'had an offer expire', reversed: `had a trade with ${e.partner ?? '?'} reversed by staff` }[e.action];
      return `${e.username} ${what}: ${e.give.join(', ')} for ${e.get.join(', ')}`;
    }
    case 'reset': return e.scope === 'everyone' ? 'All collections reset' : `${e.username}'s collection reset${e.scope === 'all' ? ' (all seasons)' : ''}`;
    case 'delete': return `${e.username} deleted`;
    case 'trigger': return e.source === 'admin' && e.kind === 'pull' ? `${(e.count ?? 1) > 1 ? `${e.count} packs` : 'A pack'} gifted to ${e.username}` : e.kind === 'card' ? `${e.username} showed off ${e.cardName ?? 'a card'}` : `${e.username} triggered a ${e.kind === 'pull' ? 'pack draw' : 'collection view'} (${e.source ?? 'webhook'})`;
    default: return `${e.username}'s collection shown on stream`;
  }
}

export type PullEvent = Extract<ActivityEvent, { type: 'pull' }>;

/** A pull as a pull event: a pull itself, or a webhook grant (a reward) dressed as one with defaults for facts older events lack. Null for anything else. */
export function asPullEvent(e: ActivityEvent): PullEvent | null {
  if (e.type === 'pull') return e;
  if (e.type !== 'grant' || e.source !== 'webhook') return null;
  const { source: _source, ...rest } = e;
  return { ...rest, type: 'pull', cardName: e.cardName ?? `Card #${e.cardNumber}`, stars: e.stars ?? 1, packName: e.packName ?? '', isNew: e.isNew === true, copies: e.copies ?? 1, uniqueOwned: e.uniqueOwned ?? 0 };
}

/** The facts of a pull, from a pull or from a webhook grant (a reward reads as a pull everywhere in the feed). Null for anything else. */
export interface PullFacts { username: string; at: number; variant: string; stars: number; isNew: boolean; serial?: number; uniqueOwned?: number; packName?: string }
export function pullFacts(e: ActivityEvent): PullFacts | null {
  if (e.type === 'pull') return { username: e.username, at: e.at, variant: e.variant ?? 'regular', stars: e.stars, isNew: e.isNew, serial: e.serial, uniqueOwned: e.uniqueOwned, packName: e.packName };
  if (e.type === 'grant' && e.source === 'webhook') return { username: e.username, at: e.at, variant: e.variant ?? 'regular', stars: e.stars ?? 1, isNew: e.isNew === true, serial: e.serial, uniqueOwned: e.uniqueOwned, packName: e.packName };
  return null;
}

/** Why an event is worth a second look, or null. Used for highlighting, pinning and alerts. */
export function notableReason(e: ActivityEvent, totalCards: number): string | null {
  const p = pullFacts(e);
  if (p) {
    if (p.serial === 1) return 'First ever pull';
    if (p.variant === 'shiny') return 'Shiny pull';
    if (p.variant === 'full') return 'Full Art pull';
    if (p.stars >= 5) return '5-star pull';
    if (totalCards > 0 && p.isNew && (p.uniqueOwned ?? 0) >= totalCards) return 'Collection completed';
  }
  if (e.type === 'upgrade' && (e.to === 'shiny' || e.to === 'full')) return `Upgraded to ${VARIANT_LABELS[e.to]}`;
  if (e.type === 'trade' && e.action === 'cancelled' && e.by === 'admin') return 'Trade cancelled by an admin';
  if (e.type === 'reset' && e.scope === 'everyone') return 'Everyone reset';
  return null;
}

export interface Group { key: string; events: ActivityEvent[] }

/**
 * Collapses quick bursts: pulls by the same viewer within 8 seconds of each other (a multi-pack opening), and admin gift triggers
 * for the same viewer. Events are newest first, so a group's first event is its latest. Singletons stay as one-event groups.
 */
export function groupEvents(events: ActivityEvent[]): Group[] {
  const groups: Group[] = [];
  for (const e of events) {
    const last = groups[groups.length - 1];
    const prev = last?.events[last.events.length - 1];
    const burst = (e.type === 'pull' || (e.type === 'trigger' && e.source === 'admin')) && prev && prev.type === e.type && prev.username === e.username && prev.at - e.at <= 8000;
    if (burst && last) last.events.push(e); else groups.push({ key: String(e.seq), events: [e] });
  }
  return groups;
}

export interface Rates {
  perMinute: number;
  lastHour: number;
  viewersLastHour: number;
  rareLastHour: number;
  newCardsLastHour: number;
  /** Pulls per minute for the last 30 minutes, oldest first. */
  spark: number[];
  /** Set when the last 2 minutes are far busier than the 30 minutes before them. */
  spike: { recent: number; usual: number } | null;
}

export function rateStats(events: ActivityEvent[], now: number): Rates {
  const pulls = events.map(pullFacts).filter((p): p is PullFacts => p !== null); // pulls and webhook grants
  const hour = pulls.filter(p => now - p.at <= 3_600_000);
  const spark = Array.from({ length: 30 }, (_, i) => {
    const from = now - (30 - i) * 60_000;
    return pulls.filter(p => p.at > from && p.at <= from + 60_000).length;
  });
  const recent = pulls.filter(p => now - p.at <= 120_000).length;
  const before = pulls.filter(p => now - p.at > 120_000 && now - p.at <= 30 * 60_000 + 120_000).length;
  const usual = (before / 30) * 2; // expected pulls in a 2 minute window
  return {
    perMinute: pulls.filter(p => now - p.at <= 300_000).length / 5,
    lastHour: hour.length,
    viewersLastHour: new Set(hour.map(p => p.username)).size,
    rareLastHour: hour.filter(p => p.variant === 'shiny' || p.variant === 'full' || p.stars >= 5).length,
    newCardsLastHour: hour.filter(p => p.isNew).length,
    spark,
    spike: recent >= 8 && recent >= usual * 3 ? { recent, usual: Math.round(usual) } : null,
  };
}

const csvCell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

/** CSV of events (newest first as given): time, type, viewer, description, collection. */
export function toCsv(events: ActivityEvent[], cardName: CardNamer): string {
  const rows = [['time', 'type', 'viewer', 'description', 'collection'].join(',')];
  for (const e of events) rows.push([new Date(e.at).toISOString(), e.type, e.username, plainText(e, cardName), e.collectionName ?? ''].map(csvCell).join(','));
  return rows.join('\n');
}

/** The card an event is about, if any. */
export function cardNumberOf(e: ActivityEvent): number | undefined {
  return 'cardNumber' in e && typeof e.cardNumber === 'number' ? e.cardNumber : undefined;
}
