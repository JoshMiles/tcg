import { cookies } from 'next/headers';

const COOKIE = 'admin-auth';

export async function isAuthenticated(): Promise<boolean> {
  const store = await cookies();
  return store.get(COOKIE)?.value === process.env.ADMIN_SECRET;
}

export function authCookieOptions() {
  return {
    name: COOKIE,
    value: process.env.ADMIN_SECRET ?? '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 1 week
  };
}
