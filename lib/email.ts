import { after } from 'next/server';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { kv, inSandbox } from './db';
import { withLock } from './kv';
import { getUserSettings } from './user-settings-store';
import { wantsNotice } from './user-settings';
import { SITE_URL } from './site';
import { APP_NAME } from './legal';
import {
  EMAIL_CONFIRM_TTL_S, EMAIL_DEFAULT_KINDS, EMAIL_QUEUE_MAX, EMAIL_WINDOW_S, buildConfirmEmail, buildEmail, emailStatus, emailWants,
  normalizeAddress, sanitizeEmailKinds, sanitizeEmailRecord, type BuiltEmail, type EmailOff, type EmailRecord,
} from './email-core';
import type { Notice } from './trade-notice-core';

// Email notifications through Resend's REST API (ROADMAP 22.1): the only file that talks to it. Node runtime only; never import it from
// client code or the edge middleware. Without RESEND_API_KEY (and a SESSION_SECRET to sign links with) the whole feature is hidden and
// every function here is a quiet no-op. Nothing is sent from a sandbox or preview. The record lives at user:<u>:email.
//
// Batching has no background job: a notice joins the viewer's queue (email:q:<u>); one email goes out per EMAIL_WINDOW_S (the window is a
// SET NX EX key, email:last:<u>) and takes the whole queue. Notices that arrive inside the window wait for the next notice or for the
// daily cron (flushDueEmails).

const recordKey = (u: string) => `user:${u.toLowerCase()}:email`;
const queueKey = (u: string) => `email:q:${u.toLowerCase()}`;
const lastKey = (u: string) => `email:last:${u.toLowerCase()}`;
const PENDING_SET = 'email:pending';

export const emailApiKey = () => (process.env.RESEND_API_KEY ?? '').trim();
const signingKey = () => { const s = process.env.SESSION_SECRET ?? ''; return s.length >= 16 ? s : ''; };
export const emailConfigured = () => !!(emailApiKey() && signingKey());
const fromAddress = () => (process.env.EMAIL_FROM ?? '').trim() || `${APP_NAME} <alerts@cheesytcg.app>`;
/** RESEND_API_URL points the sender at a fake, outside production only. */
const apiBase = () => ((process.env.NODE_ENV !== 'production' && process.env.RESEND_API_URL) || 'https://api.resend.com').replace(/\/$/, '');

// ── signed links ──
const b64 = (s: string) => Buffer.from(s).toString('base64url');
const mac = (data: string) => createHmac('sha256', signingKey()).update(data).digest('base64url');
const addrHash = (address: string) => createHash('sha256').update(address).digest('hex').slice(0, 16);
const same = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

export function confirmToken(user: string, address: string, now = Date.now()): string {
  const payload = b64(JSON.stringify({ u: user.toLowerCase(), a: addrHash(address), exp: Math.floor(now / 1000) + EMAIL_CONFIRM_TTL_S }));
  return `${payload}.${mac(`confirm.${payload}`)}`;
}

/** The viewer and address hash a confirmation token vouches for, or null (forged, edited or expired). */
export function readConfirmToken(token: string, now = Date.now()): { user: string; hash: string } | null {
  if (!signingKey()) return null;
  const [payload, sig, extra] = token.split('.');
  if (!payload || !sig || extra !== undefined || !same(sig, mac(`confirm.${payload}`))) return null;
  try {
    const o = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { u?: unknown; a?: unknown; exp?: unknown };
    if (typeof o.u !== 'string' || typeof o.a !== 'string' || typeof o.exp !== 'number' || o.exp < now / 1000) return null;
    return { user: o.u, hash: o.a };
  } catch { return null; }
}

/** No expiry: an unsubscribe link in an old email must keep working. It only ever switches email off. */
export const unsubscribeToken = (user: string) => { const u = b64(user.toLowerCase()); return `${u}.${mac(`unsub.${u}`)}`; };
export function readUnsubscribeToken(token: string): string | null {
  if (!signingKey()) return null;
  const [u, sig, extra] = token.split('.');
  if (!u || !sig || extra !== undefined || !same(sig, mac(`unsub.${u}`))) return null;
  return Buffer.from(u, 'base64url').toString('utf8') || null;
}

const links = (user: string) => ({
  base: SITE_URL,
  unsubscribe: `${SITE_URL}/api/email/unsubscribe?t=${unsubscribeToken(user)}`,
  manage: `${SITE_URL}/settings#email`,
});

// ── storage ──
export async function getEmail(user: string): Promise<EmailRecord | null> {
  return sanitizeEmailRecord(await kv.get(recordKey(user)).catch(() => null));
}
const putEmail = (user: string, r: EmailRecord) => kv.set(recordKey(user), r);

