// The messages between TCG Bridge (the server, bridge/src/deck.ts) and the Stream Deck plugin (the client, streamdeck/src/link.ts), ROADMAP 57.13.
// This file exists twice, byte for byte: streamdeck/src/protocol.ts and bridge/src/deckprotocol.ts (the two build separately). bridge/scripts/check-deck.ts fails
// when they differ, so change both. No imports.

/** Raised when the messages change in a way an old plugin or app cannot read. */
export const PROTOCOL = 1;
/** The server listens on this PC only. */
export const DECK_HOST = '127.0.0.1';
/** The first free port in this list is used; the port in use is in streamdeck.json. */
export const DECK_PORTS: readonly number[] = [47654, 47655, 47656, 47657, 47658];
/** A client that has not sent a valid hello by then is closed. */
export const HELLO_MS = 5000;
/** The largest message either side accepts. */
export const MAX_MESSAGE = 4096;
/** The WebSocket close code for a refused client (a wrong token, a wrong first message, a protocol it cannot speak). */
export const CLOSE_REFUSED = 4401;

/** What the bridge writes to streamdeck.json for the plugin to read. */
export interface DeckLinkFile { port: number; token: string }

/** The stats a Stat key can show (57.4 / 57.5 data). The app asks the site for them only while a key shows one. */
export const DECK_STATS = ['queue', 'packs', 'goal', 'lastBig', 'topPuller'] as const;
export type DeckStatKind = (typeof DECK_STATS)[number];
/** What the site last said for those; a missing one = not said yet, `goal` null = no pack goal for this stream, `lastBig` / `topPuller` null = nobody yet. */
export interface DeckStats { queue?: number; packs?: number; goal?: string | null; lastBig?: { username: string; cardName: string } | null; topPuller?: { username: string; packs: number } | null }

/**
 * What the staff keys show (ROADMAP 61.3); `staff` in the state is null on a PC that is not a staff PC. `can` lists the staff actions this PC's account may use
 * ('trading', 'scene' and 'preview-url', the names of bridge/src/staffpages.ts): a mod-linked PC has no 'preview-url'. `scenes` are OBS's scene names.
 */
export interface DeckStaff { can: string[]; tradingPaused: boolean; scene: string; scenes: string[] }

/** What a key may show, pushed by the app. `ready` = paired with the site; `paused` null = the site has not said yet; `reason` is "scene <name>" for a scene pause. */
export interface DeckState {
  ready: boolean;
  paused: boolean | null;
  reason: string;
  /** The running happy hour: `endsAt` is epoch milliseconds; null = none. */
  happy: { what: string; endsAt: number } | null;
  /** The buffs and quick actions switched on for the Stream Deck (ROADMAP 55.2). */
  buffs: { id: string; name: string }[];
  /** For the Stat keys; an app older than the plugin sends none. */
  stats: DeckStats;
  /** For the staff keys; null = not a staff PC (an app older than the plugin sends none). */
  staff: DeckStaff | null;
  /** OBS says the stream is live (61.5): Test pull and Show a card then play on the live overlay, so those keys need a 1 second hold. An older app sends none (= false). */
  live: boolean;
  /** The last pre-stream checklist run (61.5): how many lines it had and how many were red; null = none run yet. An older app sends none. */
  checklist: DeckChecklist | null;
  /** Channel point awards paused on the site (62.2); null = the site has not said yet. An older app sends none (= null). */
  awardsPaused: boolean | null;
  /** The overlay queue, the next pull first (62.2), at most DECK_QUEUE_MAX. An older app sends none (= []). */
  queue: DeckQueueRow[];
  /** The live feed, newest first (62.2), at most DECK_FEED_MAX. An older app sends none (= []). */
  feed: DeckFeedLine[];
}
export interface DeckChecklist { total: number; failing: number }
export const DECK_QUEUE_MAX = 10;
export const DECK_FEED_MAX = 30;
/** One waiting overlay event: who, what (the pack, or "Show-off"), seconds waited when the app last asked the site, and `showing` for the one on screen now (the first). */
export interface DeckQueueRow { viewer: string; what: string; waitingSec: number; showing: boolean }
export const DECK_FEED_KINDS = ['pulls', 'requests', 'events', 'problems'] as const;
export type DeckFeedKind = (typeof DECK_FEED_KINDS)[number];
/** One line of the live feed: `at` is epoch milliseconds. */
export interface DeckFeedLine { at: number; kind: DeckFeedKind; text: string }

