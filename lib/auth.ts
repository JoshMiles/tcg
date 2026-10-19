import { ADMIN_COOKIE_TTL_S, AUTH_COOKIE } from './admin-token';
import { hasStaffCapability } from './staff-guard';

/** Is the caller an admin? (Used by API routes; they answer 401 when it is false.) */
export async function isAuthenticated(): Promise<boolean> {
  return hasStaffCapability('admin');
}

/** The cookie the emergency password login sets. `value` comes from signAdminCookie (keyed by ADMIN_COOKIE_SECRET). */
export function adminCookieOptions(value: string) {
  return {
    name: AUTH_COOKIE,
    value,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: ADMIN_COOKIE_TTL_S,
  };
}
