// Pause pulls (ROADMAP 55.9). While `pulls:paused` is set, a paid pull and a !pack answer "Packs are paused, back soon" and queue nothing
// (queuePull in lib/pull-queue.ts). It is switched from the Mix It Up page, TCG Bridge (tray, window, hotkey, Stream Deck) and nothing else.
// `pulls:pausechat` (off by default) also posts a chat line through TCG Bridge when it changes.
import { kv } from './db';
import { bridgeSay } from './bridge';

const PAUSED = 'pulls:paused';
const CHAT = 'pulls:pausechat';
export const PAUSED_MESSAGE = 'Packs are paused, back soon';
const OPEN_MESSAGE = 'Packs are open again: type !pack';

export async function isPullsPaused(): Promise<boolean> {
  return !!(await kv.get(PAUSED).catch(() => null));
}

export async function pauseChatOn(): Promise<boolean> {
  return !!(await kv.get(CHAT).catch(() => null));
}

export async function setPauseChat(on: boolean): Promise<void> {
  if (on) await kv.set(CHAT, 1); else await kv.del(CHAT);
}

/** Why pulls are paused: "scene <name>" when TCG Bridge paused them for an OBS scene (ROADMAP 57.2), '' for a pause set by hand or an older one with no reason. */
export async function pauseReason(): Promise<string> {
  const v = await kv.get<{ reason?: unknown } | number>(PAUSED).catch(() => null);
  return v && typeof v === 'object' && typeof v.reason === 'string' ? v.reason : '';
}

/** Pauses or resumes pulls. True when the state changed (a repeat does not post to chat again). A repeat with another reason replaces the reason, so a hand pause (no reason) takes over from a scene pause. */
export async function setPullsPaused(on: boolean, reason = ''): Promise<boolean> {
  if ((await isPullsPaused()) === on) {
    if (on && reason !== (await pauseReason())) await kv.set(PAUSED, reason ? { reason } : 1);
    return false;
  }
  if (on) await kv.set(PAUSED, reason ? { reason } : 1); else await kv.del(PAUSED);
  if (await pauseChatOn()) await bridgeSay(on ? `${PAUSED_MESSAGE}.` : OPEN_MESSAGE);
  return true;
}

const SCENE = 'scene ';

/** The scene rule (ROADMAP 57.2). A scene name pauses pulls with the reason "scene <name>" unless they were paused by hand; null resumes them, but only a pause this rule made. True when the state changed. */
export async function setScenePause(scene: string | null): Promise<boolean> {
  const paused = await isPullsPaused();
  const mine = paused && (await pauseReason()).startsWith(SCENE);
  if (scene === null) return mine ? setPullsPaused(false) : false;
  if (paused && !mine) return false;
  return setPullsPaused(true, SCENE + scene);
}