/** What a key asks the app to do. Each one is run by the same code as the Control tab and the tray. */
export type DeckRequest =
  | { what: 'buff'; id: string }
  | { what: 'last-buff' }
  | { what: 'pause' }
  | { what: 'pause-awards'; on?: boolean }
  | { what: 'happy-start'; minutes: number; kind: 'free' | 'discount'; percent: number }
  | { what: 'happy-end' }
  | { what: 'test-pull' }
  | { what: 'show-card'; username: string; card?: string }
  | { what: 'refresh' }
  | { what: 'checklist' }
  | { what: 'skip' }
  | { what: 'clear-queue' }
  | { what: 'trading'; pause: boolean }
  | { what: 'scene'; name: string }
  | { what: 'preview' };

/** `stats` says which stats the keys on the decks show right now (a full list each time, [] = none); the app asks the site for them only then. */
export type ClientMessage = { t: 'hello'; token: string; protocol: number; version: string } | { t: 'do'; n: number; req: DeckRequest } | { t: 'stats'; want: DeckStatKind[] };
export type ServerMessage = { t: 'welcome'; version: string; state: DeckState } | { t: 'state'; state: DeckState } | { t: 'done'; n: number; ok: boolean; text: string };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** One request, or null when it is not a request this protocol knows. */
export function parseRequest(v: unknown): DeckRequest | null {
  if (!isObject(v)) return null;
  switch (v.what) {
    case 'buff': return text(v.id, 100) && v.id ? { what: 'buff', id: v.id } : null;
    case 'last-buff': return { what: 'last-buff' };
    case 'pause': return { what: 'pause' };
    case 'pause-awards': return typeof v.on === 'boolean' ? { what: 'pause-awards', on: v.on } : { what: 'pause-awards' };
    case 'happy-end': return { what: 'happy-end' };
    case 'test-pull': return { what: 'test-pull' };
    case 'skip': return { what: 'skip' };
    case 'clear-queue': return { what: 'clear-queue' };
    case 'preview': return { what: 'preview' };
    case 'trading': return typeof v.pause === 'boolean' ? { what: 'trading', pause: v.pause } : null;
    case 'scene': return text(v.name, 80) && v.name ? { what: 'scene', name: v.name } : null;
    case 'refresh': return { what: 'refresh' };
    case 'checklist': return { what: 'checklist' };
    case 'show-card': return text(v.username, 40) && v.username ? { what: 'show-card', username: v.username, ...(text(v.card, 80) && v.card ? { card: v.card } : {}) } : null;
    case 'happy-start': return num(v.minutes) && num(v.percent) && (v.kind === 'free' || v.kind === 'discount') ? { what: 'happy-start', minutes: v.minutes, kind: v.kind, percent: v.percent } : null;
    default: return null;
  }
}

