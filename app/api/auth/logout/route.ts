import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE } from '@/lib/admin-token';

export async function POST(req: NextRequest) {
  const res = NextResponse.redirect(new URL('/login', req.url));
  res.cookies.set({ name: AUTH_COOKIE, value: '', maxAge: 0, path: '/' });
  return res;
}
