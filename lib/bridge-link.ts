// Sign in to TCG Bridge with Twitch, the site half (ROADMAP 58.0). The app asks for a link request, opens the site's /bridge/link page in the browser,
// the streamer signs in with the site's Twitch login and clicks Allow, and the app (polling with its secret) is handed a bridge token once. No
// Twitch token ever reaches the app. Key `bridge:link:<id>` (10 minutes; 2 minutes once decided) holds the request; `bridge:link:<id>:claim` is
// the NX claim that lets exactly one Allow or Deny act. The secret is stored as a hash; the token only until it is picked up.
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { kv } from './db';
import { mintToken } from './bridge';
import { LINK_TTL_S, cleanName, newLinkCode } from './bridge-core';
import { SITE_URL } from './site';
import type { StaffRole } from './staff-core';

const linkKey = (id: string) => `bridge:link:${id}`;
const claimKey = (id: string) => `bridge:link:${id}:claim`;
const DECIDED_TTL_S = 120;
export const NO_ROLE_MESSAGE = 'This account has no staff role on the TCG site';

interface LinkRecord { name: string; code: string; secretHash: string; status: 'pending' | 'allowed' | 'denied'; message?: string; token?: string; login?: string; role?: StaffRole; at: number }

const cleanId = (raw: unknown): string => (typeof raw === 'string' && /^[A-Za-z0-9_-]{22}$/.test(raw) ? raw : '');
const sha = (s: string) => createHash('sha256').update(s).digest();

/** A new request: the id goes in the page address, the code is shown in the app and on the page, the secret is returned only here. */
export async function createLink(rawName: unknown): Promise<{ id: string; code: string; secret: string; url: string; expiresAt: number }> {
  const id = randomBytes(16).toString('base64url');
  const secret = randomBytes(32).toString('base64url');
  const rec: LinkRecord = { name: cleanName(rawName), code: newLinkCode(), secretHash: sha(secret).toString('hex'), status: 'pending', at: Date.now() };
  await kv.set(linkKey(id), rec, { ex: LINK_TTL_S });
  return { id, code: rec.code, secret, url: `${SITE_URL}/bridge/link?id=${id}`, expiresAt: rec.at + LINK_TTL_S * 1000 };
}

/** What the page shows: null when the request is unknown, expired or used. */
export async function readLink(rawId: unknown): Promise<{ name: string; code: string; status: LinkRecord['status'] } | null> {
  const id = cleanId(rawId);
  const rec = id ? await kv.get<LinkRecord>(linkKey(id)).catch(() => null) : null;
  return rec ? { name: rec.name, code: rec.code, status: rec.status } : null;
}

/**
 * Allow or Deny from the signed-in streamer. `role` is their site role right now (null = none). 'gone' when the request is not pending any more
 * (also when another click got there first); 'no-role' denies the request with the plain message; on 'allowed' a token was minted for the account.
 */
export async function decideLink(rawId: unknown, who: { userId: string; login: string; role: StaffRole | null }, allow: boolean): Promise<'allowed' | 'denied' | 'no-role' | 'gone'> {
  const id = cleanId(rawId);
  const rec = id ? await kv.get<LinkRecord>(linkKey(id)) : null;
  if (!rec || rec.status !== 'pending') return 'gone';
  if (!(await kv.set(claimKey(id), 1, { nx: true, ex: LINK_TTL_S }))) return 'gone';
  const deny = async (message: string) => { await kv.set(linkKey(id), { ...rec, status: 'denied', message } satisfies LinkRecord, { ex: DECIDED_TTL_S }); };
  if (!allow) { await deny('The link was denied on the site.'); return 'denied'; }
  if (!who.role) { await deny(NO_ROLE_MESSAGE); return 'no-role'; }
  const token = await mintToken(rec.name, { userId: who.userId, login: who.login, role: who.role, by: who.login, roleCheckedAt: Date.now() });
  await kv.set(linkKey(id), { ...rec, status: 'allowed', token, login: who.login, role: who.role } satisfies LinkRecord, { ex: DECIDED_TTL_S });
  return 'allowed';
}

export type LinkPoll = { status: 'pending' } | { status: 'denied'; message: string } | { status: 'expired' } | { status: 'allowed'; token: string; login: string; role: StaffRole };

/** The app's poll. A wrong secret looks exactly like an expired request. A decided request is handed out once (the delete is the claim). */
export async function pollLink(rawId: unknown, rawSecret: unknown): Promise<LinkPoll> {
  const gone: LinkPoll = { status: 'expired' };
  const id = cleanId(rawId);
  const rec = id && typeof rawSecret === 'string' ? await kv.get<LinkRecord>(linkKey(id)).catch(() => null) : null;
  if (!rec || !timingSafeEqual(sha(String(rawSecret)), Buffer.from(rec.secretHash, 'hex'))) return gone;
  if (rec.status === 'pending') return { status: 'pending' };
  if ((await kv.del(linkKey(id))) !== 1) return gone;
  if (rec.status === 'denied') return { status: 'denied', message: rec.message ?? 'The link was denied.' };
  return rec.token && rec.login && rec.role ? { status: 'allowed', token: rec.token, login: rec.login, role: rec.role } : gone;
}
