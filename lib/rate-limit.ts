import { NextResponse } from 'next/server';
import { isPreview, kv, prodKv } from './db';

// The one rate limiter: a fixed window per (name, key), counted with INCR and started by EXPIRE on the first hit. Counts live in the
// production namespace, not the namespaced `kv`, so a sandbox cookie or header cannot start a fresh count (a preview deployment
// can only write inside its own namespace, which is also a single shared one there). Limits and the reasoning: docs/hosting.md.

const store = () => (isPreview() ? kv : prodKv);

/** The caller's address from a header the platform sets: `x-real-ip`, else the right-most `x-forwarded-for` entry (the one the nearest proxy appended). The left-most entry is whatever the caller sent. */
export function clientIp(h: Headers): string {
  const real = h.get('x-real-ip')?.trim();
  if (real) return real;
  return h.get('x-forwarded-for')?.split(',').map(s => s.trim()).filter(Boolean).at(-1) || 'unknown';
}

export const rateKey = (name: string, key: string) => `rl:${name}:${key}`;

/** Counts one hit and returns how many hits this window has seen, this one included. The window starts at the first hit. */
export async function rateHit(name: string, key: string, windowS: number): Promise<number> {
  const k = rateKey(name, key);
  const n = await store().incr(k);
  // shortcut: a crash between INCR and EXPIRE leaves the count without an end, when it matters move both into one EVAL.
  if (n === 1) await store().expire(k, windowS);
  return n;
}

/** Hits so far in the current window, without counting one. */
export async function rateCount(name: string, key: string): Promise<number> {
  return Number(await store().get(rateKey(name, key))) || 0;
}

/** Counts one call and says whether it is allowed: true for the first `max` calls in a window of `windowS` seconds, false after. */
export async function rateLimit(name: string, key: string, max: number, windowS: number): Promise<boolean> {
  return (await rateHit(name, key, windowS)) <= max;
}

/** Per caller address, per minute. Many times what the overlay (which asks for events every 2 seconds) and the stream tools send. */
const WEBHOOK_PER_MIN = 600;
/** Per caller address, per minute. A panel makes a handful of calls when opened and one per button press. */
const TWITCH_PER_MIN = 300;

/** A 429 when this caller address has used up `max` calls to `name` this minute, else null. A broken counter lets the call through. */
async function tooMany(req: Request, name: string, max: number): Promise<NextResponse | null> {
  const ok = await rateLimit(name, clientIp(req.headers), max, 60).catch(() => true);
  return ok ? null : NextResponse.json({ error: 'Too many requests. Try again in a minute.' }, { status: 429, headers: { 'Retry-After': '60' } });
}

/** First line of every `/api/webhooks/*` route. */
export const limitWebhook = (req: Request) => tooMany(req, 'webhooks', WEBHOOK_PER_MIN);
/** First line of every `/api/twitch/*` route. */
export const limitTwitch = (req: Request) => tooMany(req, 'twitch', TWITCH_PER_MIN);
