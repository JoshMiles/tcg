// The signed staff cookie (edge-safe: Web Crypto only, so the middleware can verify it without a database).
//
// It says "this Twitch account was a <role> when it was issued" and lasts one hour; staff guard calls slide it forward (renewStaffToken)
// until 12 hours after the first issue (`iat`), after which only a real sign-in through /auth/staff gives a new one. The middleware uses it for coarse gating
// (which panel); every action and API route still re-checks the live staff list (lib/staff-guard.ts), so removing someone
// stops their changes at once and their page views within the hour. Signed with its own key derived from SESSION_SECRET
// (lib/signing.ts, not the viewer session's key), so it can be read but not forged.

import type { StaffRole } from './staff-core';
import { safeEqual, signingKey } from './signing';

export const STAFF_COOKIE = 'tcg_staff';
/** Set by the panel Log out: until the next deliberate "Log in with Twitch", the viewer session no longer re-issues the staff cookie. */
export const STAFF_OUT_COOKIE = 'tcg_staff_out';
export const STAFF_OUT_TTL_S = 12 * 60 * 60;
export const STAFF_TTL_S = 60 * 60;
/** Renew when less than this is left. */
export const STAFF_RENEW_BELOW_S = 30 * 60;
/** A session cannot be renewed past this long after its first issue. */
export const STAFF_MAX_SESSION_S = 12 * 60 * 60;

export interface StaffToken { u: string; id: string; dn: string; role: StaffRole; exp: number; iat?: number }

const enc = new TextEncoder();
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

const secret = (env?: Record<string, string | undefined>) => signingKey('staff', env);

async function hmac(payload: string, key: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(payload)));
}

export async function signStaffToken(data: Omit<StaffToken, 'exp' | 'iat'> & { iat?: number }, now = Date.now(), env?: Record<string, string | undefined>): Promise<string | null> {
  const key = secret(env);
  if (!key) return null;
  const nowS = Math.floor(now / 1000);
  const token: StaffToken = { ...data, iat: data.iat ?? nowS, exp: nowS + STAFF_TTL_S };
  const payload = b64url(enc.encode(JSON.stringify(token)));
  return `${payload}.${b64url(await hmac(payload, key))}`;
}

/** The token's contents if it is genuine and not expired, else null. */
export async function verifyStaffToken(raw: string | undefined, now = Date.now(), env?: Record<string, string | undefined>): Promise<StaffToken | null> {
  const key = secret(env);
  if (!key || !raw) return null;
  const parts = raw.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  try {
    if (!(await safeEqual(await hmac(parts[0], key), fromB64url(parts[1])))) return null;
    const t = JSON.parse(new TextDecoder().decode(fromB64url(parts[0]))) as StaffToken;
    if (typeof t.u !== 'string' || typeof t.id !== 'string' || typeof t.exp !== 'number' || t.exp < now / 1000) return null;
    if (t.role !== 'super' && t.role !== 'admin' && t.role !== 'mod') return null;
    return t;
  } catch {
    return null;
  }
}

/** True when this token should be re-issued now: under 30 minutes left and still inside the 12-hour cap (older tokens without `iat` count their first issue as exp minus one hour). */
export function shouldRenewStaffToken(t: StaffToken, now = Date.now()): boolean {
  const nowS = now / 1000;
  const iat = typeof t.iat === 'number' ? t.iat : t.exp - STAFF_TTL_S;
  return t.exp - nowS < STAFF_RENEW_BELOW_S && nowS - iat < STAFF_MAX_SESSION_S;
}

/** A fresh cookie value for a token that is due for renewal (same first-issue time, the live role), else null. */
export async function renewStaffToken(t: StaffToken, role: StaffRole, now = Date.now(), env?: Record<string, string | undefined>): Promise<string | null> {
  if (!shouldRenewStaffToken(t, now)) return null;
  return signStaffToken({ u: t.u, id: t.id, dn: t.dn, role, iat: typeof t.iat === 'number' ? t.iat : t.exp - STAFF_TTL_S }, now, env);
}

export function staffCookieOptions(maxAge = STAFF_TTL_S) {
  return { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge };
}
