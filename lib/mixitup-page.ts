// The Mix It Up page's pure parts (ROADMAP 55.7): the three status cards of the Overview tab, the "this stream" numbers counted from the
// two request logs, the Log tab's filters and the refusal previews. No database and no network, so scripts/check-mixitup-page.mts covers it.
import { CONNECTED_MS, type ObsSnapshot } from './bridge-core';
import { ROUTE_NAMES, routeName, OUT_KINDS, outLine, type HealthChip, type MixItUpHealth, type OutKind } from './mixitup-health';
import { REFUSAL_LABELS, type MixItUpSettings } from './mixitup-core';
import type { MixItUpLogEntry } from './mixitup';

type Tone = HealthChip['tone'];
type Ago = (at: number, now: number) => string;

export interface StatusCard {
  id: 'incoming' | 'outgoing' | 'obs';
  title: string;
  tone: Tone;
  /** The state in words. */
  state: string;
  rows: { label: string; text: string; tone: Tone }[];
  /** What to do, when the card is not green. */
  todo?: string;
  fix?: { href: string; label: string };
}

export interface StatusInput {
  health: MixItUpHealth;
  settings: Pick<MixItUpSettings, 'connection' | 'currencyId' | 'currency' | 'balanceUrl' | 'deductUrl' | 'addUrl' | 'viewersUrl'>;
  bridge: { at: number | null; appVersion: string; mixitupVersion: string; currencies: { id: string; name: string }[] };
  /** How many bridges are paired. */
  paired: number;
  obs: ObsSnapshot | null;
  now: number;
  ago: Ago;
  /** When the overlay watchdog last refreshed the overlay (ROADMAP 55.8), or null. */
  watchdogAt?: number | null;
}

const TAB = (id: string) => `/admin/stream?tab=${id}`; // an old tab id; app/admin/stream/page.tsx puts it in its section (lib/stream-page.ts)
const CONNECTION = { href: TAB('connection'), label: 'Open Connection' };

/** The three cards: Mix It Up to the site, the site to Mix It Up, OBS. */
export function statusCards(i: StatusInput): StatusCard[] {
  return [incomingCard(i), outgoingCard(i), obsCard(i)];
}

function incomingCard({ health, now, ago }: StatusInput): StatusCard {
  const rows = Object.keys(ROUTE_NAMES).map(route => {
    const s = health.seen[route];
    const bad = !!s?.badAt && s.badAt > (s.okAt ?? 0);
    return {
      route, bad, okAt: s?.okAt,
      row: { label: routeName(route), tone: (bad ? 'warn' : s?.okAt ? 'ok' : 'muted') as Tone, text: bad ? `wrong secret ${ago(s!.badAt!, now)}` : s?.okAt ? ago(s.okAt, now) : 'no request yet' },
    };
  });
  const base = { id: 'incoming' as const, title: 'Mix It Up to the site', rows: rows.map(r => r.row) };
  const wrong = rows.find(r => r.bad);
  if (wrong) return { ...base, tone: 'warn', state: `Reached ${routeName(wrong.route)} with the wrong secret`, todo: 'The secret in the Mix It Up command does not match the one the site expects. Copy it again from the Commands tab.', fix: { href: TAB('commands'), label: 'Open Commands' } };
  const last = rows.filter(r => r.okAt).sort((a, b) => b.okAt! - a.okAt!)[0];
  if (!last) return { ...base, tone: 'muted', state: 'Mix It Up has not reached the site yet', todo: 'Make the !pack command in Mix It Up (the Commands tab has the setup to copy), then type !pack in chat.', fix: { href: TAB('commands'), label: 'Open Commands' } };
  return { ...base, tone: 'ok', state: `Last request ${ago(last.okAt!, now)} (${routeName(last.route)})` };
}

