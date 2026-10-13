import { NextRequest, NextResponse } from 'next/server';
import { authCookieOptions } from '@/lib/auth';
import { isPasswordLoginEnabled } from '@/lib/admin-token';

// The emergency admin password login (staff normally sign in with Twitch). Switched off by ADMIN_PASSWORD_LOGIN=off.
export async function POST(req: NextRequest) {
  if (!isPasswordLoginEnabled()) return NextResponse.json({ error: 'Password login is switched off. Sign in with Twitch.' }, { status: 403 });
  const { password } = await req.json().catch(() => ({}));
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || !process.env.ADMIN_SECRET || password !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(authCookieOptions());
  return res;
}
