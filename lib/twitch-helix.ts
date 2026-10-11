// Twitch Helix API access via the app (client_credentials) token.
// Distinct from TWITCH_EXTENSION_SECRET, which only verifies Extension JWTs.

// Outside production the Twitch URLs can point at scripts/mock-twitch.cjs so this can be tested without real credentials.
const dev = process.env.NODE_ENV !== 'production';
export const TWITCH_ID_URL = (dev && process.env.TWITCH_ID_URL) || 'https://id.twitch.tv';
export const TWITCH_API_URL = (dev && process.env.TWITCH_API_URL) || 'https://api.twitch.tv';

let cachedToken: { access_token: string; expires_at: number } | null = null;

export function twitchCredentials(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export async function getAppAccessToken(clientId: string, clientSecret: string): Promise<string> {
  // Module-scoped cache — survives across requests in the same serverless instance
  if (cachedToken && Date.now() < cachedToken.expires_at) return cachedToken.access_token;
  const res = await fetch(`${TWITCH_ID_URL}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    }),
  });
  if (!res.ok) throw new Error(`Token fetch failed: ${res.status}`);
  const data = await res.json() as { access_token: string; expires_in: number };
  cachedToken = {
    access_token: data.access_token,
    expires_at: Date.now() + (data.expires_in - 60) * 1000,
  };
  return cachedToken.access_token;
}

/**
 * Resolve a numeric Twitch user ID to a lowercase login name.
 * Returns null if the user doesn't exist; throws on credential/network/API errors
 * (or if credentials are not configured).
 */
export async function resolveTwitchLogin(numericUserId: string): Promise<string | null> {
  const creds = twitchCredentials();
  if (!creds) throw new Error('Twitch credentials not configured');
  const token = await getAppAccessToken(creds.clientId, creds.clientSecret);
  const res = await fetch(`${TWITCH_API_URL}/helix/users?id=${encodeURIComponent(numericUserId)}`, {
    headers: { 'Client-ID': creds.clientId, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Helix error: ${res.status}`);
  const data = await res.json() as { data?: Array<{ login: string }> };
  return data.data?.[0]?.login ?? null;
}

/**
 * Looks up profile pictures for Twitch logins (Helix allows up to 100 per request).
 * Returns login → profile_image_url; logins that don't exist on Twitch are simply absent.
 * Throws on credential/network/API errors so callers can avoid caching a failure as "no avatar".
 */
export async function fetchTwitchAvatars(logins: string[]): Promise<Record<string, string>> {
  const creds = twitchCredentials();
  if (!creds) throw new Error('Twitch credentials not configured');
  const token = await getAppAccessToken(creds.clientId, creds.clientSecret);
  const out: Record<string, string> = {};
  for (let i = 0; i < logins.length; i += 100) {
    const query = logins.slice(i, i + 100).map(l => `login=${encodeURIComponent(l)}`).join('&');
    const res = await fetch(`${TWITCH_API_URL}/helix/users?${query}`, {
      headers: { 'Client-ID': creds.clientId, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Helix error: ${res.status}`);
    const data = await res.json() as { data?: Array<{ login: string; profile_image_url: string }> };
    for (const u of data.data ?? []) out[u.login.toLowerCase()] = u.profile_image_url;
  }
  return out;
}
