import { kv, inSandbox } from './db';
import { escapeMd, notifyRecap, notifySystem } from './discord';
import { getActivity } from './activity';
import { getActiveSeasonWithPacks } from './kv';
import { buildStreamRecap, normalizeRecap, recapWorthPosting, type StreamRecap } from './stream-recap';
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
const SINCE_KEY = 'twitch:live:since';   // when the current stream started (ms), set while it is seen live, deleted once its recap is handled
const RECAP_LOCK = 'twitch:recap:lock';
const HINT_KEY = 'twitch:live:hint';    // { live, at } from Mix It Up (POST /api/webhooks/stream); wins over Helix while fresh
const HINT_MS = 5 * 60_000;             // Helix lags a stream's start and end by a minute or two
export const RECAP_KEY = 'stream:recap:latest';
const ACTIVITY_CAP = 500;           // the size of the activity log (lib/activity.ts)
const FRESH_MS = 45_000; // how long a lookup is reused, across every serverless instance (shared via KV)

/**
 * Whether the channel is live right now, from Twitch's `streams` endpoint with the app token. Results are cached in KV
 * for ~45 seconds so page views and polling never turn into Twitch API calls one-for-one. Returns null when Twitch
 * isn't configured or can't be reached and there's nothing cached, callers should simply show no indicator then.
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
    let status: LiveStatus = s && s.type === 'live'
      ? { live: true, title: s.title, game: s.game_name, viewers: s.viewer_count, startedAt: s.started_at, checkedAt: Date.now() }
      : { live: false, checkedAt: Date.now() };
    const hint = await kv.get<{ live: boolean; at: number }>(HINT_KEY).catch(() => null);
    if (hint && Date.now() - hint.at < HINT_MS && hint.live !== status.live) status = { live: hint.live, checkedAt: status.checkedAt };
    await applyStatus(status, cached);
    return status;
  } catch (e) {
    console.error('[live] lookup failed:', e instanceof Error ? e.message : e);
    return cached; // a slightly stale answer beats none
  }
}

/** Mix It Up says the stream started or ended: trust it now (and over Helix for a few minutes), then do what a seen change does. */
export async function setLiveFromHint(live: boolean): Promise<LiveStatus> {
  const now = Date.now();
  await kv.set(HINT_KEY, { live, at: now }, { ex: Math.ceil(HINT_MS / 1000) });
  const cached = await kv.get<LiveStatus>(KEY).catch(() => null);
  const status: LiveStatus = cached?.live === live ? { ...cached, checkedAt: now } : { live, ...(live ? { startedAt: new Date(now).toISOString() } : {}), checkedAt: now };
  await applyStatus(status, cached);
  return status;
}

/** Stores a status, keeps the stream-start marker, posts the recap when offline and tells the System channel about a change. */
async function applyStatus(status: LiveStatus, cached: LiveStatus | null): Promise<void> {
  await kv.set(KEY, status, { ex: 300 }).catch(() => {});
  if (status.live && status.startedAt) await kv.set(SINCE_KEY, Date.parse(status.startedAt) || Date.now(), { ex: 172_800 }).catch(() => {});
  else if (status.live) await kv.set(SINCE_KEY, Date.now(), { ex: 172_800, nx: true }).catch(() => {}); // a hint with no start time keeps the one recorded
  else await finishStream();
  if (cached && cached.live !== status.live) {
    void notifySystem({ title: status.live ? '🔴 The stream went live' : '⚫ The stream went offline', ...(status.live && status.title ? { text: escapeMd(status.title.slice(0, 200)) } : {}), tone: 'info' });
  }
}

/**
 * Called whenever the channel is seen offline. If a stream start was recorded, the recap is built and posted exactly once: a short
 * KV lock stops two instances working at the same moment, and the start marker is deleted before posting so nothing can post it
 * again. No marker (nobody looked while it was live) or no pulls means no recap. Never throws.
 */
export async function finishStream(now = Date.now()): Promise<StreamRecap | null> {
  try {
    if (await inSandbox()) return null;
    const since = await kv.get<number>(SINCE_KEY);
    if (!since) return null; // nobody saw the stream start: skip, and take no lock
    if (!(await kv.set(RECAP_LOCK, 1, { nx: true, ex: 60 }))) return null;
    await kv.del(SINCE_KEY);
    const [{ events }, active] = await Promise.all([getActivity({ limit: ACTIVITY_CAP }), getActiveSeasonWithPacks().catch(() => null)]);
    const recap = buildStreamRecap(events, since, now, { seasonId: active?.season.id, logIsFull: events.length >= ACTIVITY_CAP });
    if (!recapWorthPosting(recap)) return null;
    await kv.set(RECAP_KEY, recap);
    await notifyRecap(recap);
    return recap;
  } catch (e) {
    console.error('[live] recap failed:', e instanceof Error ? e.message : e);
    return null;
  }
}

/** The most recent stream recap, for the dashboard widget and the channel card's test button. */
export async function getLatestRecap(): Promise<StreamRecap | null> {
  try { const r = await kv.get<StreamRecap>(RECAP_KEY); return r ? normalizeRecap(r) : null; } catch { return null; }
}
