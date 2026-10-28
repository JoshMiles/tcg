// Twitch EventSub events forwarded by TCG Bridge, the pure part (ROADMAP 58.2): which events the site takes, how a body is checked and capped, the
// one line each becomes in the recent list, and the app's connection report. No KV and no site imports; lib/twitch-events.ts holds the KV side.
// Nothing here awards anything: redemptions, cheers, gifts and raids are only recorded (58.3 onwards use them).

export const EVENT_TYPES = [
  'channel.channel_points_custom_reward_redemption.add',
  'channel.cheer',
  'channel.subscription.gift',
  'channel.raid',
  'stream.online',
  'stream.offline',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** The most the site reads of one notification body (the app forwards a Twitch event, a few hundred bytes), and how many lines the recent list keeps. */
export const EVENT_BODY_MAX = 16_000;
export const EVENTS_KEPT = 30;
/** A repeated Twitch message id is dropped for this long (SET NX EX). */
export const SEEN_TTL_S = 600;
/** A report older than this means the app stopped telling the site (it repeats itself every minute while connected). */
export const REPORT_STALE_MS = 3 * 60_000;

/** What the Connection tab and the feed show for a recorded event. */
export interface EventLine { id: string; type: EventType; at: number; text: string; /** 58.3: what a channel points award did ("redeemed Open a pack") or why it failed. */ result?: { ok: boolean; text: string } }

/** The line as the Connection tab shows it: the event, then what its award did. */
export const lineText = (l: Pick<EventLine, 'text' | 'result'>): string => (l.result ? `${l.text} (${l.result.text})` : l.text);
export interface CleanEvent { messageId: string; type: EventType; event: Record<string, unknown> }

const MESSAGE_ID = /^[A-Za-z0-9_-]{8,100}$/;
const str = (v: unknown, max = 100): string => (typeof v === 'string' ? v.replace(/\p{Cc}/gu, ' ').trim().slice(0, max) : '');
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(Math.floor(v), 1e9)) : 0);
const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** A notification body from the app, or null when its shape is wrong: `{ messageId, type, event }`. The event must be a plain object. */
export function cleanTwitchEvent(raw: unknown): CleanEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.messageId !== 'string' || !MESSAGE_ID.test(o.messageId)) return null;
  if (typeof o.type !== 'string' || !(EVENT_TYPES as readonly string[]).includes(o.type)) return null;
  if (!o.event || typeof o.event !== 'object' || Array.isArray(o.event)) return null;
  return { messageId: o.messageId, type: o.type as EventType, event: o.event as Record<string, unknown> };
}

/** The Twitch user id the event is about (a raid is about the channel it goes to), '' when the event does not say. */
export function eventChannelId(type: EventType, event: Record<string, unknown>): string {
  return str(type === 'channel.raid' ? event.to_broadcaster_user_id : event.broadcaster_user_id, 40);
}

/** One short line for an event ("alice redeemed Hydrate"). Only known fields are read, each capped; the rest of the payload is never kept. */
export function eventText(type: EventType, event: Record<string, unknown>): string {
  const name = (login: unknown, display: unknown) => str(display, 40) || str(login, 40) || 'Someone';
  switch (type) {
    case 'channel.channel_points_custom_reward_redemption.add': {
      const reward = event.reward && typeof event.reward === 'object' ? (event.reward as Record<string, unknown>) : {};
      return `${name(event.user_login, event.user_name)} redeemed ${str(reward.title, 60) || 'a reward'}`;
    }
    case 'channel.cheer':
      return `${event.is_anonymous === true ? 'Anonymous' : name(event.user_login, event.user_name)} cheered ${plural(num(event.bits), 'bit', 'bits')}`;
    case 'channel.subscription.gift':
      return `${event.is_anonymous === true ? 'Anonymous' : name(event.user_login, event.user_name)} gifted ${plural(num(event.total), 'sub', 'subs')}`;
    case 'channel.raid':
      return `${name(event.from_broadcaster_user_login, event.from_broadcaster_user_name)} raided with ${plural(num(event.viewers), 'viewer', 'viewers')}`;
    case 'stream.online': return 'The stream went online';
    default: return 'The stream went offline';
  }
}

export type EsState = 'off' | 'connecting' | 'connected' | 'reconnecting';
export interface EsSub { type: string; status: string }
/** What the app says about its EventSub connection (`POST /api/bridge/report` `{ type: 'twitch', ... }`). */
export interface EventSubReport { state: EsState; reason: string; login: string; testing: boolean; since: number; subs: EsSub[] }

/** A report from the app, capped, or null when its shape is wrong. */
export function cleanEventSubReport(raw: unknown): EventSubReport | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.state !== 'off' && o.state !== 'connecting' && o.state !== 'connected' && o.state !== 'reconnecting') return null;
  const subs = Array.isArray(o.subs) ? o.subs.slice(0, 12).flatMap(s => {
    const t = s && typeof s === 'object' ? (s as Record<string, unknown>) : null;
    return t && typeof t.type === 'string' && typeof t.status === 'string' ? [{ type: str(t.type, 80), status: str(t.status, 40) }] : [];
  }) : [];
  return { state: o.state, reason: str(o.reason, 200), login: str(o.login, 40), testing: o.testing === true, since: num(o.since), subs };
}

/** The card's line: "TCG Bridge listening on STREAM-PC since 19:02, last event 19:20". Null when the app is not listening (or has gone quiet). */
export function listeningLine(r: (EventSubReport & { pc: string; at: number }) | null, last: EventLine | null, now: number, time: (ms: number) => string): string | null {
  if (!r || r.state !== 'connected' || now - r.at > REPORT_STALE_MS) return null;
  return `TCG Bridge listening on ${r.pc} since ${time(r.since)}, ${last ? `last event ${time(last.at)}` : 'no event yet'}`;
}
