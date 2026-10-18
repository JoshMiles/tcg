// Edge-safe (no next/headers) so middleware can import it.
//
// The ORIGINAL admin login: a password that sets a cookie derived from ADMIN_SECRET. It is kept as an emergency way in (it counts as a
// super admin) now that staff sign in with Twitch (lib/staff-guard.ts). Set ADMIN_PASSWORD_LOGIN=off to switch it off for good.
export const AUTH_COOKIE = 'admin-auth';

const enc = new TextEncoder();

/** Is the emergency password login on? It is unless ADMIN_PASSWORD_LOGIN is set to off / false / 0 / no. */
export function isPasswordLoginEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return !/^(off|false|0|no)$/i.test((env.ADMIN_PASSWORD_LOGIN ?? '').trim());
}

/** Compares two strings without stopping at the first difference, so the time taken says nothing about the secret. */
export function sameString(a: string, b: string): boolean {
  const x = enc.encode(a), y = enc.encode(b);
  if (x.length !== y.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

/** The cookie value: an HMAC of a fixed label keyed by ADMIN_SECRET, so the cookie never holds the secret itself. Null when unset. */
export async function adminCookieValue(env: Record<string, string | undefined> = process.env): Promise<string | null> {
  const secret = env.ADMIN_SECRET;
  if (!secret) return null;
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode('admin-auth:v1')));
  return Array.from(sig, b => b.toString(16).padStart(2, '0')).join('');
}

/** True only when ADMIN_SECRET is configured and the token matches the cookie value it gives (fails closed when unset). */
export async function isValidAdminToken(token: string | undefined, env: Record<string, string | undefined> = process.env): Promise<boolean> {
  const expected = await adminCookieValue(env);
  return !!expected && !!token && sameString(token, expected);
}
