import { NextRequest, NextResponse } from 'next/server';
import { bumpAdminGen, currentAdminGen } from '@/lib/admin-cookie';
import { AUTH_COOKIE, adminCookieKey, isValidAdminToken } from '@/lib/admin-token';
import { STAFF_COOKIE, STAFF_OUT_COOKIE, STAFF_OUT_TTL_S, staffCookieOptions } from '@/lib/staff-token';

// Signs out of the admin / mod panels (both the Twitch staff cookie and the emergency password cookie). It leaves the viewer's
// ordinary website login alone, but sets a marker so that login no longer re-issues the staff cookie by itself: the next panel
// visit asks for "Log in with Twitch" again (/auth/staff, cleared by /auth/twitch). The sign-in page then offers signing out of
// the site too. A valid emergency cookie also moves the server generation, so a copy of it stops working before its expiry.
export async function POST(req: NextRequest) {
  const emergency = req.cookies.get(AUTH_COOKIE)?.value;
  if (emergency) {
    const gen = await currentAdminGen().catch(() => null);
    if (gen !== null && await isValidAdminToken(emergency, adminCookieKey(), gen)) await bumpAdminGen().catch(() => {});
  }
  const res = NextResponse.redirect(new URL('/login?out=1', req.url), 303);
  res.cookies.set({ name: AUTH_COOKIE, value: '', maxAge: 0, path: '/' });
  res.cookies.set({ name: STAFF_COOKIE, value: '', maxAge: 0, path: '/' });
  res.cookies.set(STAFF_OUT_COOKIE, '1', staffCookieOptions(STAFF_OUT_TTL_S));
  return res;
}
