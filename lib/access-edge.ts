// The middleware's view of the access settings (edge-safe, no @vercel/kv): one GET of `access:settings` over the Upstash REST API,
// remembered for 30 seconds per instance. When the database cannot be reached it keeps using the last good copy, so an outage
// does not open a closed site; only an instance that has never read the settings gets null, which the middleware treats as "open".

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

/** The settings, at most 30 seconds old (`fresh` skips the wait). On a database error, the last good copy; null if there is none. */
export async function readAccessSettings(fresh = false, now = Date.now()): Promise<AccessSettings | null> {
  if (!fresh && cache && now - cache.at < TTL_MS && cache.settings) return cache.settings;
  const settings = await fetchSettings();
  // A failed read is not remembered, so the next request tries again; until one succeeds the last good copy stands in.
  if (settings) cache = { at: now, settings };
  return settings ?? cache?.settings ?? null;
}
