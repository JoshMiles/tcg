import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { OAUTH_COOKIE, SESSION_COOKIE, currentSessionGen, loginConfigured, sessionCookieOptions, signSession } from '@/lib/session';
import { profileFromCode, safeReturnTo } from '@/lib/twitch-oauth';
import { saveUserProfile, getUserProfile } from '@/lib/kv';
import { bindAccount } from '@/lib/account-bind';
import { STAFF_COOKIE } from '@/lib/staff-token';
import { ACCESS_COOKIE } from '@/lib/access-token';
import { getStaff } from '@/lib/staff-guard';
import { roleCan } from '@/lib/staff-core';
import { channelStateOk, connectChannel } from '@/lib/twitch-channel';

function fail(req: NextRequest, reason: string) {
  const res = NextResponse.redirect(new URL(`/auth/error?reason=${reason}`, req.url));
  res.cookies.delete(OAUTH_COOKIE);
  return res;
}

/** The OAuth return of an admin's channel connection: only that admin's own state cookie counts, and no viewer session is made. */
async function channelReturn(req: NextRequest, code: string, state: string, cookie: string) {
  const back = (error?: string) => {
    const res = NextResponse.redirect(new URL(`/admin/mixitup?tab=connection${error ? `&error=${encodeURIComponent(error)}` : ''}`, req.url));
    res.cookies.delete(OAUTH_COOKIE);
    return res;
  };
  const staff = await getStaff();
  if (!staff || !roleCan(staff.role, 'admin')) return back('only an admin can connect the Twitch channel');
  if (!channelStateOk(cookie, state, staff.login)) return back('the Twitch sign-in expired, try again');
  const r = await connectChannel(code, staff.login);
  return back(r.ok ? undefined : r.reason === 'scopes' ? 'Twitch did not grant every permission, connect again and allow them all' : 'Twitch would not connect the channel, try again');
}

const sameString =(a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

// Step 2: Twitch sends the viewer back here with ?code=…&state=…. We check the state matches the one we set, trade the
// code for the viewer's public profile, make sure they have a profile record, and start a session.
export async function GET(req: NextRequest) {
  if (!loginConfigured()) return fail(req, 'unavailable');

  const params = req.nextUrl.searchParams;
  if (params.get('error')) return fail(req, params.get('error') === 'access_denied' ? 'denied' : 'failed');

  const code = params.get('code');
  const state = params.get('state');
  const cookie = req.cookies.get(OAUTH_COOKIE)?.value;
  if (!code || !state || !cookie) return fail(req, 'expired');

  let expected: { state?: string; returnTo?: string; channel?: boolean };
  try { expected = JSON.parse(cookie); } catch { return fail(req, 'expired'); }
  if (expected.channel) return channelReturn(req, code, state, cookie); // "Connect Twitch channel" (58.1): the same redirect address, a different job
  if (typeof expected.state !== 'string' || !sameString(expected.state, state)) return fail(req, 'expired');

  let profile;
  try {
    profile = await profileFromCode(code);
  } catch (e) {
    console.error('[auth] Twitch login failed:', e instanceof Error ? e.message : e);
    return fail(req, 'failed');
  }

  // Same record the Twitch Extension creates, so the website and the panel share one identity.
  await bindAccount(profile.login, profile.id);
  const existing = await getUserProfile(profile.login);
  if (existing && existing.displayName === existing.username && profile.displayName !== profile.login) {
    await saveUserProfile({ ...existing, displayName: profile.displayName }); // nicer capitalisation, only if never customised
  }

  const token = signSession({ username: profile.login, twitchId: profile.id, displayName: profile.displayName, gen: await currentSessionGen(profile.login) });
  if (!token) return fail(req, 'unavailable');

  const res = NextResponse.redirect(new URL(safeReturnTo(expected.returnTo), req.url));
  res.cookies.delete(OAUTH_COOKIE);
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  // A staff cookie belongs to whoever was signed in before; a fresh Twitch sign-in must earn its own (via /auth/staff).
  res.cookies.delete(STAFF_COOKIE);
  // Likewise the closed-site pass, which names the viewer it was issued to.
  res.cookies.delete(ACCESS_COOKIE);
  return res;
}
