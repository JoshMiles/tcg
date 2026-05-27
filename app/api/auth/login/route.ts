import { NextRequest, NextResponse } from 'next/server';
import { authCookieOptions } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const { password } = await req.json();
  if (password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(authCookieOptions());
  return res;
}
