import { createHmac, timingSafeEqual } from 'crypto';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { connection } from 'next/server';
import { currentSandboxId, kv } from './db';
import { isTwitchId } from './staff-core';
import { signingKey } from './signing';

// Website login session: a small signed cookie, no database. The payload is signed with a key derived from SESSION_SECRET (HMAC-SHA256, lib/signing.ts),
// so it can be read but not forged or edited. Logging out clears the cookie; otherwise it expires after 30 days.
// Never put anything secret in it. It is readable by the browser's owner.

export const SESSION_COOKIE = 'tcg_session';
/** Short-lived cookie holding the OAuth `state` (+ return path) between leaving for Twitch and coming back. */
export const OAUTH_COOKIE = 'tcg_oauth';
const MAX_AGE_S = 60 * 60 * 24 * 30;

export interface Session {
  /** Lowercase Twitch login. The key collections and profiles are stored under. */
  username: string;
  twitchId: string;
  displayName: string;
  exp: number; // unix seconds
  /** Set for a sandbox test login: only valid while the request is in that same sandbox. */
  sandbox?: string;
}

const secret = () => signingKey('session');

/** True when website login can work (a usable SESSION_SECRET plus Twitch app credentials). */
export function loginConfigured(): boolean {
  return !!secret() && !!process.env.TWITCH_CLIENT_ID && !!process.env.TWITCH_CLIENT_SECRET;
}

const sign = (payload: string, key: string) => createHmac('sha256', key).update(payload).digest('base64url');

export function signSession(data: Omit<Session, 'exp'>): string | null {
  const key = secret();
  if (!key) return null;
  const session: Session = { ...data, exp: Math.floor(Date.now() / 1000) + MAX_AGE_S };
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url');
  return `${payload}.${sign(payload, key)}`;
}

export function verifySession(token: string | undefined): Session | null {
  const key = secret();
  if (!key || !token) return null;
  const [payload, sig, extra] = token.split('.');
  if (!payload || !sig || extra !== undefined) return null;

  const expected = Buffer.from(sign(payload, key));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  try {
    const s = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Session;
    if (typeof s.username !== 'string' || !s.username || typeof s.exp !== 'number' || s.exp < Date.now() / 1000) return null;
    return s;
  } catch {
    return null;
  }
}

/** The Twitch ID stored on a login's profile; one read per request however many callers ask. Unreadable counts as no ID (a KV hiccup must not sign everyone out). */
const storedTwitchId = cache(async (username: string): Promise<unknown> => {
  try { return (await kv.get<{ twitchId?: unknown }>(`user:${username}:profile`))?.twitchId; } catch { return undefined; }
});

/**
 * The logged-in viewer for this request, or null. A cookie is only good while the profile it names still belongs to the same Twitch account:
 * if the login was moved aside or taken over (lib/account-move.ts) the stored ID differs and the cookie is ignored until a fresh sign-in replaces it
 * (a server component cannot clear it). A session or profile without a usable ID, and sandbox logins, are not checked.
 */
export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  await connection(); // verifySession reads the clock; a prerender must stop at the cookie read
  const session = verifySession(jar.get(SESSION_COOKIE)?.value);
  // A sandbox test login is useless (and ignored) outside its sandbox, so it can't be mistaken for a real viewer on production.
  if (session?.sandbox && (await currentSandboxId()) !== session.sandbox) return null;
  if (session && !session.sandbox && isTwitchId(session.twitchId)) {
    const stored = await storedTwitchId(session.username);
    if (isTwitchId(stored) && stored !== session.twitchId) return null;
  }
  return session;
}

export function sessionCookieOptions(maxAge = MAX_AGE_S) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  };
}

/**
 * Cross-site request guard for state-changing endpoints: the Origin (or Referer) must be this site. SameSite=Lax
 * on the cookie already blocks cross-site POSTs; this is a second layer for browsers that send an Origin.
 */
export function isSameOrigin(req: Request): boolean {
  const host = req.headers.get('host');
  const origin = req.headers.get('origin') ?? req.headers.get('referer');
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
