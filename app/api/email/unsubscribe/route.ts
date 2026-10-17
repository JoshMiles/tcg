import { NextRequest, NextResponse } from 'next/server';
import { readUnsubscribeToken, switchEmailOff } from '@/lib/email';
import { SITE_URL } from '@/lib/site';

export const dynamic = 'force-dynamic';

// The unsubscribe link in every email. GET is the link; POST is the one-click form mail programs send (List-Unsubscribe-Post).
// Both switch email off for the viewer in the signed token, no sign-in needed. It never switches anything on.
async function off(req: NextRequest): Promise<boolean> {
  const user = readUnsubscribeToken(req.nextUrl.searchParams.get('t') ?? '');
  if (!user) return false;
  await switchEmailOff(user, 'unsubscribed').catch(() => false);
  return true;
}

export async function GET(req: NextRequest) {
  const ok = await off(req);
  return NextResponse.redirect(`${SITE_URL}/email-status?s=${ok ? 'unsubscribed' : 'invalid'}`, 303);
}

export async function POST(req: NextRequest) {
  return (await off(req)) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Invalid link' }, { status: 400 });
}
