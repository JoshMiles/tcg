// The Stream page's pure parts (ROADMAP 63.2): its five sections and where every old Mix It Up tab id lands, the status strip ("All good" or "N things
// need you"), and the Live section's one feed, merged from the Mix It Up log, the command log and the app event feed. No database, no network:
// scripts/check-stream-page.mts covers it.
import type { IconName } from '@/app/components/Icon';
import type { StatusCard } from './mixitup-page';
import type { ChecklistResult } from './bridge-checklist-core';
import type { MixItUpEvent, MixItUpLogEntry } from './mixitup';
import { cardFor, pickCard, type CardId } from './viewers-cards';
import { connHref, pickConn, type ConnId } from './stream-connections';

// ── Sections ──

export const SECTIONS = [
  { id: 'live', label: 'Live', icon: 'activity' as IconName },
  { id: 'viewers', label: 'What viewers get', icon: 'gift' as IconName },
  { id: 'connections', label: 'Connections', icon: 'link' as IconName },
  { id: 'test', label: 'Test', icon: 'flask' as IconName },
  { id: 'history', label: 'History', icon: 'list' as IconName },
] as const;
export type Section = (typeof SECTIONS)[number]['id'];

/** The old tabs that still hold the panels of the sections not built yet (63.5 replaces them). Sections with no entry have no sub-tabs; What viewers get uses cards (lib/viewers-cards.ts). */
export const SUB_TABS: Partial<Record<Section, { id: string; label: string; icon: IconName }[]>> = {
  history: [{ id: 'log', label: 'Log', icon: 'list' }],
};

/** Every id the old Mix It Up page took in `?tab=`, and the section it lives in now. Overview was split: its parts are in Live, Test and History. */
export const OLD_TAB_SECTION: Record<string, Section> = {
  overview: 'live', connection: 'connections', paid: 'viewers', bigpulls: 'viewers', chat: 'viewers', commands: 'viewers', streamdeck: 'viewers', events: 'viewers', log: 'history',
};

const sectionOf = (raw: string | undefined): Section | undefined => SECTIONS.find(s => s.id === raw)?.id;

/**
 * `?section=`, `?tab=` and `?card=` to the section, sub-tab and card to show. A bare old `?tab=` id (the old links, the save redirects) picks its section, and for
 * What viewers get its card (`chat` is Stream start and end); an unknown value is Live. `card` is null for the card grid.
 */
export function resolveStream(sectionRaw: string | undefined, tabRaw: string | undefined, cardRaw?: string, connRaw?: string): { section: Section; tab: string | null; card: CardId | null; conn: ConnId | null } {
  const section = sectionOf(sectionRaw) ?? (pickCard(cardRaw) ? 'viewers' : tabRaw && Object.hasOwn(OLD_TAB_SECTION, tabRaw) ? OLD_TAB_SECTION[tabRaw] : 'live');
  const subs = SUB_TABS[section];
  return { section, tab: subs ? (subs.find(t => t.id === tabRaw)?.id ?? subs[0].id) : null, card: section === 'viewers' ? cardFor(cardRaw, tabRaw) : null, conn: section === 'connections' ? pickConn(connRaw) : null };
}

/** Where the redirect from the old `/admin/mixitup` page sends a request: the new address with `section`, the card or old tab where the section uses one, and `note`/`error`/`saved`/`filter` kept. */
export function legacyStreamHref(q: Record<string, string | undefined>): string {
  const { section, tab, card, conn } = resolveStream(undefined, q.tab, q.card, q.conn);
  const out = new URLSearchParams({ section });
  if (card) out.set('card', card);
  if (conn) out.set('conn', conn);
  if (tab) out.set('tab', tab);
  for (const k of ['note', 'error', 'saved', 'filter'] as const) if (q[k]) out.set(k, q[k]!);
  return `/admin/stream?${out}`;
}

// ── Status strip ──

export interface StripItem { id: string; line: string; fix: { href: string; label: string } }
export interface StatusStrip { ok: boolean; title: string; items: StripItem[] }

