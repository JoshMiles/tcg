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

/** Pauses or resumes pulls. True when the state changed (a repeat does not post to chat again). */
export async function setPullsPaused(on: boolean): Promise<boolean> {
  if ((await isPullsPaused()) === on) return false;
  if (on) await kv.set(PAUSED, 1); else await kv.del(PAUSED);
  if (await pauseChatOn()) await bridgeSay(on ? `${PAUSED_MESSAGE}.` : OPEN_MESSAGE);
  return true;
}
