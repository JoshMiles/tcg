import { randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getStaff, hasStaffCapability } from '@/lib/staff-guard';
import { OAUTH_COOKIE, sessionCookieOptions } from '@/lib/session';
import { authorizeUrl } from '@/lib/twitch-oauth';
import { CHANNEL_SCOPES } from '@/lib/twitch-channel-core';
import { channelConnectReady } from '@/lib/twitch-channel';

// Step 1 of "Connect Twitch channel" (ROADMAP 58.1), admins only. The state goes in the sign-in cookie together with this admin's login and a
// channel marker; the shared /auth/twitch/callback only accepts the code when Twitch sends the same state back to the same admin's browser.
// force_verify makes Twitch ask which account to connect, so a spare account can be chosen even while another one is signed in to Twitch.
export async function GET(req: NextRequest) {
  const staff = (await hasStaffCapability('admin')) ? await getStaff() : null;
  if (!staff) return NextResponse.redirect(new URL('/admin', req.url));
  if (!channelConnectReady()) return NextResponse.redirect(new URL('/admin/mixitup?tab=connection&error=' +encodeURIComponent('the Twitch connection needs TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET and BACKUP_ENCRYPTION_KEY'), req.url));
  const state = randomBytes(24).toString('base64url');
  const url = new URL(authorizeUrl(state, CHANNEL_SCOPES.join(' ')));
  url.searchParams.set('force_verify', 'true');
  const res = NextResponse.redirect(url);
  res.cookies.set(OAUTH_COOKIE, JSON.stringify({ state, channel: true, by: staff.login, returnTo: '/admin/mixitup?tab=connection' }), sessionCookieOptions(60 * 10));
  return res;
}
