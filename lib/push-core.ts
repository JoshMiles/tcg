// Web Push, the client-safe half: what a stored device looks like, how a subscription from the browser is validated and which
// notices become alerts. The sending lives in lib/push.ts (Node only).

import type { Notice } from './trade-notice-core';

export const PUSH_MAX_DEVICES = 5;
export const PUSH_KINDS = ['offers', 'results', 'watch', 'admin'] as const;
export type PushKind = (typeof PUSH_KINDS)[number];
export const PUSH_KIND_LABELS: Record<PushKind, string> = { offers: 'Trade offers and counters', results: 'How my offers ended', watch: 'Listing alerts', admin: 'Messages from the admins' };

export interface PushDevice { endpoint: string; keys: { p256dh: string; auth: string }; ua: string; addedAt: number; lastOkAt: number }
/** What the settings page may see of a device: never the endpoint or keys. */
export interface PushDeviceInfo { id: string; ua: string; addedAt: number; lastOkAt: number }

export interface PushPayload { title: string; body: string; url: string; tag: string; urgent?: boolean }

/** https only (a push service), plus plain http on localhost outside production so the fake endpoint of the checks can be used. */
export function validEndpoint(v: unknown, dev = process.env.NODE_ENV !== 'production'): v is string {
  if (typeof v !== 'string' || v.length > 600) return false;
  try {
    const u = new URL(v);
    if (u.protocol === 'https:') return true;
    return dev && u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1');
  } catch { return false; }
}

const B64URL = /^[A-Za-z0-9_-]+={0,2}$/;
const b64Len = (s: string) => { try { return atob(s.replace(/=+$/, '').replace(/-/g, '+').replace(/_/g, '/')).length; } catch { return -1; } };

/** A browser's PushSubscription.toJSON() in, a clean { endpoint, keys } out (or null). p256dh is a 65-byte P-256 point, auth 16 bytes. */
export function parseSubscription(input: unknown): { endpoint: string; keys: { p256dh: string; auth: string } } | null {
  const o = (input && typeof input === 'object' ? input : {}) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  const p = o.keys?.p256dh, a = o.keys?.auth;
  if (!validEndpoint(o.endpoint) || typeof p !== 'string' || typeof a !== 'string') return null;
  if (!B64URL.test(p) || !B64URL.test(a) || b64Len(p) !== 65 || b64Len(a) !== 16) return null;
  return { endpoint: o.endpoint, keys: { p256dh: p, auth: a } };
}

/** A short device label from the user agent, e.g. "Chrome on Android". The raw string is never kept. */
export function deviceLabel(ua: string): string {
  const os = /iPhone|iPad|iPod/.test(ua) ? 'iPhone / iPad' : /Android/i.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /Linux|CrOS/.test(ua) ? 'Linux' : 'Unknown device';
  const br = /EdgA|EdgiOS|Edg\//.test(ua) ? 'Edge' : /SamsungBrowser/i.test(ua) ? 'Samsung Internet' : /FxiOS|Firefox/i.test(ua) ? 'Firefox' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `${br} on ${os}`;
}

/** The pushKinds group that governs a notice (offers, results, listing alerts, admin). */
export function pushGroup(kind: string): PushKind {
  if (kind === 'offer' || kind === 'countered') return 'offers';
  if (kind === 'watch') return 'watch';
  return kind === 'admin' || kind === 'feedback' ? 'admin' : 'results';
}

export function allowsPush(pushKinds: readonly string[], kind: string): boolean {
  return pushKinds.includes(pushGroup(kind));
}

const TITLES: Record<string, string> = {
  offer: 'New trade offer', countered: 'Counter offer', accepted: 'Trade accepted', declined: 'Offer declined', cancelled: 'Offer cancelled',
  expired: 'Offer expired', watch: 'Card listed', admin: 'Message from the admins', feedback: 'An answer to your feedback',
};

export function payloadFor(n: Pick<Notice, 'id' | 'kind' | 'text' | 'tradeId'>): PushPayload {
  return {
    title: TITLES[n.kind] ?? 'The Cheesy TCG',
    body: n.text.slice(0, 240),
    url: n.kind === 'watch' ? '/trade?tab=board' : n.kind === 'feedback' ? '/feedback' : '/trade',
    tag: n.tradeId ? `trade-${n.tradeId}` : `notice-${n.id}`,
    urgent: n.kind === 'offer' || n.kind === 'countered',
  };
}
