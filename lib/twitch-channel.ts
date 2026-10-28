// The connected Twitch channel, the KV side (ROADMAP 58.1). An admin connects any Twitch account once (authorization code with CHANNEL_SCOPES); the
// site keeps its refresh token encrypted at `twitch:channel-auth` and hands TCG Bridge short-lived access tokens (58.2 onwards). The access
// token is never stored and no token is ever logged or put in an error. Encryption is the backup helper (BACKUP_ENCRYPTION_KEY).
import { timingSafeEqual } from 'crypto';
import { kv } from './db';
import { decryptBackup, encryptBackup } from './backup-core';
import { API_URL, ID_URL, REDIRECT_URI, credentials } from './twitch-oauth';
import {
  CHANNEL_AUTH_KEY, CHANNEL_SCOPES, channelStatus, cleanChannelAuth, isTesting, missingScopes, refreshAccessToken, testingLine,
  type ChannelAuth, type ChannelStatus,
} from './twitch-channel-core';

const LOCK_KEY = `${CHANNEL_AUTH_KEY}:refresh`;
/** Only one refresh at a time: Twitch can swap the refresh token, and two racing refreshes would leave one with a dead token. */
const LOCK_S = 15;

export const secret = (): string => process.env.BACKUP_ENCRYPTION_KEY ?? '';
export const seal = (t: string): string => encryptBackup(Buffer.from(t, 'utf8'), secret()).toString('base64');
export const unseal = (s: string): string => decryptBackup(Buffer.from(s, 'base64'), secret()).toString('utf8');

const readAuth = async (): Promise<ChannelAuth | null> => cleanChannelAuth(await kv.get(CHANNEL_AUTH_KEY).catch(() => null));
export const audit = async (action: string, detail?: string) => { try { await (await import('./audit')).recordAudit('everyone', action, detail); } catch { /* best effort */ } };

/** The Connection tab's status: who is connected, never a token. Null when nothing is connected. */
export async function readChannelStatus(): Promise<ChannelStatus | null> {
  const a = await readAuth();
  return a ? channelStatus(a) : null;
}

/** Can a connection be made here at all? It needs the Twitch app and the key the refresh token is encrypted with. */
export const channelConnectReady = (): boolean => {
  const c = credentials();
  return !!c.clientId && !!c.clientSecret && secret().length >= 16;
};

/** The state in the sign-in cookie must be the one Twitch sent back, made for a channel connection by this same admin. Pure. */
export function channelStateOk(cookie: string | undefined, state: string | null, adminLogin: string, marker: 'channel' | 'bot' = 'channel'): boolean {
  if (!cookie || !state) return false;
  let c: Record<string, unknown>;
  try { c = JSON.parse(cookie); } catch { return false; }
  // Exactly one marker: a bot sign-in cookie never finishes a channel connection (and the other way round).
  if (c[marker] !== true || c[marker === 'channel' ? 'bot' : 'channel'] === true || c.by !== adminLogin || typeof c.state !== 'string') return false;
  const a = Buffer.from(c.state), b = Buffer.from(state);
  return a.length === b.length && timingSafeEqual(a, b);
}
/** 58.6: the same check for "Connect bot account" (cookie marker `bot`). */
export const botStateOk = (cookie: string | undefined, state: string | null, adminLogin: string): boolean => channelStateOk(cookie, state, adminLogin, 'bot');

/**
 * The OAuth return for a channel connection: the state check, the code exchange, the owner lookup, the scope check, then the store. `by` is the admin
 * (already checked by the caller). Returns a short reason code for the page when it fails; never a token.
 */
export const connectChannel = (code: string, by: string, fetchFn: typeof fetch = fetch) =>
  connectAccount({ key: CHANNEL_AUTH_KEY, scopes: CHANNEL_SCOPES, audit: 'Twitch channel connected' }, code, by, fetchFn);

/** What differs between the channel (58.1) and the bot account (58.6): where it is stored, the scopes it needs, the audit line and an optional refusal (the bot must not be the channel). */
export interface AccountKind { key: string; scopes: readonly string[]; audit: string; refuse?: (userId: string) => Promise<string | null> }

