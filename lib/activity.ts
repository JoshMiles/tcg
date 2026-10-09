import { kv } from '@vercel/kv';

// Append-only activity log powering /admin/activity. Newest first in the KV list `activity:log`
// (capped at LOG_CAP); `activity:seq` is a monotonic counter so pollers can ask "anything after N?"
// with a single cheap GET.
const LOG_KEY = 'activity:log';
const SEQ_KEY = 'activity:seq';
const LOG_CAP = 500;

export type ActivityDetail =
  | { type: 'pull'; cardNumber: number; cardName: string; stars: number; packName: string; isNew: boolean; copies: number; uniqueOwned: number }
  | { type: 'grant'; source: 'admin' | 'webhook'; cardNumber: number }
  | { type: 'remove'; cardNumber: number }
  | { type: 'reset'; scope: 'season' | 'all' | 'everyone' }
  | { type: 'delete' }
  // something asked the overlay to draw / show a collection: an incoming webhook, or an admin quick action
  | { type: 'trigger'; kind: 'pull' | 'collection'; source?: 'webhook' | 'admin'; count?: number }
  | { type: 'collection_shown' };                      // overlay displayed a viewer's collection

export type ActivityEvent = ActivityDetail & {
  seq: number;
  at: number;
  username: string;          // lowercase Twitch login; '' for events not about one user
  collectionName?: string;
};

export type NewActivity = ActivityDetail & { username: string; collectionName?: string };

/** Records an event. Never throws — activity logging must not break the action it describes. */
export async function recordActivity(event: NewActivity): Promise<void> {
  try {
    const seq = await kv.incr(SEQ_KEY);
    const full: ActivityEvent = { ...event, username: event.username.toLowerCase(), seq, at: Date.now() };
    await kv.lpush(LOG_KEY, full);
    await kv.ltrim(LOG_KEY, 0, LOG_CAP - 1);
  } catch {
    // swallow
  }
}

/**
 * Newest-first events. With `after`, returns only events newer than that seq (at most `limit`);
 * when nothing is new it costs a single GET.
 */
export async function getActivity({ after, limit = 100 }: { after?: number; limit?: number } = {}): Promise<{ events: ActivityEvent[]; seq: number }> {
  const seq = (await kv.get<number>(SEQ_KEY)) ?? 0;
  if (after !== undefined && seq <= after) return { events: [], seq };
  const count = Math.min(after !== undefined ? seq - after : limit, limit);
  const events = (await kv.lrange<ActivityEvent>(LOG_KEY, 0, count - 1)) ?? [];
  return { events: after !== undefined ? events.filter(e => e.seq > after) : events, seq };
}
