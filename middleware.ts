import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE, isValidAdminToken } from '@/lib/admin-token';

export function middleware(req: NextRequest) {
  if (!isValidAdminToken(req.cookies.get(AUTH_COOKIE)?.value)) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ['/admin/:path*'] };
