// The TCG site's bridge API (app/api/bridge/*). The only address this file ever fetches is the paired site.
export type JobKind = 'balance' | 'deduct' | 'add' | 'viewers' | 'say';
export interface BridgeJob { id: string; kind: string; username?: string; amount?: number; currencyId?: string; text?: string; at?: number }
export interface BridgeResult { id: string; ok: boolean; balance?: number; users?: string[]; error?: string }
export interface BridgeCurrency { id: string; name: string }

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
  constructor(readonly base: string, private token: string, private version: string) {}

  private async call(path: string, body: Record<string, unknown>, signal?: AbortSignal) {
    const r = await post(this.base, path, body, this.token, signal);
    if (r.status === 401) throw new Unauthorized();
    return r;
  }

  async hello(currencies: BridgeCurrency[], mixItUpVersion: string): Promise<void> {
    const r = await this.call('/api/bridge/hello', { version: mixItUpVersion, currencies }, AbortSignal.timeout(15_000));
    if (r.status !== 200) throw new SiteError(r.status, `hello: the site answered ${r.status}`);
  }

  /** Holds up to 25 s on the site's side. */
  async poll(signal: AbortSignal): Promise<BridgeJob[]> {
    const r = await this.call('/api/bridge/poll', { version: this.version }, AbortSignal.any([signal, AbortSignal.timeout(45_000)]));
    if (r.status !== 200) throw new SiteError(r.status, `poll: the site answered ${r.status}`);
    return Array.isArray(r.json.jobs) ? (r.json.jobs as BridgeJob[]) : [];
  }

  /** 'late' = the site had already given up on this job (409). */
  async result(res: BridgeResult): Promise<'stored' | 'late'> {
    const r = await this.call('/api/bridge/result', res as unknown as Record<string, unknown>, AbortSignal.timeout(10_000));
    if (r.status === 409 && r.json.late === true) return 'late';
    if (r.status >= 200 && r.status < 300) return 'stored';
    throw new SiteError(r.status, `result: the site answered ${r.status}`);
  }
}
