import { kv } from './db';
import { fetchTwitchAvatars, twitchCredentials } from './twitch-helix';

// Twitch profile pictures, cached in one KV hash so pages don't hit Twitch on every render.
// Entries: login → { url, at }. url '' means "looked up, no avatar" (cached shorter so new accounts appear).
const KEY = 'twitch:avatars';
const TTL_FOUND = 7 * 24 * 60 * 60 * 1000;
const TTL_MISSING = 24 * 60 * 60 * 1000;
const VALID_LOGIN = /^[a-z0-9_]{1,25}$/; // anything else (e.g. "mrbeast#") can't be a Twitch login

type Entry = { url: string; at: number };

/**
 * Twitch serves avatars at fixed sizes (28, 50, 70, 150, 300, 600) selected by filename suffix.
 * Pass roughly 2x the displayed size for crisp retina rendering.
 */
export function sizeTwitchAvatar(url: string, px: 28 | 50 | 70 | 150 | 300): string {
  return url.replace(/-\d+x\d+(\.\w+)$/, `-${px}x${px}$1`);
}

/**
 * Returns login → avatar URL for the given usernames. Missing/stale entries are fetched from
 * Twitch in one batch and cached. Never throws: if Twitch or KV is unavailable, users simply
 * come back without an avatar and the UI falls back to initials.
 */
export async function getAvatars(usernames: string[]): Promise<Record<string, string>> {
  const names = [...new Set(usernames.map(u => u.toLowerCase()).filter(u => VALID_LOGIN.test(u)))];
  if (names.length === 0) return {};

  try {
    const cache = (await kv.hgetall<Record<string, Entry>>(KEY)) ?? {};
    const now = Date.now();
    const stale = names.filter(n => {
      const e = cache[n];
      return !e || now - e.at > (e.url ? TTL_FOUND : TTL_MISSING);
    });

    if (stale.length > 0 && twitchCredentials()) {
      try {
        const found = await fetchTwitchAvatars(stale);
        const updates: Record<string, Entry> = {};
        for (const n of stale) updates[n] = { url: found[n] ?? '', at: now };
        await kv.hset(KEY, updates);
        Object.assign(cache, updates);
      } catch {
        // Keep serving whatever is cached (even stale) rather than failing the page.
      }
    }

    return Object.fromEntries(names.filter(n => cache[n]?.url).map(n => [n, cache[n].url]));
  } catch {
    return {};
  }
}
