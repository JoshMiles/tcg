// Middleware's view of the emergency-cookie generation. Edge-safe: one GET over the Upstash REST API, no @vercel/kv.
// Called only when the emergency cookie is actually present. A failed read rejects the cookie (fail closed).
import { adminGenKey, parseAdminGen } from './admin-token';

export async function readAdminGenEdge(env: Record<string, string | undefined> = process.env): Promise<number | null> {
  const url = env.KV_REST_API_URL;
  const token = env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  try {
    const res = await fetch(url.replace(/\/$/, ''), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['GET', adminGenKey(env)]),
      cache: 'no-store',
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { result?: unknown };
    return parseAdminGen(body.result);
  } catch {
    return null;
  }
}
