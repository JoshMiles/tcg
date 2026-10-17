import { NextRequest, NextResponse } from 'next/server';
import { confirmEmail } from '@/lib/email';
import { SITE_URL } from '@/lib/site';

export const dynamic = 'force-dynamic';

// The link in the confirmation email. The signed token says who and which address; it needs no sign-in.
export async function GET(req: NextRequest) {
  const ok = await confirmEmail(req.nextUrl.searchParams.get('t') ?? '').catch(() => false);
  return NextResponse.redirect(`${SITE_URL}/email-status?s=${ok ? 'confirmed' : 'invalid'}`, 303);
}