function parseState(v: unknown): DeckState | null {
  if (!isObject(v) || typeof v.ready !== 'boolean' || !(v.paused === null || typeof v.paused === 'boolean') || !text(v.reason, 200) || !Array.isArray(v.buffs)) return null;
  const h = v.happy;
  if (h !== null && !(isObject(h) && text(h.what, 80) && num(h.endsAt))) return null;
  const buffs: DeckState['buffs'] = [];
  for (const b of v.buffs.slice(0, 200)) if (isObject(b) && text(b.id, 100) && text(b.name, 100)) buffs.push({ id: b.id, name: b.name });
  const stats: DeckStats = {};
  if (isObject(v.stats)) {
    if (num(v.stats.queue)) stats.queue = v.stats.queue;
    if (num(v.stats.packs)) stats.packs = v.stats.packs;
    if (v.stats.goal === null || text(v.stats.goal, 200)) stats.goal = v.stats.goal;
    const big = v.stats.lastBig;
    if (big === null) stats.lastBig = null;
    else if (isObject(big) && text(big.username, 80) && text(big.cardName, 80)) stats.lastBig = { username: big.username, cardName: big.cardName };
    const top = v.stats.topPuller;
    if (top === null) stats.topPuller = null;
    else if (isObject(top) && text(top.username, 80) && num(top.packs)) stats.topPuller = { username: top.username, packs: top.packs };
  }
  let staff: DeckStaff | null = null;
  const s = v.staff;
  if (isObject(s) && Array.isArray(s.can) && typeof s.tradingPaused === 'boolean' && text(s.scene, 80) && Array.isArray(s.scenes)) {
    staff = { can: s.can.filter((x): x is string => text(x, 30)).slice(0, 20), tradingPaused: s.tradingPaused, scene: s.scene, scenes: s.scenes.filter((x): x is string => text(x, 80)).slice(0, 200) };
  }
  const queue: DeckQueueRow[] = [];
  if (Array.isArray(v.queue)) for (const q of v.queue.slice(0, DECK_QUEUE_MAX)) if (isObject(q) && text(q.viewer, 80) && text(q.what, 120) && num(q.waitingSec)) queue.push({ viewer: q.viewer, what: q.what, waitingSec: q.waitingSec, showing: q.showing === true });
  const feed: DeckFeedLine[] = [];
  if (Array.isArray(v.feed)) for (const f of v.feed.slice(0, DECK_FEED_MAX)) if (isObject(f) && num(f.at) && DECK_FEED_KINDS.includes(f.kind as DeckFeedKind) && text(f.text, 300)) feed.push({ at: f.at, kind: f.kind as DeckFeedKind, text: f.text });
  const c = v.checklist;
  const checklist = isObject(c) && num(c.total) && num(c.failing) ? { total: c.total, failing: c.failing } : null;
  return { ready: v.ready, paused: v.paused, reason: v.reason, happy: h === null ? null : { what: (h as { what: string }).what, endsAt: (h as { endsAt: number }).endsAt }, buffs, stats, staff, live: v.live === true, checklist, awardsPaused: typeof v.awardsPaused === 'boolean' ? v.awardsPaused : null, queue, feed };
}

const json = (raw: string): unknown => { try { return JSON.parse(raw); } catch { return null; } };

/** What the app receives from a client, or null for anything else (too long, not JSON, an unknown shape). */
export function parseClient(raw: string): ClientMessage | null {
  if (raw.length > MAX_MESSAGE) return null;
  const v = json(raw);
  if (!isObject(v)) return null;
  if (v.t === 'hello') return text(v.token, 200) && num(v.protocol) && text(v.version, 40) ? { t: 'hello', token: v.token, protocol: v.protocol, version: v.version } : null;
  if (v.t === 'stats') return Array.isArray(v.want) ? { t: 'stats', want: DECK_STATS.filter(k => (v.want as unknown[]).includes(k)) } : null;
  if (v.t === 'do') {
    const req = parseRequest(v.req);
    return num(v.n) && req ? { t: 'do', n: v.n, req } : null;
  }
  return null;
}

/** What the plugin receives from the app, or null for anything else. The state is rebuilt field by field. */
export function parseServer(raw: string): ServerMessage | null {
  if (raw.length > 65_536) return null;
  const v = json(raw);
  if (!isObject(v)) return null;
  if (v.t === 'welcome') {
    const state = parseState(v.state);
    return text(v.version, 40) && state ? { t: 'welcome', version: v.version, state } : null;
  }
  if (v.t === 'state') {
    const state = parseState(v.state);
    return state ? { t: 'state', state } : null;
  }
  if (v.t === 'done') return num(v.n) && typeof v.ok === 'boolean' && text(v.text, 500) ? { t: 'done', n: v.n, ok: v.ok, text: v.text } : null;
  return null;
}

/** The streamdeck.json the plugin reads: a port and a token, or null for anything else. */
export function parseLinkFile(raw: string): DeckLinkFile | null {
  const v = json(raw);
  return isObject(v) && num(v.port) && Number.isInteger(v.port) && v.port >= 1024 && v.port <= 65_535 && text(v.token, 200) && v.token ? { port: v.port, token: v.token } : null;
}
