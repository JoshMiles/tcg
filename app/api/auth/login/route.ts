import { NextRequest, NextResponse } from 'next/server';
import { ensureAdminGen } from '@/lib/admin-cookie';
import { adminCookieKey, isPasswordLoginEnabled, sameString, signAdminCookie } from '@/lib/admin-token';
import { adminCookieOptions } from '@/lib/auth';
import { kv } from '@/lib/db';

/** Wrong passwords allowed per address in one window before the login stops answering. */
const MAX_FAILS = 10;
const WINDOW_S = 15 * 60;

// The emergency admin password login (staff normally sign in with Twitch). Switched off by ADMIN_PASSWORD_LOGIN=off.
export async function POST(req: NextRequest) {
  if (!isPasswordLoginEnabled()) return NextResponse.json({ error: 'Password login is switched off. Sign in with Twitch.' }, { status: 403 });
  if (!adminCookieKey()) return NextResponse.json({ error: 'Emergency login is not configured.' }, { status: 503 });
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
  const failKey = `auth:login-fails:${ip}`;
  if ((Number(await kv.get(failKey)) || 0) >= MAX_FAILS) {
    return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 });
  }
  const { password } = await req.json().catch(() => ({}));
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || typeof password !== 'string' || !sameString(password, expected)) {
    const fails = await kv.incr(failKey);
    if (fails === 1) await kv.expire(failKey, WINDOW_S);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const key = adminCookieKey();
  const value = key ? await signAdminCookie(key, await ensureAdminGen()) : null;
  if (!value) return NextResponse.json({ error: 'Emergency login is not configured.' }, { status: 503 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(adminCookieOptions(value));
  return res;
}
