import { after } from 'next/server';
import { kv, inSandbox } from './db';
import { getUserSettings } from './user-settings-store';
import { wantsNotice } from './user-settings';
import { SITE_URL } from './site';
import {
  type DiscordDmStatus,
  type DiscordLink,
  type DiscordDmPayload,
  buildDiscordDmPayload,
  discordWants,
  sanitizeDiscordKinds,
  sanitizeDiscordLink,
} from './discord-dm-core';
import type { PushKind } from './push-core';
import type { Notice } from './trade-notice-core';

// Discord DM alerts: account linking, OAuth flow, and bot DM dispatching.
// Token exchange immediately revokes the access token so only the user ID is kept.
// KV layout:
//   user:<u>:discord -> DiscordLink
//   discord:user:<discordId> -> lowercase username

const discordUserKey = (u: string) => `user:${u.toLowerCase()}:discord`;
const discordIdKey = (discordId: string) => `discord:user:${discordId}`;

export const isDiscordDmConfigured = (): boolean =>
  Boolean(
    (process.env.DISCORD_CLIENT_ID ?? '').trim() &&
      (process.env.DISCORD_CLIENT_SECRET ?? '').trim() &&
      (process.env.DISCORD_BOT_TOKEN ?? '').trim(),
  );

export function getDiscordAuthUrl(state: string, redirectUri: string): string {
  const clientId = (process.env.DISCORD_CLIENT_ID ?? '').trim();
  const url = new URL('https://discord.com/oauth2/authorize');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'identify');
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  return url.toString();
}

export async function exchangeDiscordCode(
  code: string,
  redirectUri: string,
): Promise<{ id: string; username: string; avatar?: string | null }> {
  const apiBase = (process.env.DISCORD_API_BASE ?? 'https://discord.com/api/v10').replace(/\/+$/, '');
  const clientId = (process.env.DISCORD_CLIENT_ID ?? '').trim();
  const clientSecret = (process.env.DISCORD_CLIENT_SECRET ?? '').trim();

  const tokenRes = await fetch(`${apiBase}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text().catch(() => '');
    throw new Error(`Discord token exchange failed (${tokenRes.status}): ${err}`);
  }

  const tokenData = (await tokenRes.json()) as { access_token: string; token_type: string };
  const accessToken = tokenData.access_token;

  let userObj: { id: string; username: string; global_name?: string | null; avatar?: string | null };
  try {
    const userRes = await fetch(`${apiBase}/users/@me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!userRes.ok) {
      throw new Error(`Failed to fetch Discord user (${userRes.status})`);
    }
    userObj = await userRes.json();
  } finally {
    // Revoke access token immediately. We never store it.
    await fetch(`${apiBase}/oauth2/token/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        token: accessToken,
      }),
    }).catch(() => null);
  }

  return {
    id: userObj.id,
    username: userObj.global_name || userObj.username,
    avatar: userObj.avatar ?? null,
  };
}

async function discordApiFetch(url: string, init: RequestInit, retried = false): Promise<Response> {
  const res = await fetch(url, init);
  if (res.status === 429 && !retried) {
    let waitMs = 1000;
    try {
      const data = await res.clone().json();
      if (typeof data.retry_after === 'number') {
        waitMs = Math.min(3000, Math.max(100, Math.ceil(data.retry_after * 1000)));
      }
    } catch {
      const header = res.headers.get('Retry-After');
      if (header) waitMs = Math.min(3000, Math.max(100, Math.ceil(Number(header) * 1000)));
    }
    await new Promise(r => setTimeout(r, waitMs));
    return discordApiFetch(url, init, true);
  }
  return res;
}

export async function sendDiscordDm(
  discordUserId: string,
  payload: DiscordDmPayload,
): Promise<{ ok: boolean; status?: number; code?: number }> {
  const apiBase = (process.env.DISCORD_API_BASE ?? 'https://discord.com/api/v10').replace(/\/+$/, '');
  const botToken = (process.env.DISCORD_BOT_TOKEN ?? '').trim();
  if (!botToken) return { ok: false, status: 500 };

  // 1. Create DM channel
  const channelRes = await discordApiFetch(`${apiBase}/users/@me/channels`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ recipient_id: discordUserId }),
  });

  if (!channelRes.ok) {
    const body = (await channelRes.json().catch(() => ({}))) as { code?: number };
    return { ok: false, status: channelRes.status, code: body.code };
  }
  const channel = (await channelRes.json()) as { id: string };

  // 2. Post message into DM channel
  const msgRes = await discordApiFetch(`${apiBase}/channels/${channel.id}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!msgRes.ok) {
    const body = (await msgRes.json().catch(() => ({}))) as { code?: number };
    return { ok: false, status: msgRes.status, code: body.code };
  }

  return { ok: true, status: msgRes.status };
}

