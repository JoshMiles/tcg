// The signed staff cookie (edge-safe: Web Crypto only, so the middleware can verify it without a database).
//
// It says "this Twitch account was a <role> when it was issued" and lasts one hour. The middleware uses it for coarse gating
// (which panel); every action and API route still re-checks the live staff list (lib/staff-guard.ts), so removing someone
// stops their changes at once and their page views within the hour. Signed with SESSION_SECRET (the same secret as the
// viewer session), so it can be read but not forged.

import type { StaffRole } from './staff-core';

export const STAFF_COOKIE = 'tcg_staff';
export const STAFF_TTL_S = 60 * 60;

export interface StaffToken { u: string; id: string; dn: string; role: StaffRole; exp: number }

const enc = new TextEncoder();
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

function secret(env: Record<string, string | undefined> = process.env): string | null {
  const s = env.SESSION_SECRET;
  return s && s.length >= 16 ? s : null;
}

async function hmac(payload: string, key: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(payload)));
}

const same = (a: Uint8Array, b: Uint8Array) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i]; return d === 0; };

export async function signStaffToken(data: Omit<StaffToken, 'exp'>, now = Date.now(), env?: Record<string, string | undefined>): Promise<string | null> {
  const key = secret(env);
  if (!key) return null;
  const token: StaffToken = { ...data, exp: Math.floor(now / 1000) + STAFF_TTL_S };
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
    if (!same(await hmac(parts[0], key), fromB64url(parts[1]))) return null;
    const t = JSON.parse(new TextDecoder().decode(fromB64url(parts[0]))) as StaffToken;
    if (typeof t.u !== 'string' || typeof t.id !== 'string' || typeof t.exp !== 'number' || t.exp < now / 1000) return null;
    if (t.role !== 'super' && t.role !== 'admin' && t.role !== 'mod') return null;
    return t;
  } catch {
    return null;
  }
}

export function staffCookieOptions(maxAge = STAFF_TTL_S) {
  return { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge };
}
