import { randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getStaff, hasStaffCapability } from '@/lib/staff-guard';
import { OAUTH_COOKIE, sessionCookieOptions } from '@/lib/session';
import { authorizeUrl } from '@/lib/twitch-oauth';
import { BOT_SCOPES } from '@/lib/twitch-channel-core';
import { channelConnectReady } from '@/lib/twitch-channel';

// Step 1 of "Connect bot account" (ROADMAP 58.6), admins only, like Connect Twitch channel (58.1): the state goes in the sign-in cookie with this admin's
// login and a `bot` marker, and the shared /auth/twitch/callback finishes it. force_verify makes Twitch ask which account to use, so the bot can be chosen
// while the channel account is signed in to Twitch. The callback refuses the channel's own account.
export async function GET(req: NextRequest) {
  const staff = (await hasStaffCapability('admin')) ? await getStaff() : null;
  if (!staff) return NextResponse.redirect(new URL('/admin', req.url));
  if (!channelConnectReady()) return NextResponse.redirect(new URL('/admin/stream?tab=connection&error=' + encodeURIComponent('the Twitch connection needs TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET and BACKUP_ENCRYPTION_KEY'), req.url));
  const state = randomBytes(24).toString('base64url');
  const url = new URL(authorizeUrl(state, BOT_SCOPES.join(' ')));
  url.searchParams.set('force_verify', 'true');
  const res = NextResponse.redirect(url);
  res.cookies.set(OAUTH_COOKIE, JSON.stringify({ state, bot: true, by: staff.login, returnTo: '/admin/stream?tab=connection' }), sessionCookieOptions(60 * 10));
  return res;
}