/** Account deletion: the record, the queue and the window. */
export async function deleteEmail(user: string): Promise<void> {
  await kv.del(recordKey(user), queueKey(user), lastKey(user)).catch(() => 0);
  await kv.srem(PENDING_SET, user.toLowerCase()).catch(() => 0);
}

// ── sending ──
interface Outgoing { to: string; mail: BuiltEmail; user: string; unsubscribe: boolean }

/** One message through Resend. Returns false on any failure (logged without the address). */
async function deliver(o: Outgoing): Promise<boolean> {
  try {
    const headers = o.unsubscribe
      ? { 'List-Unsubscribe': `<${links(o.user).unsubscribe}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }
      : undefined;
    const r = await fetch(`${apiBase()}/emails`, {
      method: 'POST',
      headers: { authorization: `Bearer ${emailApiKey()}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: fromAddress(), to: [o.to], subject: o.mail.subject, html: o.mail.html, text: o.mail.text,
        ...(headers ? { headers } : {}), tags: [{ name: 'viewer', value: o.user.toLowerCase().replace(/[^a-z0-9_-]/g, '_') }],
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) console.warn(`email for ${o.user}: Resend answered ${r.status}`);
    return r.ok;
  } catch (e) {
    console.warn('email failed:', e instanceof Error ? e.message : e);
    return false;
  }
}

export type StartResult = { ok: true; record: EmailRecord } | { ok: false; error: string };

/** Settings -> Email: store the (unconfirmed) address and send the confirmation link. Changing the address starts again. */
export async function startEmail(user: string, input: unknown): Promise<StartResult> {
  if (!emailConfigured()) return { ok: false, error: 'Email is not set up on this site yet.' };
  const address = normalizeAddress(input);
  if (!address) return { ok: false, error: 'That does not look like an email address.' };
  const u = user.toLowerCase();
  if (!(await kv.set(`email:cfm:${u}`, 1, { nx: true, ex: 60 }))) return { ok: false, error: 'Wait a minute before asking for another confirmation email.' };
  const n = Number(await kv.incr(`email:cfm:${u}:day`));
  if (n === 1) await kv.expire(`email:cfm:${u}:day`, 86400).catch(() => 0);
  if (n > 5) return { ok: false, error: 'That is enough confirmation emails for today. Try again tomorrow.' };
  const prev = await getEmail(u);
  const record: EmailRecord = { address, addedAt: Date.now(), kinds: prev ? prev.kinds : [...EMAIL_DEFAULT_KINDS] };
  await putEmail(u, record);
  await kv.del(queueKey(u)).catch(() => 0);
  if (!(await inSandbox())) {
    const url = `${SITE_URL}/api/email/confirm?t=${confirmToken(u, address)}`;
    const sent = await deliver({ to: address, user: u, unsubscribe: false, mail: buildConfirmEmail(url, APP_NAME, EMAIL_CONFIRM_TTL_S / 3600) });
    if (!sent) return { ok: false, error: 'Could not send the confirmation email right now. Try again in a little while.' };
  }
  return { ok: true, record };
}

/** The link in the confirmation email. False when the token is bad or the address was changed since. */
export async function confirmEmail(token: string): Promise<boolean> {
  const t = readConfirmToken(token);
  if (!t) return false;
  const rec = await getEmail(t.user);
  if (!rec || addrHash(rec.address) !== t.hash) return false;
  if (rec.verifiedAt && !rec.off) return true;
  const { off: _off, ...rest } = rec;
  await putEmail(t.user, { ...rest, verifiedAt: Date.now() });
  return true;
}

export async function setEmailKinds(user: string, kinds: unknown): Promise<EmailRecord | null> {
  const rec = await getEmail(user);
  if (!rec) return null;
  const next = { ...rec, kinds: sanitizeEmailKinds(kinds) };
  await putEmail(user, next);
  return next;
}

/** Switches email off (the unsubscribe link, a bounce, a complaint). The address stays so the viewer can see why; they must confirm again to turn it back on. */
export async function switchEmailOff(user: string, why: EmailOff): Promise<boolean> {
  const rec = await getEmail(user);
  if (!rec) return false;
  await putEmail(user, { ...rec, off: why });
  await kv.del(queueKey(user)).catch(() => 0);
  return true;
}

// ── notices ──
async function readQueue(user: string): Promise<Notice[]> {
  const q = await kv.get<Notice[]>(queueKey(user)).catch(() => null);
  return Array.isArray(q) ? q : [];
}

