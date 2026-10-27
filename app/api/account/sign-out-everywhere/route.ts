import { NextRequest, NextResponse } from 'next/server';
import { requireViewer, serverError } from '@/lib/trade-api';
import { SESSION_COOKIE, bumpSessionGen } from '@/lib/session';
import { STAFF_COOKIE } from '@/lib/staff-token';
import { ACCESS_COOKIE } from '@/lib/access-token';

// Sign out everywhere: raises the viewer's session generation so every cookie issued so far is refused, then signs this browser out too.
export async function POST(req: NextRequest) {
  const viewer = await requireViewer(req);
  if ('response' in viewer) return viewer.response;
  try {
    await bumpSessionGen(viewer.session.username);
  } catch (e) {
    return serverError(e, 'sign-out-everywhere', 'Could not sign you out right now. Try again in a moment.');
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  res.cookies.delete(STAFF_COOKIE); // same as /auth/logout
  res.cookies.delete(ACCESS_COOKIE);
  return res;
}
