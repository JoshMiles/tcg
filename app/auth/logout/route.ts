import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, isSameOrigin } from '@/lib/session';
import { STAFF_COOKIE } from '@/lib/staff-token';
import { ACCESS_COOKIE } from '@/lib/access-token';

export const dynamic = 'force-dynamic';

// POST-only so a stray link or image can't log someone out.
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'Bad origin' }, { status: 403 });
  const res = NextResponse.redirect(new URL('/', req.url), 303);
  res.cookies.delete(SESSION_COOKIE);
  res.cookies.delete(STAFF_COOKIE); // signing out of the website signs out of the staff panels too
  res.cookies.delete(ACCESS_COOKIE);
  return res;
}
