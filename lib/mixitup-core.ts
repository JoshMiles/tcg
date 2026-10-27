// Mix It Up paid pulls (ROADMAP Track 12): the settings, the message template, how replies are read and when a pull is allowed.
// Pure (no database, no network), so the settings form, the server and scripts/check-mixitup.mts share it.
import { CHANNEL_LOGIN } from './site';
import { checkWebhookUrl } from './webhook-clean';

/** Who a paid pull counts as. Gifted subs are not a role: a gift earns a pack and does not change these limits. */
export const PULL_ROLES = ['regular', 'subscriber', 'vip', 'moderator', 'broadcaster'] as const;
export type PullRole = (typeof PULL_ROLES)[number];
export const PULL_ROLE_LABELS: Record<PullRole, string> = {
  regular: 'Regular', subscriber: 'Subscriber', vip: 'VIP', moderator: 'Moderator', broadcaster: 'Broadcaster',
};

/** How the site talks to Mix It Up: through TCG Bridge (the app on the stream PC; ROADMAP 55.0) or to the four addresses below. */
export type MixItUpConnection = 'bridge' | 'addresses';

export interface MixItUpSettings {
  enabled: boolean;
  /** `addresses` keeps the four addresses working (a relay of the streamer's own); `bridge` ignores them. */
  connection: MixItUpConnection;
  /** The Mix It Up currency's id (bridge mode); `currency` stays the display name. */
  currencyId: string;
  /** Mix It Up webhook command that answers `{ balance }`. */
  balanceUrl: string;
  /** Command that takes the currency. Empty = the balance URL again (Mix It Up tells them apart by `action`). */
  deductUrl: string;
  /** Command that adds currency (the currency-grant buff). Empty = that buff cannot be applied. */
  addUrl: string;
  /** Command that answers `{ users: string[] }`: who is in stream chat now. Community one-shot buffs go to them. */
  viewersUrl: string;
  /** Sent as `secret` in every request so the command can check where it came from. */
  secret: string;
  currency: string;
  /** What one pack costs, in the currency. */
  cost: number;
  /** Fallback paid pulls per viewer per stream when a role has no number of its own. 0 = no limit. */
  limit: number;
  /** Paid pulls per stream for each role. 0 = no limit. A missing role uses `limit`. */
  roleLimits: Record<PullRole, number>;
  /** The message sent with the deduction. See MESSAGE_VARS. */
  message: string;
  /** Which key of the balance reply holds the number. */
  balanceField: string;
}

export const MESSAGE_VARS = ['username', 'amount', 'currency', 'cardName', 'variant', 'stars', 'packName', 'cardNumber', 'serial'] as const;
export const DEFAULT_MESSAGE = '{username} opened a pack and pulled {cardName} ({variant}, {stars} stars). {amount} {currency} spent.';
export const MESSAGE_MAX = 400;

const NO_ROLE_LIMITS: Record<PullRole, number> = { regular: 0, subscriber: 0, vip: 0, moderator: 0, broadcaster: 0 };

export const DEFAULT_MIXITUP: MixItUpSettings = {
  enabled: false, connection: 'bridge', currencyId: '', balanceUrl: '', deductUrl: '', addUrl: '', viewersUrl: '', secret: '', currency: 'Brie Bucks', cost: 100, limit: 0,
  roleLimits: { ...NO_ROLE_LIMITS }, message: DEFAULT_MESSAGE, balanceField: 'balance',
};

/** Is there somewhere to send a balance check? Bridge: a chosen currency. Addresses: the balance address. */
export const hasBalanceRoute = (s: Pick<MixItUpSettings, 'connection' | 'currencyId' | 'balanceUrl'>): boolean => (s.connection === 'bridge' ? !!s.currencyId : !!s.balanceUrl);
/** Can currency be given (the add address, or the bridge with a currency)? */
export const hasAddRoute = (s: Pick<MixItUpSettings, 'connection' | 'currencyId' | 'addUrl'>): boolean => (s.connection === 'bridge' ? !!s.currencyId : !!s.addUrl);
/** Can the chat viewers be listed (the viewers address, or the bridge)? */
export const hasViewersRoute = (s: Pick<MixItUpSettings, 'connection' | 'viewersUrl'>): boolean => s.connection === 'bridge' || !!s.viewersUrl;

