import { cookies } from 'next/headers';
import { AUTH_COOKIE, isValidAdminToken } from './admin-token';

export async function isAuthenticated(): Promise<boolean> {
  const store = await cookies();
  return isValidAdminToken(store.get(AUTH_COOKIE)?.value);
}

export function authCookieOptions() {
  return {
    name: AUTH_COOKIE,
    value: process.env.ADMIN_SECRET ?? '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 1 week
  };
}
