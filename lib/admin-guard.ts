import { cookies } from 'next/headers';
import { AUTH_COOKIE, isValidAdminToken } from './admin-token';

/**
 * For server actions that must never run for a non-admin. Middleware already protects /admin pages, but a server action can
 * be invoked by id from outside its page, so anything powerful checks the admin cookie itself.
 */
export async function requireAdmin(): Promise<void> {
  if (!isValidAdminToken((await cookies()).get(AUTH_COOKIE)?.value)) throw new Error('Not authorised.');
}
