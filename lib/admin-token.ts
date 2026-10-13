// Edge-safe (no next/headers) so middleware can import it.
//
// The ORIGINAL admin login: a password that sets a cookie holding ADMIN_SECRET. It is kept as an emergency way in (it counts as a
// super admin) now that staff sign in with Twitch (lib/staff-guard.ts). Set ADMIN_PASSWORD_LOGIN=off to switch it off for good.
export const AUTH_COOKIE = 'admin-auth';

/** Is the emergency password login on? It is unless ADMIN_PASSWORD_LOGIN is set to off / false / 0 / no. */
export function isPasswordLoginEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return !/^(off|false|0|no)$/i.test((env.ADMIN_PASSWORD_LOGIN ?? '').trim());
}

/** True only when ADMIN_SECRET is configured and the token matches it (fails closed when unset). */
export function isValidAdminToken(token: string | undefined): boolean {
  const secret = process.env.ADMIN_SECRET;
  return !!secret && token === secret;
}
