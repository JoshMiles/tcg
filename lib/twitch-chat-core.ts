// Chat commands through TCG Bridge, the pure part (ROADMAP 58.6): the `channel.chat.message` event the app forwards (checked and capped), the role from
// its badges, the first word and the rest, and the known command words. No KV and no site imports; lib/twitch-chat.ts holds the KV side.
import type { ChatCommand } from './commands-core';
import type { PullRole } from './mixitup-core';

export const CHAT_EVENT = 'channel.chat.message';
/** What the Chat commands card, the `!pack` setup card, the wizard and the Connection tab say while chat comes through TCG Bridge. */
export const CHAT_VIA_BRIDGE = 'Chat commands now come through TCG Bridge; the Mix It Up commands are only a fallback.';
/** Twitch's own limit for one chat message and for one reply we send. A longer text is not from Twitch, so the event is refused. */
export const CHAT_TEXT_MAX = 500;
/** What follows the command word is read up to here (the pack name or the card the viewer typed); the webhooks cap it lower again. */
export const CHAT_ARGS_MAX = 120;
const BADGES_MAX = 30;

/** A chat message reduced to what the commands need. `id` is Twitch's message id: the dedupe key and the message a reply answers. */
export interface ChatMessage { id: string; login: string; userId: string; text: string; role: PullRole }

const ID = /^[A-Za-z0-9_-]{8,100}$/;
const LOGIN = /^[a-z0-9_]{3,25}$/;

/** The role for limits and prices (55.4b) from the message's badges: broadcaster, moderator, vip, subscriber (a founder is a subscriber), else regular. */
export function badgeRole(badges: unknown): PullRole {
  const have = new Set((Array.isArray(badges) ? badges.slice(0, BADGES_MAX) : []).flatMap(b => {
    const id = b && typeof b === 'object' ? (b as Record<string, unknown>).set_id : null;
    return typeof id === 'string' ? [id] : [];
  }));
  return have.has('broadcaster') ? 'broadcaster' : have.has('moderator') ? 'moderator' : have.has('vip') ? 'vip' : have.has('subscriber') || have.has('founder') ? 'subscriber' : 'regular';
}

/** A chat event body from the app, or null when its shape is wrong or too long. Nothing but these fields is read. */
export function cleanChatEvent(event: unknown): ChatMessage | null {
  if (!event || typeof event !== 'object' || Array.isArray(event)) return null;
  const e = event as Record<string, unknown>;
  const m = e.message && typeof e.message === 'object' ? (e.message as Record<string, unknown>) : null;
  if (typeof e.message_id !== 'string' || !ID.test(e.message_id)) return null;
  if (typeof e.chatter_user_login !== 'string' || !LOGIN.test(e.chatter_user_login.toLowerCase())) return null;
  if (!m || typeof m.text !== 'string' || m.text.length > CHAT_TEXT_MAX) return null;
  if (Array.isArray(e.badges) && e.badges.length > BADGES_MAX) return null;
  return {
    id: e.message_id, login: e.chatter_user_login.toLowerCase(), userId: typeof e.chatter_user_id === 'string' ? e.chatter_user_id.slice(0, 40) : '',
    text: m.text.replace(/\p{Cc}/gu, ' ').trim(), role: badgeRole(e.badges),
  };
}

/** `!pack Base` into `{ word: '!pack', rest: 'Base' }` (the word lowercased, with its "!"). Null when the message does not start with "!" and a word. */
export function splitCommand(text: string): { word: string; rest: string } | null {
  const m = /^(!\S+)\s*([\s\S]*)$/.exec(text.trim());
  return m ? { word: m[1].toLowerCase(), rest: m[2].trim().slice(0, CHAT_ARGS_MAX) } : null;
}

/** The first words the site knows, with their "!": `!pack`, `!showoff` and every switched-on chat command with its aliases, lowercased and without repeats. */
export function commandWords(commands: Pick<ChatCommand, 'name' | 'aliases' | 'enabled'>[]): string[] {
  const words = ['!pack', '!showoff', ...commands.filter(c => c.enabled).flatMap(c => [c.name, ...c.aliases]).map(w => `!${w.toLowerCase()}`)];
  return [...new Set(words)];
}
