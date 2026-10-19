// Edge-safe (no next/headers, no database) so middleware can import it.
//
// The emergency admin login: a password that sets a signed cookie. It counts as a super admin (lib/staff-guard.ts).
// Staff normally sign in with Twitch. Set ADMIN_PASSWORD_LOGIN=off to switch the password off for good.
//
// The cookie is NOT derived from ADMIN_SECRET. That value used to be both the HMAC key and a query-string
// password on the legacy import, so a copy of the URL was enough to mint a permanent super-admin cookie.
// Signing uses ADMIN_COOKIE_SECRET only. The payload carries an expiry and a generation; a sign-out bumps
// the generation in KV (lib/admin-cookie.ts) so a copied cookie dies even before its expiry.
export const AUTH_COOKIE = 'admin-auth';
/** How long a password session lasts. Checked on the server, not only as a browser maxAge. */
export const ADMIN_COOKIE_TTL_S = 7 * 24 * 60 * 60;

const enc = new TextEncoder();

export interface AdminCookieClaims {
  v: 2;
  /** Unix seconds. */
  exp: number;
  iat: number;
  /** Random per login, so two cookies are not the same string. */
  id: string;
  /** Must match the server's generation (lib/admin-cookie.ts). */
  gen: number;
}

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

/**
 * The HMAC key for the emergency cookie. ADMIN_SECRET is deliberately not a fallback: a leaked copy of that
 * value must not be able to mint a cookie. Null when unset or shorter than 16 characters.
 */
export function adminCookieKey(env: Record<string, string | undefined> = process.env): string | null {
  const s = env.ADMIN_COOKIE_SECRET?.trim();
  return s && s.length >= 16 ? s : null;
}

/** KV key for the sign-in generation. Preview uses the fenced prefix so it cannot revoke production sessions. */
export function adminGenKey(env: Record<string, string | undefined> = process.env): string {
  if (env.VERCEL_ENV === 'preview') return 'sbx:preview:admin:auth-gen';
  return `admin:auth-gen:${env.VERCEL_ENV || 'development'}`;
}

/** A generation counter from KV, or null when it is missing or not a positive integer. */
export function parseAdminGen(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(n) && n >= 1 ? n : null;
}

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

async function hmac(payload: string, key: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(payload)));
}

const sameBytes = (a: Uint8Array, b: Uint8Array) => {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
};

function randomId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

/** A signed emergency-admin cookie, or null when the key is missing or too short. `gen` is the server's current generation. */
export async function signAdminCookie(key: string, gen: number, now = Date.now()): Promise<string | null> {
  if (!key || key.length < 16 || !Number.isSafeInteger(gen) || gen < 1) return null;
  const nowS = Math.floor(now / 1000);
  const claims: AdminCookieClaims = { v: 2, iat: nowS, exp: nowS + ADMIN_COOKIE_TTL_S, id: randomId(), gen };
  const payload = b64url(enc.encode(JSON.stringify(claims)));
  return `${payload}.${b64url(await hmac(payload, key))}`;
}

/** Claims when the signature matches `key` and the cookie has not expired. Does not check the generation. */
export async function readAdminCookie(token: string | undefined, key: string | null | undefined, now = Date.now()): Promise<AdminCookieClaims | null> {
  if (!key || key.length < 16 || !token) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  try {
    if (!sameBytes(await hmac(parts[0], key), fromB64url(parts[1]))) return null;
    const t = JSON.parse(new TextDecoder().decode(fromB64url(parts[0]))) as AdminCookieClaims;
    if (t.v !== 2 || typeof t.exp !== 'number' || typeof t.iat !== 'number' || typeof t.id !== 'string' || !t.id) return null;
    if (!Number.isSafeInteger(t.gen) || t.gen < 1) return null;
    if (t.exp < now / 1000) return null;
    return t;
  } catch {
    return null;
  }
}

/**
 * True only when the cookie is signed by `key`, unexpired, and stamped with `gen`.
 * Fails closed when the key or the cookie is missing. ADMIN_SECRET is not consulted.
 */
export async function isValidAdminToken(token: string | undefined, key: string | null | undefined, gen: number, now = Date.now()): Promise<boolean> {
  const claims = await readAdminCookie(token, key, now);
  return !!claims && claims.gen === gen;
}