function outgoingCard({ health, settings: s, bridge, paired, now, ago }: StatusInput): StatusCard {
  const base = { id: 'outgoing' as const, title: 'The site to Mix It Up' };
  if (s.connection === 'addresses') {
    const urls = { balance: s.balanceUrl, deduct: s.deductUrl, add: s.addUrl, viewers: s.viewersUrl };
    const chips = OUT_KINDS.map(k => outLine(k, urls, health, now, ago));
    const rows = chips.map(c => ({ label: c.text.split(':')[0], text: c.text.slice(c.text.indexOf(':') + 2), tone: c.tone }));
    if (!s.balanceUrl) return { ...base, rows, tone: 'bad', state: 'No balance address saved', todo: 'Paid pulls need the balance address. Save it, or switch to TCG Bridge.', fix: CONNECTION };
    if (chips.some(c => c.tone === 'bad')) return { ...base, rows, tone: 'bad', state: 'An address is failing', todo: 'Check the failing address in Mix It Up, then try again with the buttons below.', fix: CONNECTION };
    if (!health.out.balance) return { ...base, rows, tone: 'muted', state: 'Addresses saved, not used yet', todo: 'Run a balance check below to see that Mix It Up answers.' };
    return { ...base, rows, tone: 'ok', state: 'Working' };
  }
  const connected = !!bridge.at && now - bridge.at <= CONNECTED_MS;
  const currency = bridge.currencies.find(c => c.id === s.currencyId);
  const calls = OUT_KINDS.filter(k => health.out[k]).map(k => ({ label: `Last ${k}`, ...callRow(k, health, now, ago) }));
  const rows: StatusCard['rows'] = [
    { label: 'TCG Bridge', text: paired === 0 ? 'not paired' : connected ? `connected${bridge.appVersion ? `, version ${bridge.appVersion}` : ''}` : `not connected${bridge.at ? `, last seen ${ago(bridge.at, now)}` : ''}`, tone: paired && connected ? 'ok' : 'bad' },
    { label: 'Mix It Up', text: bridge.currencies.length ? `found${bridge.mixitupVersion ? `, version ${bridge.mixitupVersion}` : ''}, ${bridge.currencies.length} currenc${bridge.currencies.length === 1 ? 'y' : 'ies'}` : 'not found yet', tone: bridge.currencies.length ? 'ok' : 'muted' },
    { label: 'Currency', text: currency ? currency.name : s.currencyId ? `${s.currency} (saved, not in the last list)` : 'not chosen', tone: currency ? 'ok' : 'muted' },
    ...calls,
  ];
  if (paired === 0) return { ...base, rows, tone: 'bad', state: 'TCG Bridge is not paired', todo: 'Download TCG Bridge on the stream PC and pair it with a code.', fix: CONNECTION };
  if (!connected) return { ...base, rows, tone: 'bad', state: 'TCG Bridge is not connected', todo: 'Open TCG Bridge on the stream PC. It stays paired between runs.', fix: CONNECTION };
  if (!bridge.currencies.length) return { ...base, rows, tone: 'warn', state: 'TCG Bridge is connected, Mix It Up was not found', todo: 'Start Mix It Up and switch on its Developer API (Services, Developer API, Connect).', fix: CONNECTION };
  if (!currency) return { ...base, rows, tone: 'warn', state: 'Choose the currency viewers pay with', todo: 'Pick the currency on the Connection tab and save.', fix: CONNECTION };
  const failing = OUT_KINDS.find(k => health.out[k] && !health.out[k]!.ok);
  if (failing) return { ...base, rows, tone: 'warn', state: `The last ${failing} call failed`, todo: `${health.out[failing]!.detail}. Try a balance check below; TCG Bridge's window lists each job.` };
  return { ...base, rows, tone: 'ok', state: 'Working' };
}

const callRow = (k: OutKind, health: MixItUpHealth, now: number, ago: Ago): { text: string; tone: Tone } => {
  const r = health.out[k]!;
  return r.ok ? { text: `worked ${ago(r.at, now)}`, tone: 'ok' } : { text: `failed ${ago(r.at, now)}: ${r.detail}`, tone: 'warn' };
};

function obsCard({ obs, paired, now, ago, watchdogAt }: StatusInput): StatusCard {
  const base = { id: 'obs' as const, title: 'OBS' };
  if (paired === 0) return { ...base, rows: [], tone: 'muted', state: 'Not checked', todo: 'TCG Bridge watches OBS and can refresh the overlay. Pair it first.', fix: CONNECTION };
  if (!obs) return { ...base, rows: [], tone: 'muted', state: 'TCG Bridge has not reported OBS', todo: 'In TCG Bridge, switch on "Talk to OBS" and type the OBS WebSocket password.' };
  const rows: StatusCard['rows'] = [{ label: 'Last report', text: ago(obs.at, now), tone: 'muted' }];
  if (watchdogAt) rows.push({ label: 'Overlay watchdog', text: `last refreshed the overlay ${ago(watchdogAt, now)}`, tone: 'muted' });
  if (!obs.connected || now - obs.at > CONNECTED_MS) return { ...base, rows, tone: 'bad', state: 'OBS is not connected', todo: 'Open OBS and switch its WebSocket server on (Tools, WebSocket Server Settings), then check the password in TCG Bridge.' };
  const { found, inProgram, visible } = obs.overlay;
  rows.unshift({ label: 'Scene', text: obs.scene, tone: 'muted' });
  if (!found) return { ...base, rows, tone: 'warn', state: 'The overlay source was not found in OBS', todo: 'Add the overlay address as a browser source in OBS.', fix: { href: '/admin/settings?tab=overlay', label: 'Open OBS Overlay settings' } };
  if (!inProgram) return { ...base, rows, tone: 'warn', state: `The overlay is not in the current scene (${obs.scene})`, todo: 'Switch to the scene that has the overlay, or add the overlay source to this scene.' };
  if (!visible) return { ...base, rows, tone: 'warn', state: `The overlay is hidden in ${obs.scene}`, todo: 'Make the overlay source visible in OBS.' };
  return { ...base, rows, tone: 'ok', state: `The overlay is visible in ${obs.scene}` };
}

