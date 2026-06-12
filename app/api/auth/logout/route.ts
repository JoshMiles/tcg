import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const res = NextResponse.redirect(new URL('/login', req.url));
  res.cookies.set({ name: 'admin-auth', value: '', maxAge: 0, path: '/' });
  return res;
}
