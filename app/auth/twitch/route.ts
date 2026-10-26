import { randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { OAUTH_COOKIE, loginConfigured, sessionCookieOptions } from '@/lib/session';
import { authorizeUrl, safeReturnTo } from '@/lib/twitch-oauth';
import { STAFF_OUT_COOKIE } from '@/lib/staff-token';

// Step 1 of "Log in with Twitch": remember a random `state` (and where to send the viewer afterwards) in a short-lived
// cookie, then hand off to Twitch. The callback only accepts a code if Twitch echoes this exact state back.
export async function GET(req: NextRequest) {
  if (!loginConfigured()) return NextResponse.redirect(new URL('/auth/error?reason=unavailable', req.url));

  const state = randomBytes(24).toString('base64url');
  const returnTo = safeReturnTo(req.nextUrl.searchParams.get('returnTo'));

  const res = NextResponse.redirect(authorizeUrl(state));
  res.cookies.set(OAUTH_COOKIE, JSON.stringify({ state, returnTo }), sessionCookieOptions(60 * 10));
  res.cookies.delete(STAFF_OUT_COOKIE); // a deliberate sign-in ends a panel Log out
  return res;
}
