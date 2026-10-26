import { NextResponse } from 'next/server';
import { SANDBOX_COOKIE } from '@/lib/db';
import { SESSION_COOKIE } from '@/lib/session';
import { safeReturnTo } from '@/lib/twitch-oauth';

// Leaves the sandbox this browser is in (and drops any sandbox test login). Deliberately public and harmless: all it does is
// clear two cookies, so anyone, including a viewer who somehow ended up in a sandbox, can get back to the real site.
export async function POST(req: Request) {
  const target = safeReturnTo(new URL(req.url).searchParams.get('to'), '/');
  const res = NextResponse.redirect(new URL(target, req.url), 303);
  res.cookies.delete(SANDBOX_COOKIE);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