/** Is anything not green? Then the page offers "Set up Mix It Up". */
export const needsSetup = (cards: StatusCard[]): boolean => cards.some(c => c.tone !== 'ok');

// ── This stream ──

export const LOG_CAP = 50; // the request log keeps its last 50 lines (lib/mixitup.ts); the command log keeps 20 (lib/commands.ts)
const CMD_LOG_CAP = 20;
const DAY_MS = 24 * 3600_000;

export interface StreamNumbers {
  label: 'This stream' | 'Last 24 hours';
  /** Paid pulls charged (a `deduct` that Mix It Up confirmed). */
  paid: number;
  /** Currency taken by those pulls. */
  taken: number;
  /** Currency added through the add route: refunds of pulls that were not saved, and Brie Bucks buff payouts (the log cannot tell them apart). */
  added: number;
  /** Chat commands that ran. */
  commands: number;
  refusals: number;
  topReason: { label: string; count: number } | null;
  /** A log was full and its oldest line is still inside the window, so the real number may be higher. */
  partial: boolean;
}

const amountOf = (detail: string): number => { const n = /^\+?(\d[\d,]*)/.exec(detail); return n ? Number(n[1].replace(/,/g, '')) : 0; };

/**
 * Counts the two request logs (newest first, 50 and 20 lines) inside the stream: from `since` (the stream marker, `twitch:live:since`),
 * or the last 24 hours when no stream is live. Numbers come only from what the logs hold, so a busy stream shows `partial`.
 */
export function streamNumbers(log: MixItUpLogEntry[], cmdLog: MixItUpLogEntry[], since: number | null, now: number): StreamNumbers {
  const from = since ?? now - DAY_MS;
  const inside = (l: MixItUpLogEntry[]) => l.filter(e => e.at >= from);
  const [a, c] = [inside(log), inside(cmdLog)];
  const reasons = new Map<string, number>();
  for (const e of a) if (e.what === 'refused') { const r = e.detail.split(':')[0].trim(); reasons.set(r, (reasons.get(r) ?? 0) + 1); }
  const top = [...reasons.entries()].sort((x, y) => y[1] - x[1])[0];
  const full = (all: MixItUpLogEntry[], kept: MixItUpLogEntry[], cap: number) => all.length >= cap && kept.length === all.length;
  return {
    label: since ? 'This stream' : 'Last 24 hours',
    paid: a.filter(e => e.what === 'deduct' && e.ok).length,
    taken: a.filter(e => e.what === 'deduct' && e.ok).reduce((n, e) => n + amountOf(e.detail), 0),
    added: a.filter(e => e.what === 'add' && e.ok).reduce((n, e) => n + amountOf(e.detail), 0),
    commands: c.filter(e => e.what === 'command' && e.ok).length,
    refusals: a.filter(e => e.what === 'refused').length,
    topReason: top ? { label: REFUSAL_LABELS[top[0]] ?? top[0], count: top[1] } : null,
    partial: full(log, a, LOG_CAP) || full(cmdLog, c, CMD_LOG_CAP),
  };
}

// ── The Log tab ──

export const LOG_FILTERS = [
  { id: 'all', label: 'All' }, { id: 'in', label: 'Incoming' }, { id: 'out', label: 'Outgoing' }, { id: 'refused', label: 'Refusals only' },
] as const;
export type LogFilter = (typeof LOG_FILTERS)[number]['id'];

export const pickLogFilter = (raw: string | undefined): LogFilter => LOG_FILTERS.find(f => f.id === raw)?.id ?? 'all';

/**
 * Incoming = a request from Mix It Up (a chat command, !pack, a card reward, a Stream Deck button); outgoing = the site's calls to Mix It Up (balance, deduct, add, test); refusals = a refused
 * or revoked pull, or an incoming request that answered with an error or a refusal.
 */
const isIn = (e: MixItUpLogEntry) => e.what === 'command' || e.what === 'pull' || e.what === 'grant' || e.what === 'buff';
export function filterLog(log: MixItUpLogEntry[], f: LogFilter): MixItUpLogEntry[] {
  switch (f) {
    case 'in': return log.filter(isIn);
    case 'out': return log.filter(e => e.what === 'balance' || e.what === 'deduct' || e.what === 'add' || e.what === 'test');
    case 'refused': return log.filter(e => e.what === 'refused' || e.what === 'revoked' || (isIn(e) && !e.ok));
    default: return log;
  }
}
