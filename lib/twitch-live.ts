import { kv } from './db';
import { getAppAccessToken, twitchCredentials, TWITCH_API_URL } from './twitch-helix';
import { CHANNEL_LOGIN } from './site';

export interface LiveStatus {
  live: boolean;
  title?: string;
  game?: string;
  viewers?: number;
  startedAt?: string;
  /** When Twitch was last asked (ms). */
  checkedAt: number;
}

const KEY = 'twitch:live';
const FRESH_MS = 45_000; // how long a lookup is reused, across every serverless instance (shared via KV)

/**
 * Whether the channel is live right now, from Twitch's `streams` endpoint with the app token. Results are cached in KV
 * for ~45 seconds so page views and polling never turn into Twitch API calls one-for-one. Returns null when Twitch
 * isn't configured or can't be reached and there's nothing cached — callers should simply show no indicator then.
 */
export async function getLiveStatus(): Promise<LiveStatus | null> {
  const creds = twitchCredentials();
  if (!creds) return null;

  let cached: LiveStatus | null = null;
  try {
    cached = await kv.get<LiveStatus>(KEY);
    if (cached && Date.now() - cached.checkedAt < FRESH_MS) return cached;
  } catch {
    // KV unavailable: fall through and ask Twitch directly
  }

  try {
    const token = await getAppAccessToken(creds.clientId, creds.clientSecret);
    const res = await fetch(`${TWITCH_API_URL}/helix/streams?user_login=${encodeURIComponent(CHANNEL_LOGIN)}`, {
      headers: { 'Client-ID': creds.clientId, Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Helix streams error: ${res.status}`);
    const data = (await res.json()) as { data?: { type?: string; title?: string; game_name?: string; viewer_count?: number; started_at?: string }[] };
    const s = data.data?.[0];
    const status: LiveStatus = s && s.type === 'live'
      ? { live: true, title: s.title, game: s.game_name, viewers: s.viewer_count, startedAt: s.started_at, checkedAt: Date.now() }
      : { live: false, checkedAt: Date.now() };
    await kv.set(KEY, status, { ex: 300 }).catch(() => {});
    return status;
  } catch (e) {
    console.error('[live] lookup failed:', e instanceof Error ? e.message : e);
    return cached; // a slightly stale answer beats none
  }
}
