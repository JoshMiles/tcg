// Twitch EventSub events forwarded by TCG Bridge, the KV side (ROADMAP 58.2). The app holds the EventSub WebSocket; the site only records what it is
// sent: a capped list of recent events, the app's connection report, and stream online / offline feeding the live state like the OBS report does.
// Channel point redemptions run their reward's award (58.3, lib/twitch-awards.ts); gifted subs, cheers and raids run the 55.4g event rules (58.4,
// lib/event-rewards.ts); the rest are only recorded. Pure shapes live in twitch-events-core.ts.
import { kv } from './db';
import { setLiveFromBridge } from './twitch-live';
import { readChannelStatus } from './twitch-channel';
import { awardRedemption } from './twitch-awards';
import { rewardTwitchEvent } from './event-rewards';
import { noteFeedEvent } from './mixitup';
import {
  EVENTS_KEPT, EVENT_TYPES, REWARD_EVENT, SEEN_TTL_S, eventChannelId, eventText,
  type CleanEvent, type EventLine,
} from './twitch-events-core';

const EVENTS_KEY = 'twitch:events';
const SEEN_PREFIX = 'twitch:event:';

export type EventOutcome = { status: 'recorded'; live?: boolean } | { status: 'duplicate' } | { status: 'ignored'; reason: 'not_connected' | 'other_channel' };

/**
 * Records one notification. A repeated Twitch message id is dropped for 10 minutes (SET NX EX), so a Twitch resend or a second app never counts
 * it twice. An event for another channel than the connected one is ignored. stream.online / stream.offline go through `setLiveFromBridge`, but not
 * while the connected account is a test one (not CHANNEL_LOGIN): a spare account going live must not flip the real channel's live state.
 */
export async function recordTwitchEvent(e: CleanEvent, now = Date.now()): Promise<EventOutcome> {
  const channel = await readChannelStatus();
  if (!channel) return { status: 'ignored', reason: 'not_connected' };
  if (eventChannelId(e.type, e.event) !== channel.userId) return { status: 'ignored', reason: 'other_channel' };
  const seenKey = SEEN_PREFIX + e.messageId;
  if (!(await kv.set(seenKey, 1, { nx: true, ex: SEEN_TTL_S }))) return { status: 'duplicate' };
  try {
    // 58.3: a redemption runs its reward's award (nothing when the reward has none); the result is recorded with the event. Never throws.
    // 58.4: a gifted sub, cheer or raid runs the 55.4g event rules, the same ones the Mix It Up requests run (lib/event-rewards.ts). Never throws.
    const result = e.type === 'channel.channel_points_custom_reward_redemption.add' ? await awardRedemption(e.event).catch(() => null)
      : e.type in REWARD_EVENT ? await rewardTwitchEvent(e.type as keyof typeof REWARD_EVENT, e.event).catch(() => null) : null;
    const line: EventLine = { id: e.messageId, type: e.type, at: now, text: eventText(e.type, e.event), ...(result ? { result } : {}) };
    await kv.lpush(EVENTS_KEY, line);
    await kv.ltrim(EVENTS_KEY, 0, EVENTS_KEPT - 1);
    const stream = e.type === 'stream.online' || e.type === 'stream.offline';
    if (stream) await noteFeedEvent({ at: now, username: '', event: e.type === 'stream.online' ? 'stream-online' : 'stream-offline', ok: true, detail: line.text }); // 58.5: the app's event feed
    if (stream && !channel.testing) {
      await setLiveFromBridge(e.type === 'stream.online');
      return { status: 'recorded', live: e.type === 'stream.online' };
    }
  } catch (err) {
    await kv.del(seenKey).catch(() => {}); // not recorded: let the resend through
    throw err;
  }
  return { status: 'recorded' };
}

const cleanResult = (v: unknown): EventLine['result'] | undefined => {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  return o && typeof o.ok === 'boolean' && typeof o.text === 'string' ? { ok: o.ok, text: o.text.slice(0, 200) } : undefined;
};

/** The newest recorded events, newest first. */
export async function recentTwitchEvents(n = EVENTS_KEPT): Promise<EventLine[]> {
  const rows = await kv.lrange<unknown>(EVENTS_KEY, 0, Math.min(n, EVENTS_KEPT) - 1).catch(() => []);
  return rows.flatMap(r => {
    const o = r && typeof r === 'object' ? (r as Record<string, unknown>) : null;
    return o && typeof o.id === 'string' && typeof o.type === 'string' && (EVENT_TYPES as readonly string[]).includes(o.type) && typeof o.at === 'number' && typeof o.text === 'string'
      ? [{ id: o.id, type: o.type as EventLine['type'], at: o.at, text: o.text, ...(cleanResult(o.result) ? { result: cleanResult(o.result) } : {}) }] : [];
  });
}

export { readEventSub, storeEventSub, type StoredEventSub } from './twitch-eventsub';
