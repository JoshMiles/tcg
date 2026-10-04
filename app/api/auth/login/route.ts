import { NextRequest, NextResponse } from 'next/server';
import { authCookieOptions } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const { password } = await req.json().catch(() => ({}));
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || !process.env.ADMIN_SECRET || password !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(authCookieOptions());
  return res;
}
