import { AUTH_COOKIE } from './admin-token';
import { hasStaffCapability } from './staff-guard';

/** Is the caller an admin? (Used by API routes; they answer 401 when it is false.) */
export async function isAuthenticated(): Promise<boolean> {
  return hasStaffCapability('admin');
}

/** The cookie the emergency password login sets (it holds ADMIN_SECRET). */
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