const CONNECTIONS = { href: connHref('bridge'), label: 'Open Connections' };
/** A checklist older than this says nothing about now. */
export const CHECKLIST_FRESH_MS = 12 * 3600_000;

/**
 * "All good", or "N things need you" with one line and a fix link each. The items come from the three status cards (anything not green that says
 * what to do; the cards are built from the same data as the old health chips) and from the red lines of the last pre-stream checklist, when it is recent.
 */
export function statusStrip(cards: StatusCard[], checklist: ChecklistResult | null, now: number): StatusStrip {
  const items: StripItem[] = [];
  for (const c of cards) if (c.tone !== 'ok' && (c.tone !== 'muted' || c.todo)) items.push({ id: c.id, line: `${c.title}: ${c.state}`, fix: c.fix ?? (c.id === 'obs' ? { href: connHref('obs'), label: 'Open OBS' } : CONNECTIONS) });
  if (checklist && now - checklist.at <= CHECKLIST_FRESH_MS) for (const l of checklist.lines) if (l.tone === 'bad') items.push({ id: `check:${l.label}`, line: `Checklist, ${l.label}: ${l.text}`, fix: CONNECTIONS });
  return { ok: items.length === 0, title: items.length === 0 ? 'All good' : `${items.length} thing${items.length === 1 ? '' : 's'} need${items.length === 1 ? 's' : ''} you`, items };
}

// ── The live feed ──

export const FEED_FILTERS = [
  { id: 'all', label: 'All' }, { id: 'pulls', label: 'Pulls' }, { id: 'requests', label: 'Requests' }, { id: 'events', label: 'Events' }, { id: 'problems', label: 'Problems' },
] as const;
export type FeedFilter = (typeof FEED_FILTERS)[number]['id'];
export type FeedKind = Exclude<FeedFilter, 'all'>;
export const pickFeedFilter = (raw: string | undefined): FeedFilter => FEED_FILTERS.find(f => f.id === raw)?.id ?? 'all';

export interface FeedItem { at: number; kind: FeedKind; who: string; /** The log word (pull, deduct, command...) or the event's name. */ tag: string; text: string }
export const FEED_LIMIT = 40;

/** Problems: a refused or revoked line, or anything that failed. Pulls: a pull or free pack that went through. Events: a Stream Deck buff or an event reward. Requests: the rest (balance, charge, refund, commands). */
function logKind(e: MixItUpLogEntry): FeedKind {
  if (e.what === 'refused' || e.what === 'revoked' || !e.ok) return 'problems';
  if (e.what === 'pull' || e.what === 'grant') return 'pulls';
  return e.what === 'buff' ? 'events' : 'requests';
}

/**
 * The Mix It Up log, the command log and the event feed as one list, newest first. An event reward is written to both the log and the event feed with the
 * same time and viewer (`logMixItUp`), so the log line is dropped when the feed has it; feed-only events (Twitch stream online) stay.
 */
export function mergeFeed(log: MixItUpLogEntry[], cmdLog: MixItUpLogEntry[], events: MixItUpEvent[], limit = FEED_LIMIT): FeedItem[] {
  const inFeed = new Set(events.map(e => `${e.at}|${e.username}`));
  const fromLog = [...log, ...cmdLog].filter(e => !inFeed.has(`${e.at}|${e.username}`)).map((e): FeedItem => ({ at: e.at, kind: logKind(e), who: e.username, tag: e.what, text: e.detail }));
  const fromEvents = events.map((e): FeedItem => ({ at: e.at, kind: e.ok ? 'events' : 'problems', who: e.username, tag: e.event, text: e.detail }));
  return [...fromLog, ...fromEvents].sort((a, b) => b.at - a.at).slice(0, limit);
}

export const filterFeed = (items: FeedItem[], f: FeedFilter): FeedItem[] => (f === 'all' ? items : items.filter(i => i.kind === f));
