import { NextRequest, NextResponse } from 'next/server';
import { bumpAdminGen } from '@/lib/admin-cookie';
import { AUTH_COOKIE } from '@/lib/admin-token';
import { STAFF_COOKIE } from '@/lib/staff-token';

// Signs out of the admin / mod panels (both the Twitch staff cookie and the emergency password cookie). It leaves the viewer's
// ordinary website login alone. When the emergency cookie is present, the server generation moves too, so a copy of that
// cookie stops working instead of living until its expiry.
export async function POST(req: NextRequest) {
  if (req.cookies.get(AUTH_COOKIE)?.value) await bumpAdminGen().catch(() => {});
  const res = NextResponse.redirect(new URL('/login', req.url), 303);
  res.cookies.set({ name: AUTH_COOKIE, value: '', maxAge: 0, path: '/' });
  res.cookies.set({ name: STAFF_COOKIE, value: '', maxAge: 0, path: '/' });
  return res;
}
