// The app's EventSub connection report (ROADMAP 58.2) and, from 58.4, the question the Mix It Up event requests ask: is Twitch delivering this event?
// Kept apart from lib/twitch-events.ts so lib/event-rewards.ts can ask without importing the module that calls it.
import { kv } from './db';
import { readChannelStatus } from './twitch-channel';
import { cleanEventSubReport, twitchHandles, type EventSubReport, type EventType } from './twitch-events-core';

const STATE_KEY = 'twitch:eventsub';

export type StoredEventSub = EventSubReport & { pc: string; at: number };

/** Keeps what the app says about its EventSub connection, with the PC's name and the time. */
export async function storeEventSub(r: EventSubReport, pc: string): Promise<void> {
  await kv.set(STATE_KEY, { ...r, pc, at: Date.now() } satisfies StoredEventSub);
}

export async function readEventSub(): Promise<StoredEventSub | null> {
  const o = await kv.get<Record<string, unknown>>(STATE_KEY).catch(() => null);
  if (!o || typeof o.pc !== 'string' || typeof o.at !== 'number') return null;
  const r = cleanEventSubReport(o);
  return r ? { ...r, pc: o.pc.slice(0, 40), at: o.at } : null;
}

/** 58.4: Twitch is delivering `type` (rule: `twitchHandles`). Any read failure means no, so Mix It Up keeps working. */
export async function twitchHandlesEvent(type: EventType, now = Date.now()): Promise<boolean> {
  try {
    return twitchHandles(type, await readChannelStatus(), await readEventSub(), now);
  } catch {
    return false;
  }
}
