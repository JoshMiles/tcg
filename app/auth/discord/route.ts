import { randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSession, sessionCookieOptions } from '@/lib/session';
import { isDiscordDmConfigured, getDiscordAuthUrl } from '@/lib/discord-user';
import { SITE_URL } from '@/lib/site';

export const dynamic = 'force-dynamic';

export const DISCORD_OAUTH_COOKIE = 'tcg_discord_oauth';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(new URL('/auth/twitch?returnTo=/settings', req.url));
  }

  if (!isDiscordDmConfigured()) {
    return NextResponse.redirect(new URL('/settings?discord_error=unavailable#discord', req.url));
  }

  const state = randomBytes(24).toString('base64url');
  const redirectUri = `${SITE_URL}/auth/discord/callback`;
  const authorizeUrl = getDiscordAuthUrl(state, redirectUri);

  const res = NextResponse.redirect(authorizeUrl);
  res.cookies.set(DISCORD_OAUTH_COOKIE, state, sessionCookieOptions(60 * 10)); // 10 minutes
  return res;
}
