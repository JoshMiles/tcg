import { NextResponse } from 'next/server';
import { SANDBOX_COOKIE } from '@/lib/db';
import { SESSION_COOKIE } from '@/lib/session';

export const dynamic = 'force-dynamic';

// Leaves the sandbox this browser is in (and drops any sandbox test login). Deliberately public and harmless: all it does is
// clear two cookies, so anyone, including a viewer who somehow ended up in a sandbox, can get back to the real site.
export async function POST(req: Request) {
  const to = new URL(req.url).searchParams.get('to') ?? '/';
  const target = to.startsWith('/') && !to.startsWith('//') ? to : '/';
  const res = NextResponse.redirect(new URL(target, req.url), 303);
  res.cookies.delete(SANDBOX_COOKIE);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
