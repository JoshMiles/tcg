// Cleaning what the admin types for an outgoing webhook. The server POSTs to this address whenever a card is pulled, so it must be a
// public https address (not this machine, not a private network), and the fields it sends must be well-formed. Saving needs https;
// sending still accepts an http address stored before that rule (lib/webhook-send.ts also resolves the host). Pure (no database),
// so the settings form and the sender share it and a script can test it.
import type { WebhookField } from './webhooks';

const PRIVATE_V4 = [/^10\./, /^127\./, /^0\./, /^169\.254\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./];

/** True for an address that points back at this machine or into a private network (by its literal text; DNS names are not resolved here, see lib/webhook-send.ts). */
export function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.lan')) return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return PRIVATE_V4.some(r => r.test(h));
  if (h.includes(':')) {
    // IPv4 inside IPv6 (::ffff:10.0.0.1, or ::ffff:a00:1 as URL parsing writes it): judge the embedded IPv4 address.
    const dotted = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(h)?.[1];
    if (dotted) return isPrivateHost(dotted);
    const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(h);
    if (hex) { const a = parseInt(hex[1], 16), b = parseInt(hex[2], 16); return isPrivateHost(`${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`); }
    return h === '::1' || h === '::' || /^f[cd]/.test(h) || /^fe[89ab]/.test(h) || h.startsWith('::ffff:');
  }
  return !h.includes('.'); // a bare name like "intranet"
}

/** The shared part: a URL on a public host with the given schemes, or an error in plain words. An empty string is allowed (not set up). */
function checkUrl(raw: string, schemes: string[], schemeError: string): { ok: true; url: string } | { ok: false; error: string } {
  const text = raw.trim();
  if (!text) return { ok: true, url: '' };
  if (text.length > 500) return { ok: false, error: 'The address is too long.' };
  let u: URL;
  try { u = new URL(text); } catch { return { ok: false, error: 'That is not a valid web address (it should start with https://).' }; }
  if (!schemes.includes(u.protocol)) return { ok: false, error: schemeError };
  if (u.username || u.password) return { ok: false, error: 'Put the key in the address path or the fields, not as a user name and password.' };
  if (isPrivateHost(u.hostname)) return { ok: false, error: 'That address points at this machine or a private network, which the server cannot reach. Use a public address.' };
  return { ok: true, url: u.toString() };
}

/** Saving: an https URL on a public host. */
export function checkWebhookUrl(raw: string) {
  return checkUrl(raw, ['https:'], 'The address must start with https://.');
}

/** Sending: also accepts an http URL stored before saving required https, so a live integration keeps working until it is saved again. */
export function checkWebhookSendUrl(raw: string) {
  return checkUrl(raw, ['https:', 'http:'], 'The address must start with https://.');
}

/** The field list, kept only if it is well-formed: up to 20 rows of a non-empty key and a value. Anything else is dropped. */
export function cleanWebhookFields(raw: unknown): WebhookField[] {
  if (!Array.isArray(raw)) return [];
  const out: WebhookField[] = [];
  for (const f of raw) {
    if (!f || typeof f !== 'object') continue;
    const key = typeof (f as WebhookField).key === 'string' ? (f as WebhookField).key.trim().slice(0, 60) : '';
    const value = typeof (f as WebhookField).value === 'string' ? (f as WebhookField).value.slice(0, 500) : '';
    if (key) out.push({ key, value });
    if (out.length >= 20) break;
  }
  return out;
}
