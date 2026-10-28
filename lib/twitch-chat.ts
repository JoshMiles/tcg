// Chat commands through TCG Bridge, the KV side (ROADMAP 58.6). The app forwards only chat messages whose first word is a command the site knows
// (`chatCommandList`); `runChatMessage` runs each one exactly as its Mix It Up webhook does (`!pack` = queuePull with chat: true, a chat command =
// runCommand, `!showoff` = the show-off helper), with the chat message id as the dedupe key in place of `requestId`, and sends the reply to chat
// with Helix (`sendChatReply`). While chat comes through TCG Bridge the three Mix It Up webhooks answer "from_twitch" (`chatFromTwitch`).
// No chat text is stored. No token is stored, logged or put in an error.
import { NextResponse } from 'next/server';
import { kv } from './db';
import { getCommands, runCommand } from './commands';
import { matchCommand } from './commands-core';
import { logMixItUp } from './mixitup';
import { liveGate } from './overlay-settings';
import { queuePull } from './pull-queue';
import { rateLimit } from './rate-limit';
import { queueShowOff } from './staff-actions';
import { API_URL, credentials } from './twitch-oauth';
import { channelAccessToken, readChannelStatus } from './twitch-channel';
import { chatScopesOk, RECONNECT_FOR_CHAT } from './twitch-channel-core';
import { botAccessToken, getReplyAs, readBotStatus } from './twitch-bot';
import { twitchHandlesEvent } from './twitch-eventsub';
import { CHAT_EVENT, cleanChatEvent, commandWords, splitCommand } from './twitch-chat-core';

const SEEN_PREFIX = 'twitch:chat:';
const SEEN_TTL_S = 600;
/** Twitch's limits for a sender that is not verified: 1 message a second, 20 in 30 seconds. */
const PER_SECOND = 1, PER_WINDOW = 20, WINDOW_S = 30;
const REPLY_MAX = 500;
const FALLBACK_NOTICE_S = 300;

/** The first words the app should forward, and whether the connected channel allowed chat (the app subscribes only then). */
export async function chatCommandList(): Promise<{ commands: string[]; chat: boolean }> {
  const [commands, channel] = await Promise.all([getCommands(), readChannelStatus()]);
  return { commands: commandWords(commands), chat: !!channel && chatScopesOk(channel.scopes) };
}

/** The answer of a Mix It Up chat webhook while Twitch delivers chat (the switch-over rule: live channel, not testing, fresh connected report, chat subscription enabled), else null. */
export async function chatFromTwitch(): Promise<NextResponse | null> {
  return (await twitchHandlesEvent(CHAT_EVENT)) ? NextResponse.json({ ok: true, ignored: true, reason: 'from_twitch', message: '' }) : null;
}

export type ChatOutcome =
  | { status: 'ran'; reply: 'sent' | 'dropped' | 'failed' | 'none' }
  | { status: 'duplicate' }
  | { status: 'ignored'; reason: 'not_command' | 'own_message' };

/** Runs one forwarded chat message (already shape-checked by cleanTwitchEvent). Unknown first words are ignored here too. */
export async function runChatMessage(event: unknown, fetchFn: typeof fetch = fetch): Promise<ChatOutcome> {
  const m = cleanChatEvent(event);
  const sp = m ? splitCommand(m.text) : null;
  const commands = await getCommands();
  if (!m || !sp || !commandWords(commands).includes(sp.word)) return { status: 'ignored', reason: 'not_command' };
  // The bot's own messages are never commands (a reply that starts with "!" must not run again).
  const bot = await readBotStatus();
  if (bot && m.userId && m.userId === bot.userId) return { status: 'ignored', reason: 'own_message' };
  // The chat message id is the dedupe key (the place of a Mix It Up request's requestId): a resend or a second app runs it once.
  const seen = SEEN_PREFIX + m.id;
  if (!(await kv.set(seen, 1, { nx: true, ex: SEEN_TTL_S }))) return { status: 'duplicate' };
  let message = '';
  try {
    if (sp.word === '!pack') {
      const blocked = await liveGate('pull'); // the same "only when live" switch the pull webhook has
      const a = blocked ? { ok: true, ignored: true, reason: blocked, message: '' } as Record<string, unknown> : await queuePull(m.login, { role: m.role, pack: sp.rest, chat: true });
      const why = [a.ignored ? a.reason : '', a.message || a.error].filter(Boolean).join(': ');
      await logMixItUp({ username: m.login, what: 'pull', ok: a.ok !== false && !a.ignored, detail: `from Twitch chat, ${why || 'ok'}` });
      message = typeof a.message === 'string' ? a.message : '';
    } else if (matchCommand(commands, sp.word)) {
      message = (await runCommand({ command: sp.word, username: m.login, args: sp.rest, role: m.role }, commands)).message;
    } else {
      const blocked = await liveGate('collection'); // a show-off is treated like the collection view
      message = blocked ? '' : (await queueShowOff(m.login, sp.rest)).message;
    }
  } catch (e) {
    await kv.del(seen).catch(() => {}); // not run: let a resend through
    throw e;
  }
  if (!message.trim()) return { status: 'ran', reply: 'none' };
  return { status: 'ran', reply: await sendChatReply(message, m.id, m.login, fetchFn) };
}

