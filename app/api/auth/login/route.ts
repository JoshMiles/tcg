import { NextRequest, NextResponse } from 'next/server';
import { ensureAdminGen, recordEmergencyLogin } from '@/lib/admin-cookie';
import { adminCookieKey, isPasswordLoginEnabled, signAdminCookie } from '@/lib/admin-token';
import { safeEqual } from '@/lib/signing';
import { adminCookieOptions } from '@/lib/auth';
import { clientIp, loginLocked, recordLoginFail, MAX_FAILS, MAX_FAILS_PER_HOUR } from '@/lib/login-limit';
import { notifyAdminLog } from '@/lib/discord';
import { runInSandbox } from '@/lib/db';

// The admin log must hear of these even when the request carries a sandbox cookie or a junk sandbox header, so the post is pinned to production.
const tellAdminLog = (entry: Parameters<typeof notifyAdminLog>[0]) => runInSandbox(null, () => notifyAdminLog(entry));

// The emergency admin password login (staff normally sign in with Twitch). Switched off by ADMIN_PASSWORD_LOGIN=off.
export async function POST(req: NextRequest) {
  if (!isPasswordLoginEnabled()) return NextResponse.json({ error: 'Password login is switched off. Sign in with Twitch.' }, { status: 403 });
  if (!adminCookieKey()) return NextResponse.json({ error: 'Emergency login is not configured.' }, { status: 503 });
  const ip = clientIp(req.headers);
  if (await loginLocked(ip)) {
    return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 });
  }
  const { password } = await req.json().catch(() => ({}));
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || typeof password !== 'string' || !(await safeEqual(password, expected))) {
    const locked = await recordLoginFail(ip);
    if (locked) await tellAdminLog({ action: 'Emergency password login locked', detail: locked === 'site' ? `${MAX_FAILS_PER_HOUR} wrong passwords in an hour: the password login is paused until the hour ends` : `${MAX_FAILS} wrong passwords from one address: that address is locked for a while` });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const key = adminCookieKey();
  const value = key ? await signAdminCookie(key, await ensureAdminGen()) : null;
  if (!value) return NextResponse.json({ error: 'Emergency login is not configured.' }, { status: 503 });
  await recordEmergencyLogin();
  await tellAdminLog({ action: 'Emergency password login', detail: 'Signed in with the emergency password', by: 'password' });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(adminCookieOptions(value));
  return res;
}
