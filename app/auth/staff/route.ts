import { NextRequest, NextResponse } from 'next/server';
import { getSession, loginConfigured } from '@/lib/session';
import { getStaffRecord, touchStaffLogin } from '@/lib/staff';
import { resolveRole, staffReturnTo } from '@/lib/staff-core';
import { STAFF_COOKIE, signStaffToken, staffCookieOptions } from '@/lib/staff-token';

// Staff sign-in, step 2 (step 1 is the ordinary "Log in with Twitch"): look the signed-in Twitch account up in the staff list and,
// if it has a role, issue the one-hour staff cookie, then go to the panel. The middleware also sends people here when their
// staff cookie has run out, so the cookie renews itself while the role stays valid and a removed person is turned away.
export async function GET(req: NextRequest) {
  const returnTo = req.nextUrl.searchParams.get('returnTo');
  // ?silent=1 is for the activity feed: the same renewal from the viewer session, but a small JSON answer instead of redirects.
  const silent = req.nextUrl.searchParams.get('silent') === '1';
  const deny = (error: string) => NextResponse.json({ ok: false, error }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  const session = await getSession();
  if (silent && (!session || session.sandbox)) return deny('no-session');
  if (!session) {
    if (!loginConfigured()) return NextResponse.redirect(new URL('/login?error=unavailable', req.url));
    const here = staffReturnTo(returnTo, 'admin'); // only ever an /admin or /mod path
    return NextResponse.redirect(new URL(`/auth/twitch?returnTo=${encodeURIComponent(here)}`, req.url));
  }
  if (session.sandbox) return NextResponse.redirect(new URL('/login?error=not-staff', req.url)); // a sandbox test login is never staff

  const role = resolveRole({ login: session.username, twitchId: session.twitchId }, await getStaffRecord(session.username));
  if (!role) {
    if (silent) { const r = deny('not-staff'); r.cookies.set({ name: STAFF_COOKIE, value: '', maxAge: 0, path: '/' }); return r; }
    const res = NextResponse.redirect(new URL('/login?error=not-staff', req.url));
    res.cookies.set({ name: STAFF_COOKIE, value: '', maxAge: 0, path: '/' });
    return res;
  }

  const token = await signStaffToken({ u: session.username, id: session.twitchId, dn: session.displayName, role });
  if (!token) return silent ? deny('unavailable') : NextResponse.redirect(new URL('/login?error=unavailable', req.url));
  if (role !== 'super') await touchStaffLogin(session.username, session.twitchId, session.displayName);

  if (silent) {
    const done = NextResponse.json({ ok: true, role }, { headers: { 'Cache-Control': 'no-store' } });
    done.cookies.set(STAFF_COOKIE, token, staffCookieOptions());
    return done;
  }

  const res = NextResponse.redirect(new URL(staffReturnTo(returnTo, role), req.url));
  res.cookies.set(STAFF_COOKIE, token, staffCookieOptions());
  return res;
}