export async function connectAccount(kind: AccountKind, code: string, by: string, fetchFn: typeof fetch = fetch): Promise<{ ok: true; login: string } | { ok: false; reason: string }> {
  if (!channelConnectReady()) return { ok: false, reason: 'unavailable' };
  const { clientId, clientSecret } = credentials();
  let access: string, refresh: string, scopes: string[];
  try {
    const res = await fetchFn(`${ID_URL}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, grant_type: 'authorization_code', redirect_uri: REDIRECT_URI }),
    });
    if (!res.ok) return { ok: false, reason: 'failed' };
    const d = (await res.json()) as { access_token?: unknown; refresh_token?: unknown; scope?: unknown };
    if (typeof d.access_token !== 'string' || typeof d.refresh_token !== 'string' || !d.access_token || !d.refresh_token) return { ok: false, reason: 'failed' };
    access = d.access_token; refresh = d.refresh_token;
    scopes = Array.isArray(d.scope) ? d.scope.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    return { ok: false, reason: 'failed' };
  }
  const drop = (t: string) => fetchFn(`${ID_URL}/oauth2/revoke`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: clientId, token: t }) }).catch(() => {});
  try {
    const me = await fetchFn(`${API_URL}/helix/users`, { headers: { Authorization: `Bearer ${access}`, 'Client-Id': clientId } });
    const u = me.ok ? ((await me.json()) as { data?: { id?: string; login?: string }[] }).data?.[0] : null;
    if (!u?.id || !u.login) { await drop(access); return { ok: false, reason: 'failed' }; }
    if (missingScopes(scopes, kind.scopes).length) { await drop(access); return { ok: false, reason: 'scopes' }; }
    const no = kind.refuse ? await kind.refuse(u.id) : null;
    if (no) { await drop(access); return { ok: false, reason: no }; }
    const rec: ChannelAuth = { userId: u.id, login: u.login.toLowerCase(), scopes, refreshToken: seal(refresh), connectedAt: Date.now(), by };
    await kv.set(kind.key, rec);
    await audit(kind.audit, `${rec.login}${kind.key === CHANNEL_AUTH_KEY && isTesting(rec.login) ? ' (testing, not the live channel)' : ''}`);
    return { ok: true, login: rec.login };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

/** The connection is over: the key is deleted, the audit log and the staff PCs are told. Twitch is not asked (it already said no). */
async function markDisconnected(a: ChannelAuth): Promise<void> {
  await kv.del(CHANNEL_AUTH_KEY);
  await audit('Twitch channel disconnected, Twitch rejected the token', a.login);
  try { await (await import('./bridge')).sendNotice({ kind: 'attention', title: 'Twitch channel disconnected', text: `Twitch rejected the connection for ${a.login}. Connect it again.`, href: '/admin/mixitup' }); } catch { /* a nicety */ }
}

export type ChannelToken = { ok: true; accessToken: string; expiresAt: number; userId: string; login: string } | { ok: false; error: 'not-connected' | 'rejected' | 'busy' | 'unavailable' };

/**
 * A fresh access token for the connected channel. Refreshes the stored refresh token (saving the one Twitch returns); a refresh Twitch rejects
 * (400 or 401) ends the connection. Other failures leave it alone. The access token is returned to the caller only.
 */
export async function channelAccessToken(fetchFn: typeof fetch = fetch): Promise<ChannelToken> {
  const a = await readAuth();
  if (!a) return { ok: false, error: 'not-connected' };
  if (secret().length < 16 || !credentials().clientId) return { ok: false, error: 'unavailable' };
  if (!(await kv.set(LOCK_KEY, 1, { nx: true, ex: LOCK_S }))) return { ok: false, error: 'busy' };
  try {
    let plain: string;
    try { plain = unseal(a.refreshToken); } catch { await markDisconnected(a); return { ok: false, error: 'rejected' }; } // the key changed: the token cannot be read any more
    const r = await refreshAccessToken(plain, credentials(), ID_URL, fetchFn);
    if (!r.ok) {
      if (!r.rejected) return { ok: false, error: 'unavailable' };
      await markDisconnected(a);
      return { ok: false, error: 'rejected' };
    }
    if (r.refreshToken !== plain) await kv.set(CHANNEL_AUTH_KEY, { ...a, refreshToken: seal(r.refreshToken) });
    return { ok: true, accessToken: r.accessToken, expiresAt: r.expiresAt, userId: a.userId, login: a.login };
  } finally {
    await kv.del(LOCK_KEY).catch(() => {});
  }
}

/** Disconnect: revokes the token at Twitch (best effort: a new access token is made from the refresh token and revoked, which ends the grant) and deletes the key. */
export async function disconnectChannel(fetchFn: typeof fetch = fetch): Promise<string | null> {
  const a = await readAuth();
  if (!a) return null;
  try {
    const t = await channelAccessToken(fetchFn);
    if (t.ok) await fetchFn(`${ID_URL}/oauth2/revoke`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: credentials().clientId, token: t.accessToken }) }).catch(() => {});
  } catch { /* the key goes either way */ }
  await kv.del(CHANNEL_AUTH_KEY);
  await audit('Twitch channel disconnected', a.login);
  return a.login;
}

export { CHANNEL_SCOPES, testingLine };
