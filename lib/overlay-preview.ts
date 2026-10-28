// The overlay preview key (ROADMAP 57.10). TCG Bridge's "Preview overlay" window loads /overlay.html?pk=<key>. The key is made only for a staff-enabled PC
// (bridge-staff.ts `preview-url`), lives 2 hours, and is NOT the OBS overlay key (lib/overlay-key.ts): it opens exactly two things, the preview feed on the
// queue route and the read-only collection list. Heartbeats, "collection shown", saving a pull and the real queue all ignore it, so the window only watches.
//
// Watching without taking: the real queue is popped by the OBS overlay, so a second reader would steal pulls. Instead enqueueEvent copies each new event
// into a short feed while a preview key exists (`mirrorForPreview`). The copy has no ticket (a new random id, no `paid`), so the window cannot save a pull
// either; it plays the draw dry (nothing is written).
import { randomBytes } from 'node:crypto';
import { kv } from './db';
import type { QueuedEvent } from './webhooks';

export const PREVIEW_KEY_HEADER = 'x-preview-key';
export const PREVIEW_TTL_S = 2 * 60 * 60;
/** The feed keeps this many copies, and a copy older than this is not played. */
const FEED_MAX = 20;
const FEED_FRESH_MS = 60_000;
const SHAPE = /^[a-f0-9]{48}$/;
const keyOf = (token: string) => `overlay:preview:key:${token}`;
const ON = 'overlay:preview:on';
const FEED = 'overlay:preview:feed';

/** A new key for a staff PC. `by` is who asked (the PC's name), kept only so a stray key can be traced. */
export async function issuePreviewKey(by: string): Promise<{ token: string; expiresAt: number }> {
  const token = randomBytes(24).toString('hex');
  await kv.set(keyOf(token), { by, at: Date.now() }, { ex: PREVIEW_TTL_S });
  await kv.set(ON, 1, { ex: PREVIEW_TTL_S }); // enqueueEvent copies events only while this exists
  return { token, expiresAt: Date.now() + PREVIEW_TTL_S * 1000 };
}

/** The address path the app opens on the paired site. */
export const previewPath = (token: string) => `/overlay.html?pk=${token}`;

/** Is this a live preview key? Never throws: any doubt is a no. */
export async function isPreviewKey(given: string | null | undefined): Promise<boolean> {
  try {
    return typeof given === 'string' && SHAPE.test(given) && (await kv.get(keyOf(given))) != null;
  } catch {
    return false;
  }
}

export const isPreviewRequest = (req: Request) => isPreviewKey(req.headers.get(PREVIEW_KEY_HEADER));

/** Called by enqueueEvent: a ticket-less copy for the preview window, only while a preview key is live. Never throws. */
export async function mirrorForPreview(event: QueuedEvent): Promise<void> {
  try {
    if ((await kv.get(ON)) == null) return;
    const copy: QueuedEvent = { ...event, id: `p-${crypto.randomUUID()}` };
    delete copy.paid;
    await kv.lpush(FEED, copy);
    await kv.ltrim(FEED, 0, FEED_MAX - 1);
  } catch { /* the preview misses one event; the real queue is untouched */ }
}

/**
 * What the preview window asks for: the oldest copy queued after `since` (ms, from this server's clock), and the clock. `since` null = the window just
 * opened: nothing is replayed, it only learns the time. Reads only; the real queue is never touched.
 */
export async function previewFeed(since: number | null, now = Date.now()): Promise<{ event: QueuedEvent | null; now: number }> {
  if (since === null) return { event: null, now };
  const copies = ((await kv.lrange<QueuedEvent>(FEED, 0, -1)) ?? []).reverse();
  return { event: copies.find(e => e.queuedAt > since && now - e.queuedAt < FEED_FRESH_MS) ?? null, now };
}