async function helixSend(token: string, senderId: string, broadcasterId: string, message: string, parentId: string, fetchFn: typeof fetch): Promise<boolean> {
  try {
    const res = await fetchFn(`${API_URL}/helix/chat/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Client-Id': credentials().clientId, 'Content-Type': 'application/json' },
      body: JSON.stringify({ broadcaster_id: broadcasterId, sender_id: senderId, message, reply_parent_message_id: parentId }),
    });
    if (!res.ok) return false;
    const d = (await res.json().catch(() => null)) as { data?: { is_sent?: unknown }[] } | null;
    return d?.data?.[0]?.is_sent !== false;
  } catch {
    return false;
  }
}

/** The channel account's token; one retry when another refresh holds the lock (the app asks for tokens too). */
async function channelToken(fetchFn: typeof fetch) {
  const t = await channelAccessToken(fetchFn);
  if (t.ok || t.error !== 'busy') return t;
  await new Promise(r => setTimeout(r, 400));
  return channelAccessToken(fetchFn);
}

/**
 * Sends one reply to chat as a reply to `parentId`: at most 1 a second and 20 in 30 seconds (KV counters); a reply over the limit is dropped with a log
 * line, never queued. Empty text is not sent. Sender: the channel account, or the bot account when "Reply as: bot" is chosen; if the bot's token or the
 * send fails, the channel account sends it instead and staff get a notice (at most one in 5 minutes). Never throws.
 */
export async function sendChatReply(text: string, parentId: string, viewer: string, fetchFn: typeof fetch = fetch): Promise<'sent' | 'dropped' | 'failed'> {
  const message = text.replace(/\p{Cc}/gu, ' ').trim().slice(0, REPLY_MAX);
  const note = (ok: boolean, detail: string) => logMixItUp({ username: viewer, what: 'command', ok, detail: `chat reply ${detail}` });
  try {
    if (!(await rateLimit('twitch-chat-1s', 'all', PER_SECOND, 1).catch(() => true)) || !(await rateLimit('twitch-chat-30s', 'all', PER_WINDOW, WINDOW_S).catch(() => true))) {
      console.warn('[twitch-chat] reply dropped: over the chat rate limit');
      await note(false, 'dropped: over the chat rate limit');
      return 'dropped';
    }
    const channel = await readChannelStatus();
    if (!channel || !chatScopesOk(channel.scopes)) { await note(false, `not sent: ${RECONNECT_FOR_CHAT}`); return 'failed'; }
    if ((await getReplyAs()) === 'bot') {
      const b = await botAccessToken(fetchFn);
      if (b.ok && (await helixSend(b.accessToken, b.userId, channel.userId, message, parentId, fetchFn))) return 'sent';
      if (await kv.set('twitch:chat-bot-fallback', 1, { nx: true, ex: FALLBACK_NOTICE_S })) {
        try { await (await import('./bridge')).sendNotice({ kind: 'attention', title: 'Chat replies fell back to the channel account', text: b.ok ? 'Twitch would not send the reply as the bot account.' : 'The bot account could not be used. Connect it again.', href: '/admin/mixitup?tab=connection' }); } catch { /* a nicety */ }
      }
    }
    const c = await channelToken(fetchFn);
    if (!c.ok) { await note(false, `not sent: channel token ${c.error}`); return 'failed'; }
    if (await helixSend(c.accessToken, c.userId, channel.userId, message, parentId, fetchFn)) return 'sent';
    await note(false, 'not sent: Twitch refused it');
    return 'failed';
  } catch {
    return 'failed';
  }
}
