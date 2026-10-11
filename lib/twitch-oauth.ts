import { SITE_URL } from './site';

// Twitch "Log in with Twitch" (OAuth authorization-code flow) for the website. We ask for NO scopes: that gives a
// token that can read only the user's public profile, which is all we need (user ID, login, display name, picture).
// The token is used once to read that profile and then revoked — it is never stored.
//
// The Twitch URLs can be pointed at a local fake (scripts/mock-twitch.cjs) outside production, so the flow can be
// tested without real Twitch credentials. In production they are always the real ones.

const dev = process.env.NODE_ENV !== 'production';
const ID_URL = (dev && process.env.TWITCH_ID_URL) || 'https://id.twitch.tv';
const API_URL = (dev && process.env.TWITCH_API_URL) || 'https://api.twitch.tv';

/** Must match a "OAuth Redirect URL" registered on the Twitch application exactly. */
export const REDIRECT_URI = `${SITE_URL}/auth/twitch/callback`;

const credentials = () => ({
  clientId: process.env.TWITCH_CLIENT_ID ?? '',
  clientSecret: process.env.TWITCH_CLIENT_SECRET ?? '',
});

export function authorizeUrl(state: string): string {
  const { clientId } = credentials();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: '',
    state,
  });
  return `${ID_URL}/oauth2/authorize?${params}`;
}

export interface TwitchProfile {
  id: string;
  login: string;       // lowercase
  displayName: string;
  avatarUrl: string;
}

/** Swaps the one-time code for an access token. Throws on failure. */
async function exchangeCode(code: string): Promise<string> {
  const { clientId, clientSecret } = credentials();
  const res = await fetch(`${ID_URL}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT_URI,
    }),
  });
  if (!res.ok) throw new Error(`Twitch token exchange failed (${res.status})`);
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error('Twitch returned no access token');
  return data.access_token;
}

async function fetchProfile(accessToken: string): Promise<TwitchProfile> {
  const { clientId } = credentials();
  const res = await fetch(`${API_URL}/helix/users`, {
    headers: { Authorization: `Bearer ${accessToken}`, 'Client-Id': clientId },
  });
  if (!res.ok) throw new Error(`Twitch profile lookup failed (${res.status})`);
  const data = (await res.json()) as { data?: { id: string; login: string; display_name: string; profile_image_url: string }[] };
  const u = data.data?.[0];
  if (!u) throw new Error('Twitch returned no user');
  return { id: u.id, login: u.login.toLowerCase(), displayName: u.display_name || u.login, avatarUrl: u.profile_image_url };
}

async function revoke(accessToken: string): Promise<void> {
  const { clientId } = credentials();
  await fetch(`${ID_URL}/oauth2/revoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, token: accessToken }),
  }).catch(() => {});
}

/** Completes the login: code → profile, then discards the token. */
export async function profileFromCode(code: string): Promise<TwitchProfile> {
  const token = await exchangeCode(code);
  try {
    return await fetchProfile(token);
  } finally {
    await revoke(token);
  }
}

/** Only same-site relative paths may be used as a post-login destination (no open redirects). */
export function safeReturnTo(raw: string | null | undefined, fallback = '/account'): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\') || raw.includes('\n') || raw.includes('\r')) return fallback;
  if (raw.startsWith('/auth/')) return fallback;
  return raw;
}
