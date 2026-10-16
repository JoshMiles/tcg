// The middleware's view of the access settings (edge-safe, no @vercel/kv): one GET of `access:settings` over the Upstash REST API,
// remembered for 30 seconds per instance. Returns null when the database cannot be reached, which the middleware treats as "open".

import { normalizeAccess, type AccessSettings } from './access-core';

const TTL_MS = 30_000;
let cache: { at: number; settings: AccessSettings | null } | null = null;

/** Forget the remembered settings (tests, and when a cookie proves they are out of date). */
export function resetAccessCache() { cache = null; }

async function fetchSettings(): Promise<AccessSettings | null> {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  try {
    const res = await fetch(url.replace(/\/$/, ''), { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(['GET', 'access:settings']), cache: 'no-store', signal: AbortSignal.timeout(1500) });
    if (!res.ok) return null;
    const body = (await res.json()) as { result?: unknown };
    return normalizeAccess(body.result ?? null);
  } catch {
    return null;
  }
}

/** The settings, at most 30 seconds old (`fresh` skips the wait). Null on a database error: the caller fails open. */
export async function readAccessSettings(fresh = false, now = Date.now()): Promise<AccessSettings | null> {
  if (!fresh && cache && now - cache.at < TTL_MS && cache.settings) return cache.settings;
  const settings = await fetchSettings();
  // A failed read is not remembered, so the next request tries again; the last good copy is not used past its time.
  cache = settings ? { at: now, settings } : null;
  return settings;
}
