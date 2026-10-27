// Does Mix It Up reach the site, and do the site's calls to it work? (ROADMAP 55.1a.) Two small hashes in the store the Mix It Up
// settings use: `mixitup:seen` (field = incoming webhook route, value {okAt?, badAt?}) and `mixitup:out` (field = balance | deduct |
// add | viewers, value {at, ok, detail}). Recording is a side effect: it never throws and the request never depends on it.
import { kv } from './db';
import { CONNECTED_MS, type ObsSnapshot } from './bridge-core';

const SEEN = 'mixitup:seen';
const OUT = 'mixitup:out';

export interface Seen { okAt?: number; badAt?: number }
export type OutKind = 'balance' | 'deduct' | 'add' | 'viewers';
export interface OutResult { at: number; ok: boolean; detail: string }

/** What staff call each incoming route. */
export const ROUTE_NAMES: Record<string, string> = {
  '/api/webhooks/pull': '!pack', '/api/webhooks/command': 'chat commands', '/api/webhooks/show-card': 'show-off',
  '/api/webhooks/grant-card': 'card reward', '/api/webhooks/collection': 'collection', '/api/webhooks/stream': 'stream start/end',
};
export const routeName = (route: string) => ROUTE_NAMES[route] ?? route.replace('/api/webhooks/', '');

const OUT_LABELS: Record<OutKind, string> = { balance: 'Balance address', deduct: 'Deduct address', add: 'Add address', viewers: 'Chat viewers address' };
export const OUT_KINDS = Object.keys(OUT_LABELS) as OutKind[];

/** The `action` of a call to Mix It Up, when it is one of the four that are tracked (a `test` is not). */
export const outKindOf = (action: unknown): OutKind | null => OUT_KINDS.find(k => k === action) ?? null;

/** Notes that a secret worked ('ok') or was wrong ('bad') on an incoming webhook route. The other field is kept. */
export async function noteIncoming(route: string, result: 'ok' | 'bad', now = Date.now()): Promise<void> {
  if (!route.startsWith('/api/webhooks/')) return;
  try {
    const cur = (await kv.hget<Seen>(SEEN, route)) ?? {};
    await kv.hset(SEEN, { [route]: { ...cur, [result === 'ok' ? 'okAt' : 'badAt']: now } });
  } catch { /* the request must not notice */ }
}

/** Notes the outcome of the site's latest call to Mix It Up for one address. */
export async function noteOutgoing(kind: OutKind, ok: boolean, detail: string, now = Date.now()): Promise<void> {
  try { await kv.hset(OUT, { [kind]: { at: now, ok, detail } satisfies OutResult }); } catch { /* the call must not notice */ }
}

/** Everything recorded so far. Empty when nothing was recorded or the read fails. */
export async function readMixItUpHealth(): Promise<MixItUpHealth> {
  const [seen, out] = await Promise.all([
    kv.hgetall<Record<string, Seen>>(SEEN).catch(() => null),
    kv.hgetall<Partial<Record<OutKind, OutResult>>>(OUT).catch(() => null),
  ]);
  return { seen: seen ?? {}, out: out ?? {} };
}

export interface MixItUpHealth { seen: Record<string, Seen>; out: Partial<Record<OutKind, OutResult>> }
export interface HealthChip { tone: 'ok' | 'warn' | 'bad' | 'muted'; text: string }

/** What TCG Bridge sees in OBS, as one chip. Null when no bridge ever reported OBS. A report older than a minute counts as not connected. Pure. */
export function obsChip(obs: ObsSnapshot | null | undefined, now: number): HealthChip | null {
  if (!obs) return null;
  if (!obs.connected || now - obs.at > CONNECTED_MS) return { tone: 'bad', text: 'OBS not connected' };
  const { found, inProgram, visible } = obs.overlay;
  if (!found) return { tone: 'warn', text: 'OBS: overlay source not found' };
  if (!inProgram) return { tone: 'warn', text: `OBS: overlay not in the current scene (${obs.scene})` };
  if (!visible) return { tone: 'warn', text: `OBS: overlay hidden in ${obs.scene}` };
  return { tone: 'ok', text: `OBS: overlay visible in ${obs.scene}` };
}

/** One address's line: not set, set and not used yet, working, or failing with the reason. An empty deduct address is the balance address. Pure. */
export function outLine(kind: OutKind, urls: Record<OutKind, string>, health: MixItUpHealth, now: number, ago: (at: number, now: number) => string): HealthChip {
  const label = OUT_LABELS[kind];
  const viaBalance = kind === 'deduct' && !urls.deduct && !!urls.balance;
  const r = health.out[kind];
  if (!urls[kind] && !viaBalance) return { tone: 'muted', text: `${label}: not set` };
  if (!r) return { tone: 'muted', text: `${label}: ${viaBalance ? 'uses the balance address, not used yet' : 'set, not used yet'}` };
  return r.ok
    ? { tone: 'ok', text: `${label}: working (${ago(r.at, now)})` }
    : { tone: 'bad', text: `${label}: failing, ${r.detail} (${ago(r.at, now)})` };
}

/**
 * The status row: when Mix It Up last reached the site, any wrong secret, and one chip per address the site calls. In bridge mode
 * (`bridge` given: when a bridge last polled, or null, and what it last saw in OBS) one TCG Bridge chip and the OBS chip replace
 * the address chips. Pure.
 */
export function healthChips(health: MixItUpHealth, urls: Record<OutKind, string>, now: number, ago: (at: number, now: number) => string, bridge?: { at: number | null; obs?: ObsSnapshot | null }): HealthChip[] {
  const chips: HealthChip[] = [];
  const routes = Object.entries(health.seen);
  const last = routes.filter(([, s]) => s.okAt).sort((a, b) => b[1].okAt! - a[1].okAt!)[0];
  chips.push(last
    ? { tone: 'ok', text: `Mix It Up last reached the site ${ago(last[1].okAt!, now)} (${routeName(last[0])})` }
    : { tone: 'muted', text: 'Mix It Up has not reached the site yet' });
  for (const [route, s] of routes) {
    if (s.badAt && s.badAt > (s.okAt ?? 0)) chips.push({ tone: 'warn', text: `Mix It Up reached ${routeName(route)} with the wrong secret ${ago(s.badAt, now)}` });
  }
  if (bridge) {
    chips.push(bridge.at && now - bridge.at <= CONNECTED_MS
      ? { tone: 'ok', text: `TCG Bridge connected (${ago(bridge.at, now)})` }
      : { tone: 'bad', text: `TCG Bridge not connected${bridge.at ? ` (last seen ${ago(bridge.at, now)})` : ''}` });
    const obs = obsChip(bridge.obs, now);
    if (obs) chips.push(obs);
    return chips;
  }
  for (const kind of OUT_KINDS) chips.push(outLine(kind, urls, health, now, ago));
  return chips;
}
