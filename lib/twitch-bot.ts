// The optional chat bot account (ROADMAP 58.6), the KV side. A second admin-only sign-in for any Twitch account but the channel's (scopes
// BOT_SCOPES); its refresh token is stored encrypted at `twitch:bot-auth`, exactly like the channel's (58.1). With "Reply as: bot" the site sends
// chat replies with this account as sender. Tokens are never stored in the clear, logged or put in an error.
import { kv } from './db';
import { ID_URL, credentials } from './twitch-oauth';
import { BOT_AUTH_KEY, BOT_SCOPES, cleanChannelAuth, refreshAccessToken, type ChannelAuth } from './twitch-channel-core';
import { audit, connectAccount, readChannelStatus, seal, secret, unseal } from './twitch-channel';

const LOCK_KEY = `${BOT_AUTH_KEY}:refresh`;
const LOCK_S = 15;
const REPLY_AS_KEY = 'twitch:chat-reply-as';

export type ReplyAs = 'channel' | 'bot';
export interface BotStatus { userId: string; login: string; connectedAt: number; by: string }

const readAuth = async (): Promise<ChannelAuth | null> => cleanChannelAuth(await kv.get(BOT_AUTH_KEY).catch(() => null));

/** Who the bot account is, never a token. Null when none is connected. */
export async function readBotStatus(): Promise<BotStatus | null> {
  const a = await readAuth();
  return a ? { userId: a.userId, login: a.login, connectedAt: a.connectedAt, by: a.by } : null;
}

/** The OAuth return of "Connect bot account". The bot must be another account than the channel (reason `same`). */
export const connectBot = (code: string, by: string, fetchFn: typeof fetch = fetch) =>
  connectAccount({
    key: BOT_AUTH_KEY, scopes: BOT_SCOPES, audit: 'Twitch bot account connected',
    refuse: async id => ((await readChannelStatus())?.userId === id ? 'same' : null),
  }, code, by, fetchFn);

export type BotToken = { ok: true; accessToken: string; userId: string; login: string } | { ok: false; error: 'not-connected' | 'rejected' | 'busy' | 'unavailable' };

/** A fresh access token for the bot. A refresh Twitch rejects (400 or 401) ends the bot connection; other failures leave it alone. */
export async function botAccessToken(fetchFn: typeof fetch = fetch): Promise<BotToken> {
  const a = await readAuth();
  if (!a) return { ok: false, error: 'not-connected' };
  if (secret().length < 16 || !credentials().clientId) return { ok: false, error: 'unavailable' };
  if (!(await kv.set(LOCK_KEY, 1, { nx: true, ex: LOCK_S }))) return { ok: false, error: 'busy' };
  try {
    let plain: string;
    try { plain = unseal(a.refreshToken); } catch { await kv.del(BOT_AUTH_KEY); await audit('Twitch bot account disconnected, its token cannot be read', a.login); return { ok: false, error: 'rejected' }; }
    const r = await refreshAccessToken(plain, credentials(), ID_URL, fetchFn);
    if (!r.ok) {
      if (!r.rejected) return { ok: false, error: 'unavailable' };
      await kv.del(BOT_AUTH_KEY);
      await audit('Twitch bot account disconnected, Twitch rejected the token', a.login);
      return { ok: false, error: 'rejected' };
    }
    if (r.refreshToken !== plain) await kv.set(BOT_AUTH_KEY, { ...a, refreshToken: seal(r.refreshToken) });
    return { ok: true, accessToken: r.accessToken, userId: a.userId, login: a.login };
  } finally {
    await kv.del(LOCK_KEY).catch(() => {});
  }
}

/** Disconnect bot: revokes the token at Twitch (best effort, like 58.1), deletes the key and writes an audit line. Returns the login, null when none. */
export async function disconnectBot(fetchFn: typeof fetch = fetch): Promise<string | null> {
  const a = await readAuth();
  if (!a) return null;
  try {
    const t = await botAccessToken(fetchFn);
    if (t.ok) await fetchFn(`${ID_URL}/oauth2/revoke`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: credentials().clientId, token: t.accessToken }) }).catch(() => {});
  } catch { /* the key goes either way */ }
  await kv.del(BOT_AUTH_KEY);
  await audit('Twitch bot account disconnected', a.login);
  return a.login;
}

export async function getReplyAs(): Promise<ReplyAs> {
  return (await kv.get(REPLY_AS_KEY).catch(() => null)) === 'bot' ? 'bot' : 'channel';
}

export async function setReplyAs(v: ReplyAs): Promise<void> {
  await kv.set(REPLY_AS_KEY, v === 'bot' ? 'bot' : 'channel');
  await audit('Twitch chat replies sent as', v === 'bot' ? 'the bot account' : 'the channel account');
}
