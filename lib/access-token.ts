// The signed access cookie `tcg_access` (edge-safe: Web Crypto only, so the middleware can verify it without a database).
//
// It says "this Twitch account was on the tester list (or staff) when it was issued", with the settings version `v` it was
// checked against, and lasts one hour. The middleware uses it for the coarse gate; the layouts and signed-in APIs re-check the live list
// (lib/access.ts), so a forged or stale cookie still gets nothing. Signed with its own key derived from SESSION_SECRET (lib/signing.ts), so a staff or session cookie is never an access cookie.

import type { AccessTier } from './access-core';
import { safeEqual, signingKey } from './signing';

export const ACCESS_COOKIE = 'tcg_access';
export const ACCESS_TTL_S = 60 * 60;

export interface AccessToken { login: string; tier: AccessTier; v: number; exp: number }

const enc = new TextEncoder();
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

const secret = (env?: Record<string, string | undefined>) => signingKey('access', env);

async function hmac(payload: string, key: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(payload)));
}

export async function signAccessToken(data: { login: string; tier: AccessTier; v: number }, now = Date.now(), env?: Record<string, string | undefined>): Promise<string | null> {
  const key = secret(env);
  if (!key) return null;
  const token: AccessToken = { ...data, exp: Math.floor(now / 1000) + ACCESS_TTL_S };
  const payload = b64url(enc.encode(JSON.stringify(token)));
  return `${payload}.${b64url(await hmac(payload, key))}`;
}

/** The token's contents if it is genuine and not expired, else null. */
export async function verifyAccessToken(raw: string | undefined, now = Date.now(), env?: Record<string, string | undefined>): Promise<AccessToken | null> {
  const key = secret(env);
  if (!key || !raw) return null;
  const parts = raw.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  try {
    if (!(await safeEqual(await hmac(parts[0], key), fromB64url(parts[1])))) return null;
    const t = JSON.parse(new TextDecoder().decode(fromB64url(parts[0]))) as AccessToken;
    if (typeof t.login !== 'string' || typeof t.v !== 'number' || typeof t.exp !== 'number' || t.exp < now / 1000) return null;
    if (t.tier !== 'alpha' && t.tier !== 'beta' && t.tier !== 'staff') return null;
    return t;
  } catch {
    return null;
  }
}

export function accessCookieOptions(maxAge = ACCESS_TTL_S) {
  return { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge };
}
