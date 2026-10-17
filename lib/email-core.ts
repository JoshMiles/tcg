// Email notifications, the client-safe half: the stored record, address checks and how a batch of notices becomes one email.
// Sending, tokens and storage live in lib/email.ts (Node only). Kinds are the same four groups as Web Push (offers, results,
// listing alerts, admin), but email starts with offers and results only.

import { PUSH_KINDS, pushGroup, payloadFor, type PushKind } from './push-core';
import type { Notice } from './trade-notice-core';

export const EMAIL_KINDS = PUSH_KINDS;
export type EmailKind = PushKind;
export const EMAIL_DEFAULT_KINDS: EmailKind[] = ['offers', 'results'];
/** At most one email per viewer in this window; notices that arrive inside it wait and go out together. */
export const EMAIL_WINDOW_S = 15 * 60;
/** The confirmation link works this long. */
export const EMAIL_CONFIRM_TTL_S = 24 * 60 * 60;
/** A batch never lists more than this many notices (the rest are counted). */
export const EMAIL_BATCH_MAX = 20;
/** Notices waiting for the window to pass are capped, so a flood cannot grow the queue without end. */
export const EMAIL_QUEUE_MAX = 60;

export type EmailOff = 'unsubscribed' | 'bounced' | 'complained';
export interface EmailRecord { address: string; addedAt: number; verifiedAt?: number; kinds: EmailKind[]; off?: EmailOff }
export type EmailStatus = 'pending' | 'on' | 'off';

export const emailStatus = (r: EmailRecord): EmailStatus => (r.off ? 'off' : r.verifiedAt ? 'on' : 'pending');

/** A lower-cased address, or null when it does not look like one. Deliberately simple: the confirmation email is the real test. */
export function normalizeAddress(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const a = v.trim().toLowerCase();
  if (a.length < 6 || a.length > 254 || /[\s<>,;"()\\[\]]/.test(a)) return null;
  return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(a) && !a.includes('..') ? a : null;
}

/** "a***@example.com": enough to recognise it, not enough to read it over a shoulder. */
export function maskAddress(a: string): string {
  const [name, domain] = a.split('@');
  return `${name.slice(0, 1)}***@${domain}`;
}

export function sanitizeEmailKinds(v: unknown): EmailKind[] {
  return Array.isArray(v) ? EMAIL_KINDS.filter(k => v.includes(k)) : [...EMAIL_DEFAULT_KINDS];
}

export function sanitizeEmailRecord(raw: unknown): EmailRecord | null {
  const o = (raw && typeof raw === 'object' ? raw : null) as Record<string, unknown> | null;
  const address = o ? normalizeAddress(o.address) : null;
  if (!o || !address) return null;
  const off = o.off === 'unsubscribed' || o.off === 'bounced' || o.off === 'complained' ? o.off : undefined;
  return {
    address, addedAt: typeof o.addedAt === 'number' ? o.addedAt : 0, kinds: sanitizeEmailKinds(o.kinds),
    ...(typeof o.verifiedAt === 'number' ? { verifiedAt: o.verifiedAt } : {}), ...(off ? { off } : {}),
  };
}

/** Does this record want an email for this kind of notice right now? */
export const emailWants = (r: EmailRecord | null, kind: string): boolean => !!r && emailStatus(r) === 'on' && r.kinds.includes(pushGroup(kind));

const NOUN: Record<string, [string, string]> = {
  offer: ['new trade offer', 'new trade offers'], countered: ['counter offer', 'counter offers'], accepted: ['accepted trade', 'accepted trades'],
  declined: ['declined offer', 'declined offers'], cancelled: ['cancelled offer', 'cancelled offers'], expired: ['expired offer', 'expired offers'],
  watch: ['new listing for a card you watch', 'new listings for cards you watch'], admin: ['message from the admins', 'messages from the admins'],
  feedback: ['answer to your feedback', 'answers to your feedback'],
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface BuiltEmail { subject: string; text: string; html: string }

/** One email for one or more notices. `base` is the site address; the two links are absolute and already signed. */
export function buildEmail(items: Notice[], links: { base: string; unsubscribe: string; manage: string }, appName: string): BuiltEmail {
  const total = items.length;
  const shown = items.slice(0, EMAIL_BATCH_MAX);
  const kinds = new Set(items.map(n => n.kind));
  let subject: string;
  if (total === 1) subject = payloadFor(items[0]).title;
  else if (kinds.size === 1) subject = `${total} ${NOUN[items[0].kind]?.[1] ?? 'new notices'}`;
  else subject = `${total} new notices on ${appName}`;
  const url = (n: Notice) => links.base + payloadFor(n).url;
  const more = total > shown.length ? `And ${total - shown.length} more. Open your notifications to see them all.` : '';
  const text = [
    ...shown.map(n => `- ${n.text}\n  ${url(n)}`), ...(more ? ['', more] : []), '',
    `Open the site: ${links.base}/notifications`, '',
    `You get this because you asked for email notifications on ${appName}.`,
    `Choose what you get: ${links.manage}`, `Stop these emails: ${links.unsubscribe}`,
  ].join('\n');
  const li = shown.map(n => `<li style="margin:0 0 12px"><div>${esc(n.text)}</div><a href="${esc(url(n))}" style="color:#b45309">Open it</a></li>`).join('');
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f5f5f4;font-family:Arial,Helvetica,sans-serif;color:#1c1917">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px">
<h1 style="font-size:18px;margin:0 0 16px">${esc(subject)}</h1>
<ul style="padding-left:18px;margin:0 0 16px;font-size:15px;line-height:1.4">${li}</ul>
${more ? `<p style="font-size:14px">${esc(more)}</p>` : ''}
<p style="margin:0 0 24px"><a href="${esc(links.base)}/notifications" style="display:inline-block;background:#eab308;color:#111827;font-weight:bold;padding:10px 16px;border-radius:8px;text-decoration:none">Open your notifications</a></p>
<p style="font-size:12px;color:#78716c;margin:0">You get this because you asked for email notifications on ${esc(appName)}. <a href="${esc(links.manage)}" style="color:#78716c">Choose what you get</a> or <a href="${esc(links.unsubscribe)}" style="color:#78716c">stop these emails</a>.</p>
</div></body></html>`;
  return { subject, text, html };
}

export function buildConfirmEmail(confirmUrl: string, appName: string, ttlHours: number): BuiltEmail {
  const subject = `Confirm your email for ${appName}`;
  const text = `Someone (hopefully you) asked for ${appName} notifications by email at this address.\n\nConfirm it with this link (good for ${ttlHours} hours):\n${confirmUrl}\n\nIf it was not you, ignore this email: nothing is sent until the address is confirmed.`;
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f5f5f4;font-family:Arial,Helvetica,sans-serif;color:#1c1917">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px">
<h1 style="font-size:18px;margin:0 0 16px">${esc(subject)}</h1>
<p style="font-size:15px;line-height:1.4">Someone (hopefully you) asked for ${esc(appName)} notifications by email at this address.</p>
<p style="margin:0 0 24px"><a href="${esc(confirmUrl)}" style="display:inline-block;background:#eab308;color:#111827;font-weight:bold;padding:10px 16px;border-radius:8px;text-decoration:none">Confirm my email</a></p>
<p style="font-size:12px;color:#78716c;margin:0">The link works for ${ttlHours} hours. If it was not you, ignore this email: nothing is sent until the address is confirmed.</p>
</div></body></html>`;
  return { subject, text, html };
}
