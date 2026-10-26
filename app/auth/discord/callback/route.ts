import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { DISCORD_OAUTH_COOKIE } from '../route';
import {
  isDiscordDmConfigured,
  exchangeDiscordCode,
  getDiscordLink,
  saveDiscordLink,
} from '@/lib/discord-user';
import { DISCORD_DEFAULT_KINDS } from '@/lib/discord-dm-core';
import { SITE_URL } from '@/lib/site';

function fail(req: NextRequest, reason: string) {
  const res = NextResponse.redirect(new URL(`/settings?discord_error=${reason}#discord`, req.url));
  res.cookies.delete(DISCORD_OAUTH_COOKIE);
  return res;
}

const sameString = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(new URL('/auth/twitch?returnTo=/settings', req.url));
  }

  if (!isDiscordDmConfigured()) return fail(req, 'unavailable');

  const params = req.nextUrl.searchParams;
  if (params.get('error')) return fail(req, params.get('error') === 'access_denied' ? 'denied' : 'failed');

  const code = params.get('code');
  const state = params.get('state');
  const cookieState = req.cookies.get(DISCORD_OAUTH_COOKIE)?.value;

  if (!code || !state || !cookieState) return fail(req, 'expired');
  if (!sameString(cookieState, state)) return fail(req, 'expired');

  const redirectUri = `${SITE_URL}/auth/discord/callback`;
  let discordUser;
  try {
    discordUser = await exchangeDiscordCode(code, redirectUri);
  } catch (e) {
    console.error('[auth] Discord link failed:', e instanceof Error ? e.message : e);
    return fail(req, 'failed');
  }

  const existingLink = await getDiscordLink(session.username);
  const saved = await saveDiscordLink(session.username, {
    id: discordUser.id,
    username: discordUser.username,
    avatar: discordUser.avatar ?? null,
    linkedAt: Date.now(),
    dmStatus: 'ok',
    kinds: existingLink?.kinds?.length ? existingLink.kinds : [...DISCORD_DEFAULT_KINDS],
  });
  if (!saved) return fail(req, 'in_use');

  const res = NextResponse.redirect(new URL('/settings?discord=linked#discord', req.url));
  res.cookies.delete(DISCORD_OAUTH_COOKIE);
  return res;
}