/** Sends the viewer's queue as one email when the window allows it. Returns how many notices went out. */
export async function flushEmail(user: string): Promise<number> {
  const u = user.toLowerCase();
  try {
    if (!emailConfigured() || (await inSandbox())) return 0;
    const rec = await getEmail(u);
    if (!rec || emailStatus(rec) !== 'on') { await kv.del(queueKey(u)).catch(() => 0); await kv.srem(PENDING_SET, u).catch(() => 0); return 0; }
    if ((await readQueue(u)).length === 0) { await kv.srem(PENDING_SET, u).catch(() => 0); return 0; }
    if (!(await kv.set(lastKey(u), Date.now(), { nx: true, ex: EMAIL_WINDOW_S }))) return 0; // sent one within the window: wait
    const items = await withLock(`email:${u}`, async () => { const q = await readQueue(u); await kv.del(queueKey(u)); return q; });
    if (items.length === 0) return 0;
    const sent = await deliver({ to: rec.address, user: u, unsubscribe: true, mail: buildEmail(items.sort((a, b) => a.at - b.at), links(u), APP_NAME) });
    if (!sent) { // keep them for the next try
      await withLock(`email:${u}`, async () => { await kv.set(queueKey(u), [...items, ...(await readQueue(u))].slice(-EMAIL_QUEUE_MAX)); });
      await kv.del(lastKey(u)).catch(() => 0);
      return 0;
    }
    if ((await readQueue(u)).length === 0) await kv.srem(PENDING_SET, u).catch(() => 0);
    return items.length;
  } catch (e) {
    console.warn('email flush failed:', e instanceof Error ? e.message : e);
    return 0;
  }
}

/** Waits this long for more notices before the first email of a window goes out (so a burst is one email). Zero outside production if asked. */
const coalesceMs = () => (process.env.NODE_ENV !== 'production' && process.env.EMAIL_COALESCE_MS ? Number(process.env.EMAIL_COALESCE_MS) || 0 : 20000);

/**
 * Called by notify() once the notice is written. Queues it for the viewer when their email wants this kind, then sends through after()
 * (the sandbox is decided now: it is not visible inside after()). Outside a request (scripts, checks) it just runs.
 */
export async function emailNotice(user: string, notice: Notice): Promise<void> {
  try {
    if (!emailConfigured() || (await inSandbox())) return;
    const u = user.toLowerCase();
    const rec = await getEmail(u);
    if (!emailWants(rec, notice.kind) || !wantsNotice(await getUserSettings(u), notice.kind)) return;
    await withLock(`email:${u}`, async () => { await kv.set(queueKey(u), [...(await readQueue(u)), notice].slice(-EMAIL_QUEUE_MAX)); });
    await kv.sadd(PENDING_SET, u);
    const run = async () => {
      const ms = coalesceMs();
      if (ms > 0) await new Promise(r => setTimeout(r, ms));
      await flushEmail(u);
    };
    try { after(run); } catch { await run(); }
  } catch { /* best effort */ }
}

/** Daily cron: send what the 15 minute window held back. */
export async function flushDueEmails(): Promise<number> {
  if (!emailConfigured()) return 0;
  let sent = 0;
  const waiting = ((await kv.smembers(PENDING_SET).catch(() => [])) as string[]).slice(0, 500);
  for (const u of waiting) sent += await flushEmail(u);
  return sent;
}

// ── Resend webhook ──
/** Verifies a Svix-signed webhook (Resend signs with Svix): HMAC-SHA256 of "id.timestamp.body" with the base64 part of the whsec_ secret. */
export function verifyWebhook(body: string, h: { id: string | null; timestamp: string | null; signature: string | null }, secret = (process.env.RESEND_WEBHOOK_SECRET ?? '').trim(), now = Date.now()): boolean {
  if (!secret || !h.id || !h.timestamp || !h.signature) return false;
  const ts = Number(h.timestamp);
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > 5 * 60) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = createHmac('sha256', key).update(`${h.id}.${h.timestamp}.${body}`).digest('base64');
  return h.signature.split(' ').some(part => { const [v, sig] = part.split(','); return v === 'v1' && !!sig && same(sig, expected); });
}

/** A bounce or complaint event: switch email off for the viewer it was sent to (the `viewer` tag), if the address still matches. */
export async function handleWebhookEvent(event: unknown): Promise<'off' | 'ignored'> {
  const e = (event && typeof event === 'object' ? event : {}) as { type?: unknown; data?: { to?: unknown; tags?: unknown } };
  const why: EmailOff | null = e.type === 'email.bounced' ? 'bounced' : e.type === 'email.complained' ? 'complained' : null;
  if (!why || !e.data) return 'ignored';
  const tags = e.data.tags;
  const viewer = Array.isArray(tags) ? (tags as { name?: unknown; value?: unknown }[]).find(t => t?.name === 'viewer')?.value
    : tags && typeof tags === 'object' ? (tags as Record<string, unknown>).viewer : undefined;
  const to = Array.isArray(e.data.to) ? e.data.to.map(normalizeAddress) : [];
  if (typeof viewer !== 'string' || !viewer) return 'ignored';
  const rec = await getEmail(viewer);
  if (!rec || !to.includes(rec.address)) return 'ignored';
  return (await switchEmailOff(viewer, why)) ? 'off' : 'ignored';
}
