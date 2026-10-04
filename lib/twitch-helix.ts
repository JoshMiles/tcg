// Twitch Helix API access via the app (client_credentials) token.
// Distinct from TWITCH_EXTENSION_SECRET, which only verifies Extension JWTs.

let cachedToken: { access_token: string; expires_at: number } | null = null;

export function twitchCredentials(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

async function getAppAccessToken(clientId: string, clientSecret: string): Promise<string> {
  // Module-scoped cache — survives across requests in the same serverless instance
  if (cachedToken && Date.now() < cachedToken.expires_at) return cachedToken.access_token;
  const res = await fetch('https://id.twitch.tv/oauth2/token', {
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
  const res = await fetch(`https://api.twitch.tv/helix/users?id=${encodeURIComponent(numericUserId)}`, {
    headers: { 'Client-ID': creds.clientId, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Helix error: ${res.status}`);
  const data = await res.json() as { data?: Array<{ login: string }> };
  return data.data?.[0]?.login ?? null;
}
