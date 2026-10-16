import { NextRequest, NextResponse } from 'next/server';
import { getSession, loginConfigured } from '@/lib/session';
import { getAccessSettings, tierFor } from '@/lib/access';
import { canEnterTier } from '@/lib/access-core';
import { ACCESS_COOKIE, accessCookieOptions, signAccessToken } from '@/lib/access-token';
import { safeReturnTo } from '@/lib/twitch-oauth';

export const dynamic = 'force-dynamic';

// Closed alpha / beta, step 2 after "Log in with Twitch": look the signed-in account up in the staff and tester lists and, if the current
// mode lets its tier in, issue the one-hour access cookie and go back to the page. The middleware sends signed-in visitors here when
// they have no cookie, an old one, or the settings changed since it was issued (that is how a removed tester loses access, and how a
// mode change reaches everyone). Anyone else is shown the closed page.
export async function GET(req: NextRequest) {
  const returnTo = safeReturnTo(req.nextUrl.searchParams.get('returnTo'), '/');
  const closed = (why: string) => {
    const res = NextResponse.redirect(new URL(`/closed?why=${why}`, req.url));
    res.cookies.set({ name: ACCESS_COOKIE, value: '', maxAge: 0, path: '/' });
    return res;
  };

  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL('/closed', req.url));
  if (!loginConfigured()) return closed('unavailable');

  const settings = await getAccessSettings();
  const tier = await tierFor(session);
  if (!tier || !canEnterTier(settings.mode, tier)) return closed('not-listed');

  const token = await signAccessToken({ login: session.username, tier, v: settings.v });
  if (!token) return closed('unavailable');
  const res = NextResponse.redirect(new URL(returnTo, req.url));
  res.cookies.set(ACCESS_COOKIE, token, accessCookieOptions());
  res.headers.set('Cache-Control', 'no-store');
  return res;
}