export async function getDiscordLink(username: string): Promise<DiscordLink | null> {
  return sanitizeDiscordLink(await kv.get(discordUserKey(username)).catch(() => null));
}

export async function getTwitchUserByDiscordId(discordId: string): Promise<string | null> {
  const u = await kv.get<string>(discordIdKey(discordId)).catch(() => null);
  return typeof u === 'string' && u.trim() ? u.trim().toLowerCase() : null;
}

export async function saveDiscordLink(username: string, link: DiscordLink): Promise<void> {
  const u = username.toLowerCase();
  await kv.set(discordUserKey(u), link);
  await kv.set(discordIdKey(link.id), u);
}

export async function unlinkDiscord(username: string): Promise<void> {
  const u = username.toLowerCase();
  const existing = await getDiscordLink(u);
  if (existing) {
    await kv.del(discordIdKey(existing.id));
  }
  await kv.del(discordUserKey(u));
}

export async function updateDiscordKinds(username: string, kinds: PushKind[]): Promise<DiscordLink | null> {
  const u = username.toLowerCase();
  const existing = await getDiscordLink(u);
  if (!existing) return null;
  const updated: DiscordLink = { ...existing, kinds: sanitizeDiscordKinds(kinds) };
  await kv.set(discordUserKey(u), updated);
  return updated;
}

export async function setDiscordDmStatus(username: string, status: DiscordDmStatus): Promise<void> {
  const u = username.toLowerCase();
  const existing = await getDiscordLink(u);
  if (!existing || existing.dmStatus === status) return;
  const updated: DiscordLink = { ...existing, dmStatus: status };
  await kv.set(discordUserKey(u), updated);
}

export async function discordNotice(user: string, notice: Notice): Promise<void> {
  try {
    if (!isDiscordDmConfigured() || (await inSandbox())) return;
    const [settings, link] = await Promise.all([getUserSettings(user), getDiscordLink(user)]);
    if (!link || !wantsNotice(settings, notice.kind) || !discordWants(link, notice.kind)) return;

    const run = async () => {
      const payload = buildDiscordDmPayload(notice, SITE_URL);
      const res = await sendDiscordDm(link.id, payload);
      if (res.code === 50007) {
        await setDiscordDmStatus(user, 'closed');
      } else if (res.ok && link.dmStatus === 'closed') {
        await setDiscordDmStatus(user, 'ok');
      }
    };

    try {
      after(run);
    } catch {
      await run();
    }
  } catch {
    /* best effort */
  }
}

export async function sendTestDiscordDm(user: string): Promise<{ ok: boolean; error?: string }> {
  if (await inSandbox()) return { ok: false, error: 'Disabled in sandboxes' };
  const link = await getDiscordLink(user);
  if (!link) return { ok: false, error: 'No Discord account linked' };
  const payload: DiscordDmPayload = {
    embeds: [
      {
        title: 'Test message',
        description: 'Discord alerts work. You will get a DM here when someone trades with you.',
        url: `${SITE_URL}/settings#discord`,
        color: 0xeab308,
        footer: { text: 'The Cheesy TCG' },
        timestamp: new Date().toISOString(),
      },
    ],
  };
  const res = await sendDiscordDm(link.id, payload);
  if (res.code === 50007) {
    await setDiscordDmStatus(user, 'closed');
    return { ok: false, error: 'closed' };
  }
  if (!res.ok) {
    return { ok: false, error: `Discord answered status ${res.status ?? 500}` };
  }
  if (link.dmStatus === 'closed') {
    await setDiscordDmStatus(user, 'ok');
  }
  return { ok: true };
}
