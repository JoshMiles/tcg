import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE } from '@/lib/admin-token';
import { STAFF_COOKIE } from '@/lib/staff-token';

// Signs out of the admin / mod panels (both the Twitch staff cookie and the emergency password cookie). It leaves the viewer's
// ordinary website login alone.
export async function POST(req: NextRequest) {
  const res = NextResponse.redirect(new URL('/login', req.url), 303);
  res.cookies.set({ name: AUTH_COOKIE, value: '', maxAge: 0, path: '/' });
  res.cookies.set({ name: STAFF_COOKIE, value: '', maxAge: 0, path: '/' });
  return res;
}
