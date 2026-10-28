// The TCG site's bridge API (app/api/bridge/*). The only address this file ever fetches is the paired site.
import type { SiteFacts } from './checklist';
export type JobKind = 'balance' | 'deduct' | 'add' | 'viewers' | 'say' | 'obs-refresh' | 'run-command' | 'pull-event' | 'backup' | 'ledger' | 'summary';
/** `pull-event` (ROADMAP 55.8): `phase` 'start' shows `source` for `holdMs`; 'reveal' says `text` in chat, switches to `scene` for `secs` and/or saves a clip. `backup` (55.10): `phase` is 'start' or 'end'. */
export interface BridgeJob { id: string; kind: string; username?: string; amount?: number; currencyId?: string; text?: string; commandId?: string; args?: string[]; delayMs?: number; phase?: string; source?: string; holdMs?: number; scene?: string; secs?: number; clip?: boolean; feed?: unknown; summary?: unknown; notice?: unknown; at?: number }
export interface BridgeResult { id: string; ok: boolean; balance?: number; users?: string[]; error?: string }
export interface BridgeCurrency { id: string; name: string }
export interface BridgeCommand { id: string; name: string }
export interface SiteAction { ok: boolean; message: string; paused?: boolean; /** "scene <name>" when a chosen OBS scene paused pulls (57.2). */ reason?: string; buffs?: { id: string; name: string }[]; staff?: boolean; tradingPaused?: boolean; /** 57.3: present on `status` and the happy hour actions; null = none running. */ happyHour?: { what: string; endsAt: number } | null }
/** What /api/bridge/staff answers to an action (ROADMAP 55.12). */
export interface StaffReply { ok: boolean; message: string; needsForce?: boolean }
export interface QueueRow { id: string; kind: string; username: string; pack: string; waitedS: number }

/** `{ happyHour }` for the site's answer: an object, null (none running), or nothing when an older site did not say. */
const happyHourOf = (v: unknown): Pick<SiteAction, 'happyHour'> => {
  const h = v as { what?: unknown; endsAt?: unknown } | null | undefined;
  return h && typeof h.what === 'string' && typeof h.endsAt === 'number' ? { happyHour: { what: h.what.slice(0, 80), endsAt: h.endsAt } } : h === null ? { happyHour: null } : {};
};

/** The token was revoked (or never valid): stop polling and ask for a new pairing. */
export class Unauthorized extends Error { constructor() { super('Pair again'); } }
export class SiteError extends Error { constructor(readonly status: number, message: string) { super(message); } }

/** The site address as an origin, or null. https only, except localhost (the checks and a local site). */
export function cleanSite(raw: string): string | null {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return null; }
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) return null;
  return u.origin;
}

async function post(base: string, path: string, body: unknown, token?: string, signal?: AbortSignal): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
    signal,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, json };
}

/** Trades the code from the Mix It Up page for a token. */
export async function pair(site: string, code: string, name: string): Promise<string> {
  const base = cleanSite(site);
  if (!base) throw new SiteError(0, 'The site address must start with https://');
  const { status, json } = await post(base, '/api/bridge/pair', { code, name }, undefined, AbortSignal.timeout(15_000));
  if (status === 200 && typeof json.token === 'string') return json.token;
  throw new SiteError(status, typeof json.error === 'string' ? json.error : `The site answered ${status}`);
}

export class SiteClient {
  constructor(readonly base: string, private token: string, private version: string, private commit = '') {}

  private async call(path: string, body: Record<string, unknown>, signal?: AbortSignal) {
    const r = await post(this.base, path, body, this.token, signal);
    if (r.status === 401) throw new Unauthorized();
    return r;
  }

  /** The site answers with the channel name and the chosen currency's id; an older site sends neither. */
  async hello(currencies: BridgeCurrency[], mixItUpVersion: string, commands: BridgeCommand[] = []): Promise<{ channel: string; currencyId: string }> {
    const r = await this.call('/api/bridge/hello', { version: mixItUpVersion, currencies, commands, ...(this.commit ? { commit: this.commit } : {}) }, AbortSignal.timeout(15_000));
    if (r.status !== 200) throw new SiteError(r.status, `hello: the site answered ${r.status}`);
    return { channel: typeof r.json.channel === 'string' ? r.json.channel : '', currencyId: typeof r.json.currencyId === 'string' ? r.json.currencyId : '' };
  }

  /** OBS facts: `{ type: 'stream', live }` or `{ type: 'obs', connected, scene, overlay }`. */
  async report(body: Record<string, unknown>): Promise<void> {
    const r = await this.call('/api/bridge/report', body, AbortSignal.timeout(10_000));
    if (r.status !== 200) throw new SiteError(r.status, `report: the site answered ${r.status}`);
  }

  /** Holds up to 25 s on the site's side. */
  async poll(signal: AbortSignal): Promise<BridgeJob[]> {
    const r = await this.call('/api/bridge/poll', { version: this.version }, AbortSignal.any([signal, AbortSignal.timeout(45_000)]));
    if (r.status !== 200) throw new SiteError(r.status, `poll: the site answered ${r.status}`);
    return Array.isArray(r.json.jobs) ? (r.json.jobs as BridgeJob[]) : [];
  }

