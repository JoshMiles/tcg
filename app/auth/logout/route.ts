import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, isSameOrigin } from '@/lib/session';

export const dynamic = 'force-dynamic';

// POST-only so a stray link or image can't log someone out.
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'Bad origin' }, { status: 403 });
  const res = NextResponse.redirect(new URL('/', req.url), 303);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
