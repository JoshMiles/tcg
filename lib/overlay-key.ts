// The overlay key (ROADMAP 13.2). The OBS overlay is a browser source with no login, so the endpoints it uses to take queued pulls,
// report "collection shown" and check in need something that is not public. The OBS URL carries `?key=<key>`; widget.js sends it as
// the `x-overlay-key` header on every request. A signed-in staff browser (the editor preview, a test tab) needs no key, and a
// sandbox only ever touches its own fake data.
import { timingSafeEqual, randomBytes } from 'node:crypto';
import { kv, inSandbox } from './db';
import { isAuthenticated } from './auth';

const KEY = 'overlay:key';
export const OVERLAY_KEY_HEADER = 'x-overlay-key';

/** The key, made on first use. */
export async function getOverlayKey(): Promise<string> {
  const have = await kv.get<string>(KEY);
  if (typeof have === 'string' && have.length >= 16) return have;
  const fresh = randomBytes(18).toString('hex');
  await kv.set(KEY, fresh, { nx: true });
  return (await kv.get<string>(KEY)) ?? fresh; // a parallel request may have won the race: use its key
}

/** Replaces the key; every OBS source needs the new URL after this. */
export async function regenerateOverlayKey(): Promise<string> {
  const fresh = randomBytes(18).toString('hex');
  await kv.set(KEY, fresh);
  return fresh;
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Pure part: does the header value match the key? */
export function keyMatches(given: string | null | undefined, key: string): boolean {
  return typeof given === 'string' && given.length > 0 && same(given, key);
}

/** May this request act as the overlay? Right key, a staff session, or a sandbox. Never throws: any doubt is a no. */
export async function isOverlayRequest(req: Request): Promise<boolean> {
  try {
    if (keyMatches(req.headers.get(OVERLAY_KEY_HEADER), await getOverlayKey())) return true;
    if (await inSandbox()) return true;
    return await isAuthenticated();
  } catch {
    return false;
  }
}

/** The OBS browser-source address, with the key. `params` are extra query parameters (preset, dev ...). */
export function overlayUrl(origin: string, key: string, params: Record<string, string> = {}): string {
  const q = new URLSearchParams({ ...params, key });
  return `${origin}/overlay.html?${q.toString()}`;
}