  /** One thing from the PC (ROADMAP 55.9): a button, a hotkey, the tray menu or the queue panel. `status` also answers `paused` and `buffs`. */
  async action(body: Record<string, unknown>): Promise<SiteAction> {
    const r = await this.call('/api/bridge/action', body, AbortSignal.timeout(15_000));
    if (r.status !== 200) throw new SiteError(r.status, `The site answered ${r.status}`);
    return { ok: r.json.ok === true, message: typeof r.json.message === 'string' ? r.json.message : '', ...(typeof r.json.paused === 'boolean' ? { paused: r.json.paused } : {}), ...(typeof r.json.reason === 'string' ? { reason: r.json.reason.slice(0, 200) } : {}), ...(typeof r.json.staff === 'boolean' ? { staff: r.json.staff } : {}), ...(typeof r.json.tradingPaused === 'boolean' ? { tradingPaused: r.json.tradingPaused } : {}), ...(happyHourOf(r.json.happyHour)), ...(Array.isArray(r.json.buffs) ? { buffs: (r.json.buffs as SiteAction['buffs'])!.filter(b => typeof b?.id === 'string' && typeof b?.name === 'string') } : {}) };
  }

  /** One staff action (ROADMAP 55.12). A 403 means the admin has not switched staff tools on for this PC. */
  async staff(body: Record<string, unknown>): Promise<StaffReply> {
    const r = await this.call('/api/bridge/staff', body, AbortSignal.timeout(15_000));
    if (r.status === 403) return { ok: false, message: 'Staff tools are off for this PC (an admin switches them on at Mix It Up, Connection).' };
    if (r.status !== 200) throw new SiteError(r.status, `The site answered ${r.status}`);
    return { ok: r.json.ok === true, message: typeof r.json.message === 'string' ? r.json.message : '', ...(r.json.needsForce === true ? { needsForce: true } : {}) };
  }

  /** What the Staff tab shows: `what` is state, users, cards or viewer. Null on a 403. */
  async staffGet(what: string, q = ''): Promise<Record<string, unknown> | null> {
    const res = await fetch(`${this.base}/api/bridge/staff?what=${encodeURIComponent(what)}&q=${encodeURIComponent(q)}`, { headers: { authorization: `Bearer ${this.token}` }, signal: AbortSignal.timeout(15_000) });
    if (res.status === 401) throw new Unauthorized();
    if (res.status === 403) return null;
    if (res.status !== 200) throw new SiteError(res.status, `The site answered ${res.status}`);
    return (await res.json().catch(() => ({}))) as Record<string, unknown>;
  }

  /** The ledger of adjusts (ROADMAP 55.10), for the site to set against its own record. */
  async ledger(entries: unknown[]): Promise<void> {
    const r = await this.call('/api/bridge/ledger', { entries }, AbortSignal.timeout(20_000));
    if (r.status !== 200) throw new SiteError(r.status, `ledger: the site answered ${r.status}`);
  }

  /** What the pre-stream checklist needs from the site (ROADMAP 57.1): season, openable packs, queue, pause, happy hour. Read only. */
  async checklistFacts(): Promise<SiteFacts> {
    const res = await fetch(this.base + '/api/bridge/checklist', { headers: { authorization: `Bearer ${this.token}` }, signal: AbortSignal.timeout(5_000) });
    if (res.status === 401) throw new Unauthorized();
    if (res.status !== 200) throw new SiteError(res.status, `The site answered ${res.status}`);
    const j = (await res.json().catch(() => ({}))) as Partial<SiteFacts>;
    const hh = j.happyHour;
    return {
      season: j.season && typeof j.season.name === 'string' ? { name: j.season.name } : null,
      openablePacks: Number(j.openablePacks) || 0,
      queueLength: Number(j.queueLength) || 0,
      paused: j.paused === true,
      happyHour: hh && typeof hh.what === 'string' && typeof hh.endsAt === 'number' ? { what: hh.what, endsAt: hh.endsAt } : null,
    };
  }

  /** The overlay queue, the next pull first. */
  async queue(): Promise<QueueRow[]> {
    const res = await fetch(this.base + '/api/bridge/queue', { headers: { authorization: `Bearer ${this.token}` }, signal: AbortSignal.timeout(10_000) });
    if (res.status === 401) throw new Unauthorized();
    if (res.status !== 200) throw new SiteError(res.status, `The site answered ${res.status}`);
    const json = (await res.json().catch(() => ({}))) as { rows?: QueueRow[] };
    return Array.isArray(json.rows) ? json.rows : [];
  }

  /** 'late' = the site had already given up on this job (409). */
  async result(res: BridgeResult): Promise<'stored' | 'late'> {
    const r = await this.call('/api/bridge/result', res as unknown as Record<string, unknown>, AbortSignal.timeout(10_000));
    if (r.status === 409 && r.json.late === true) return 'late';
    if (r.status >= 200 && r.status < 300) return 'stored';
    throw new SiteError(r.status, `result: the site answered ${r.status}`);
  }
}
