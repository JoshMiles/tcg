import { NextRequest, NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  const token = req.cookies.get('admin-auth')?.value;
  if (token !== process.env.ADMIN_SECRET) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ['/admin/:path*'] };