/** The role a paid pull counts as. The channel login is always the broadcaster. Missing or unknown is regular. */
export function pullRole(role: unknown, username: string): PullRole {
  const name = username.replace(/^@/, '').trim().toLowerCase();
  if (name === CHANNEL_LOGIN) return 'broadcaster';
  const r = typeof role === 'string' ? role.trim().toLowerCase() : '';
  return (PULL_ROLES as readonly string[]).includes(r) ? r as PullRole : 'regular';
}

/** This role's limit, or the old single limit when that role was never saved. */
export function roleLimitOf(s: Pick<MixItUpSettings, 'limit' | 'roleLimits'>, role: PullRole): number {
  const n = s.roleLimits?.[role];
  return typeof n === 'number' && Number.isFinite(n) ? Math.min(1000, Math.max(0, Math.floor(n))) : s.limit;
}

const num = (v: unknown, fallback: number, min: number, max: number): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.floor(n))) : fallback;
};
const text = (v: unknown, max: number, fallback = ''): string => (typeof v === 'string' ? v.trim().slice(0, max) : fallback);

function roleLimitsFrom(raw: Record<string, unknown>, fallback: number): Record<PullRole, number> {
  const obj = (raw.roleLimits && typeof raw.roleLimits === 'object' ? raw.roleLimits : {}) as Record<string, unknown>;
  const out = {} as Record<PullRole, number>;
  for (const role of PULL_ROLES) {
    const field = raw[`roleLimit_${role}`];
    out[role] = num(field !== undefined ? field : obj[role], fallback, 0, 1000);
  }
  return out;
}

/** Whatever is stored (or nothing), as complete, safe settings. */
export function normalizeMixItUp(raw: unknown): MixItUpSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_MIXITUP;
  const limit = num(r.limit, d.limit, 0, 1000);
  const anyAddress = [r.balanceUrl, r.deductUrl, r.addUrl, r.viewersUrl].some(u => typeof u === 'string' && u.trim() !== '');
  return {
    enabled: r.enabled === true,
    // Settings saved before the bridge have no `connection`: they keep their addresses, a new setup starts on the bridge.
    connection: r.connection === 'bridge' || r.connection === 'addresses' ? r.connection : anyAddress ? 'addresses' : 'bridge',
    currencyId: text(r.currencyId, 80),
    balanceUrl: text(r.balanceUrl, 500),
    deductUrl: text(r.deductUrl, 500),
    addUrl: text(r.addUrl, 500),
    viewersUrl: text(r.viewersUrl, 500),
    secret: text(r.secret, 200),
    currency: text(r.currency, 40, d.currency) || d.currency,
    cost: num(r.cost, d.cost, 1, 1_000_000),
    limit,
    roleLimits: roleLimitsFrom(r, limit),
    message: text(r.message, MESSAGE_MAX, d.message) || d.message,
    balanceField: text(r.balanceField, 60, d.balanceField) || d.balanceField,
  };
}

/** Checks the settings form. Returns the cleaned settings, or the first problem in words. */
export function cleanMixItUpInput(raw: Record<string, unknown>): { ok: true; settings: MixItUpSettings } | { ok: false; message: string } {
  const s = normalizeMixItUp(raw);
  for (const [key, label] of [['balanceUrl', 'balance address'], ['deductUrl', 'deduct address'], ['addUrl', 'add address'], ['viewersUrl', 'chat viewers address']] as const) {
    const t = checkWebhookUrl(s[key]);
    if (!t.ok) return { ok: false, message: `The ${label}: ${t.error}` };
    s[key] = t.url;
  }
  const cost = Number(raw.cost);
  if (raw.cost !== undefined && (!Number.isFinite(cost) || cost < 1)) return { ok: false, message: 'The price per pack must be 1 or more.' };
  s.enabled = raw.enabled === true || raw.enabled === 'true' || raw.enabled === 'on';
  if (s.enabled && s.connection === 'addresses' && !s.balanceUrl) return { ok: false, message: 'Paste the balance address before switching Mix It Up on.' };
  if (s.enabled && s.connection === 'bridge' && !s.currencyId) return { ok: false, message: 'Pair TCG Bridge and choose the currency before switching Mix It Up on.' };
  return { ok: true, settings: s };
}

