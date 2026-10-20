import { kv, inSandbox } from './db';
import { after } from 'next/server';
import { notifyDiscord } from './discord';
import { recordStats } from './stats';
import { currentStaffLogin } from './staff-actor';
import type { Variant } from './types';

// Append-only activity log powering /admin/activity. Newest first in the KV list `activity:log`
// (capped at LOG_CAP); `activity:seq` is a monotonic counter so pollers can ask "anything after N?"
// with a single cheap GET.
const LOG_KEY = 'activity:log';
const SEQ_KEY = 'activity:seq';
const LOG_CAP = 500;

export type ActivityDetail =
  | { type: 'pull'; cardNumber: number; cardName: string; stars: number; packName: string; variant?: Variant; isNew: boolean; copies: number; uniqueOwned: number; /** The serial number this copy got, and its points multiplier when that is above 1. */ serial?: number; bonus?: number; /** The print's id (`<card>.<version>.<n>`) and its unique edition number, when the collection is numbered. */ copyId?: string; uid?: number }
  | { type: 'grant'; source: 'admin' | 'webhook'; cardNumber: number; variant?: Variant; copyId?: string; uid?: number;
      /** A webhook grant (a reward from Mix It Up and the like) is recorded with the same facts as a pull, so it reads and posts like one. Older events lack them. */
      cardName?: string; stars?: number; packName?: string; isNew?: boolean; copies?: number; uniqueOwned?: number; serial?: number; bonus?: number }
  | { type: 'remove'; cardNumber: number; variant?: Variant }
  | { type: 'upgrade'; cardNumber: number; cardName: string; from: Variant; to: Variant; cost: number; /** The edition the upgrade made. */ copyId?: string; uid?: number }
  // something that happened to a trade offer. `username` is the viewer who made the offer, `partner` the other side (who it was
  // offered to / who accepted), `by` who did it ('admin' for an admin cancel). give/get are readable lines ("2× Card (Shiny Full Art)")
  | { type: 'trade'; action: 'offered' | 'countered' | 'accepted' | 'declined' | 'cancelled' | 'expired' | 'reversed'; partner?: string; by?: string; kind: 'direct' | 'listing'; give: string[]; get: string[]; givePts: number; getPts: number; note?: string; cardNumber?: number; /** Set on new events so the public Activity tab can open the offer. Older events omit it and stay plain text. */ tradeId?: string }
  | { type: 'reset'; scope: 'season' | 'all' | 'everyone' }
  | { type: 'delete' }
  // something asked the overlay to draw / show a collection: an incoming webhook, or an admin quick action
  | { type: 'trigger'; kind: 'pull' | 'collection' | 'card'; source?: 'webhook' | 'admin'; count?: number; cardName?: string }
  | { type: 'collection_shown' }                      // overlay displayed a viewer's collection
  | { type: 'buff'; cardNumber: number; cardName: string; buffName: string; buffType: string; magnitude: number; duration?: string; copyId?: string; uid?: number };

export type ActivityEvent = ActivityDetail & {
  seq: number;
  at: number;
  username: string;          // lowercase Twitch login; '' for events not about one user
  collectionName?: string;
  /** The staff member (Twitch login) who did it, on events that staff cause: gifts, grants, removals, resets, deletes and admin cancels of offers. */
  staff?: string;
};

export type NewActivity = ActivityDetail & { username: string; collectionName?: string };

/**
 * Is this the kind of event a staff member causes (so it should name them)? A viewer's own pull, upgrade or trade is not, even when
 * the viewer happens to be staff: only the actions taken from the admin and mod panels.
 */
export function isStaffAction(e: NewActivity): boolean {
  switch (e.type) {
    case 'remove': case 'reset': case 'delete': return true;
    case 'grant': return e.source === 'admin';
    case 'trigger': return e.source === 'admin';
    case 'trade': return e.by === 'admin';
    default: return false;
  }
}

/** Records an event. Never throws, activity logging must not break the action it describes. */
export async function recordActivity(event: NewActivity): Promise<void> {
  try {
    const seq = await kv.incr(SEQ_KEY);
    const staff = isStaffAction(event) ? await currentStaffLogin() : null;
    const full: ActivityEvent = { ...event, username: event.username.toLowerCase(), seq, at: Date.now(), ...(staff ? { staff } : {}) };
    await kv.lpush(LOG_KEY, full);
    await kv.ltrim(LOG_KEY, 0, LOG_CAP - 1);
    await recordStats(full as unknown as Parameters<typeof recordStats>[0], full.at);
    // A sandbox never posts to Discord (the post runs in after(), where the request's sandbox isn't visible, so decide here).
    if (!(await inSandbox())) forwardToDiscord(full);
  } catch {
    // swallow
  }
}

// Posts to Discord after the response has been sent (so it never slows the request that caused the
// event). Outside a request (scripts/tests) `after` isn't available, so just run it.
function forwardToDiscord(event: ActivityEvent): void {
  const run = () => notifyDiscord(event);
  try {
    after(run);
  } catch {
    void run();
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
  const events = ((await kv.lrange<ActivityEvent>(LOG_KEY, 0, count - 1)) ?? []).map(normalizeEvent);
  return { events: after !== undefined ? events.filter(e => e.seq > after) : events, seq };
}

/**
 * Trade events logged before offers could be answered were { partner, gave: number, got: number } (a completed trade, with copy
 * counts). Everything that reads the log expects the current shape, so old entries are upgraded as they are read.
 */
function normalizeEvent(e: ActivityEvent): ActivityEvent {
  if (e.type !== 'trade' || Array.isArray(e.give)) return e;
  const legacy = e as unknown as { gave?: number; got?: number };
  const lines = (n?: number) => [`${n ?? '?'} card${n === 1 ? '' : 's'}`];
  return { ...e, action: e.action ?? 'accepted', kind: e.kind ?? 'direct', give: lines(legacy.gave), get: lines(legacy.got), givePts: 0, getPts: 0 };
}
