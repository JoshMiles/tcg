// Edge-safe (no next/headers) so middleware can import it.
export const AUTH_COOKIE = 'admin-auth';

/** True only when ADMIN_SECRET is configured and the token matches it (fails closed when unset). */
export function isValidAdminToken(token: string | undefined): boolean {
  const secret = process.env.ADMIN_SECRET;
  return !!secret && token === secret;
}