/** Fills {placeholders}; an unknown or missing one becomes empty. Capped so a long card name cannot make an oversized message. */
export function renderMessage(template: string, vars: Record<string, string | number | undefined>): string {
  const out = template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? '')).replace(/\s+/g, ' ').trim();
  return out.length > MESSAGE_MAX ? out.slice(0, MESSAGE_MAX - 1) + '…' : out;
}

/** Sample values for the form's live preview. */
export const SAMPLE_VARS = { username: 'cheesyviewer', amount: 100, currency: 'Brie Bucks', cardName: 'Gouda Goat', variant: 'Full Art Holo', stars: 4, packName: 'Base', cardNumber: 7, serial: 3 };

/** The balance in a reply body, or null when it is missing or not a whole, non-negative number. Numeric strings ("1,250" too) are accepted. */
export function parseBalance(body: unknown, field: string): number | null {
  if (!body || typeof body !== 'object') return null;
  let v = (body as Record<string, unknown>)[field];
  if (typeof v === 'string') v = Number(v.replace(/[,\s]/g, ''));
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null;
}

export const VIEWERS_MAX = 5000;

/** Chat viewers from a reply: `{ users: [...] }` or a bare array; lowercased, without @, deduplicated, capped. Null when the shape is wrong. */
export function parseViewers(body: unknown): string[] | null {
  const list = Array.isArray(body) ? body : body && typeof body === 'object' ? (body as Record<string, unknown>).users : null;
  if (!Array.isArray(list)) return null;
  const out = new Set<string>();
  for (const v of list) {
    const name = typeof v === 'string' ? v.replace(/^@/, '').trim().toLowerCase() : '';
    if (name && out.size < VIEWERS_MAX) out.add(name);
  }
  return [...out];
}

/** Did Mix It Up say it applied the deduction? A 2xx answer counts unless the body sets ok / success / applied to false. */
export function replyApplied(status: number, body: unknown): boolean {
  if (status < 200 || status >= 300) return false;
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    for (const k of ['ok', 'success', 'applied']) if (b[k] === false || b[k] === 'false') return false;
  }
  return true;
}

/** The window "per stream" counts in: the Twitch stream's start, else the UTC day (off-stream or Twitch not configured). */
export function streamKey(startedAtMs: number | null, now = Date.now()): string {
  return startedAtMs ? `s${startedAtMs}` : `d${new Date(now).toISOString().slice(0, 10)}`;
}

export type RefusalReason = 'insufficient_balance' | 'limit_reached' | 'mixitup_unavailable' | 'bad_balance';

/** The sentence a refusal sends back for Mix It Up to post to chat. */
export function refusalMessage(reason: RefusalReason, s: Pick<MixItUpSettings, 'cost' | 'currency' | 'limit'>, username: string, balance?: number): string {
  switch (reason) {
    case 'insufficient_balance': return `${username}, a pack costs ${s.cost.toLocaleString()} ${s.currency}${balance !== undefined ? ` and you have ${balance.toLocaleString()}` : ''}.`;
    case 'limit_reached': return `${username}, you have used all ${s.limit} pulls for this stream.`;
    case 'bad_balance': return `${username}, the balance could not be read, so no pack was opened.`;
    default: return `${username}, the balance check did not answer, so no pack was opened. Try again in a moment.`;
  }
}

/** Can this balance cover every pull in flight, this one included (`pending` already counts it)? */
export function decide(o: { balance: number; cost: number; pending: number }): boolean {
  return o.balance >= o.cost * o.pending; // pending already counts this pull
}
