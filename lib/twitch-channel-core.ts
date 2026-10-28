// The connected Twitch channel, the pure part (ROADMAP 58.1): the scopes, the stored record, the token refresh and the "Testing on" flag.
// No KV and no site imports; lib/twitch-channel.ts holds the KV side. The access token is never stored and never logged.
import { CHANNEL_LOGIN } from './site';

export const CHANNEL_SCOPES = ['channel:read:redemptions', 'bits:read', 'channel:read:subscriptions'] as const;
export const CHANNEL_AUTH_KEY = 'twitch:channel-auth';
/** Stop an access token this long before Twitch says it ends, so a caller never gets one about to die. */
export const EXPIRY_MARGIN_S = 60;

/** What `twitch:channel-auth` holds. `refreshToken` is encrypted (base64 of lib/backup-core's encryptBackup). */
export interface ChannelAuth { userId: string; login: string; scopes: string[]; refreshToken: string; connectedAt: number; by: string }
/** What the Connection tab and the status answer may show: never a token. `testing` is true when the connected account is not the live channel. */
export interface ChannelStatus { userId: string; login: string; scopes: string[]; connectedAt: number; by: string; testing: boolean }

export const isTesting = (login: string): boolean => login.toLowerCase() !== CHANNEL_LOGIN;
export const testingLine = (login: string): string => `Testing on ${login}, not the live channel`;

export function channelStatus(a: ChannelAuth): ChannelStatus {
  return { userId: a.userId, login: a.login, scopes: a.scopes, connectedAt: a.connectedAt, by: a.by, testing: isTesting(a.login) };
}

/** A stored record with the right shape, or null. */
export function cleanChannelAuth(raw: unknown): ChannelAuth | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.userId !== 'string' || !o.userId || typeof o.login !== 'string' || !o.login || typeof o.refreshToken !== 'string' || !o.refreshToken) return null;
  if (!Array.isArray(o.scopes) || !o.scopes.every(s => typeof s === 'string') || typeof o.connectedAt !== 'number' || typeof o.by !== 'string') return null;
  return { userId: o.userId, login: o.login, scopes: o.scopes as string[], refreshToken: o.refreshToken, connectedAt: o.connectedAt, by: o.by };
}

export const missingScopes = (granted: string[]): string[] => CHANNEL_SCOPES.filter(s => !granted.includes(s));

export type RefreshResult =
  | { ok: true; accessToken: string; refreshToken: string; expiresAt: number; scopes: string[] }
  /** `rejected`: Twitch said the grant is dead (400 or 401), so the connection is over. Anything else (a 5xx, a network error) may pass: try again later. */
  | { ok: false; rejected: boolean };

/**
 * Trades a refresh token for a new access token. `fetchFn` and the address are passed in so a check can fake Twitch. Never throws and never
 * puts a token in an error. Twitch may hand back a new refresh token; the caller must store it (`refreshToken` is always the one to keep).
 */
export async function refreshAccessToken(
  refreshToken: string,
  creds: { clientId: string; clientSecret: string },
  idUrl: string,
  fetchFn: typeof fetch = fetch,
  now = Date.now(),
): Promise<RefreshResult> {
  let res: Response;
  try {
    res = await fetchFn(`${idUrl}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: creds.clientId, client_secret: creds.clientSecret }),
    });
  } catch {
    return { ok: false, rejected: false };
  }
  if (res.status === 400 || res.status === 401) return { ok: false, rejected: true };
  if (!res.ok) return { ok: false, rejected: false };
  const d = (await res.json().catch(() => null)) as { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown; scope?: unknown } | null;
  if (!d || typeof d.access_token !== 'string' || !d.access_token || typeof d.expires_in !== 'number') return { ok: false, rejected: false };
  const scopes = Array.isArray(d.scope) ? d.scope.filter((s): s is string => typeof s === 'string') : [];
  return {
    ok: true,
    accessToken: d.access_token,
    refreshToken: typeof d.refresh_token === 'string' && d.refresh_token ? d.refresh_token : refreshToken,
    expiresAt: now + Math.max(0, d.expires_in - EXPIRY_MARGIN_S) * 1000,
    scopes,
  };
}
