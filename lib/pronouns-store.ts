import { kv } from './db';
import { alejoLabel, pronounLabel, type AlejoPronoun, type AlejoUser, type Pronouns } from './pronouns';

// Server side of the pronouns: resolves what to show after a collector's name. The pr.alejo.io lookup is only made for a
// collector who chose that mode, is cached in KV (answers and misses for a day, a failure for ten minutes), gives up after
// two seconds and never throws, so a slow or missing answer just shows nothing.

const API = 'https://api.pronouns.alejo.io/v1';
const DAY = 86_400;
const FAILED_SECONDS = 600;
const TIMEOUT_MS = 2000;
const tableKey = 'pronouns:table';
const userKey = (login: string) => `pronouns:${login}`;

/** Local checks point this at a fake; the override is ignored in production builds. */
const base = () => (process.env.NODE_ENV !== 'production' && process.env.PRONOUNS_API_URL) || API;

/** The parsed JSON, null for a 404 (nothing set), undefined for any failure. */
async function getJson(path: string): Promise<unknown | null | undefined> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${base()}${path}`, { signal: ctl.signal, cache: 'no-store', headers: { accept: 'application/json' } });
    if (res.status === 404) return null;
    if (!res.ok) return undefined;
    return await res.json();
  } catch { return undefined; } finally { clearTimeout(timer); }
}

async function pronounTable(): Promise<Record<string, AlejoPronoun> | null> {
  const hit = await kv.get<Record<string, AlejoPronoun>>(tableKey).catch(() => null);
  if (hit) return hit;
  const fresh = await getJson('/pronouns');
  if (!fresh || typeof fresh !== 'object') return null;
  await kv.set(tableKey, fresh, { ex: DAY }).catch(() => {});
  return fresh as Record<string, AlejoPronoun>;
}

/** What pr.alejo.io says this login uses ("he/him"), or null. Cached for a day, misses included. */
export async function alejoPronouns(login: string): Promise<string | null> {
  if (!/^[a-z0-9_]{1,25}$/.test(login)) return null;
  const cached = await kv.get<{ v: string | null }>(userKey(login)).catch(() => null);
  if (cached && typeof cached === 'object' && 'v' in cached) return cached.v;
  const [user, table] = await Promise.all([getJson(`/users/${encodeURIComponent(login)}`), pronounTable()]);
  if (user === undefined || !table) {
    await kv.set(userKey(login), { v: null }, { ex: FAILED_SECONDS }).catch(() => {});
    return null;
  }
  const v = user ? alejoLabel(user as AlejoUser, table) : null;
  await kv.set(userKey(login), { v }, { ex: DAY }).catch(() => {});
  return v;
}

/** The pronouns to show for a collector, from their setting. Never throws. */
export async function pronounsFor(login: string, p: Pronouns): Promise<string | null> {
  try {
    if (p.mode === 'set') return pronounLabel(p.value);
    if (p.mode === 'alejo') return await alejoPronouns(login.toLowerCase());
  } catch { /* nothing shown */ }
  return null;
}
