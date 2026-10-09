import { kv } from '@vercel/kv';
import { getOverlayStatus } from './overlay';

// Admin switches for the overlay. Stored in one KV key; missing = everything allowed.
const KEY = 'overlay:settings';

export interface OverlaySettings {
  /** Ignore incoming "open a pack" triggers unless the stream is live. */
  livePacksOnly: boolean;
  /** Ignore incoming "show collection" triggers unless the stream is live. */
  liveCollectionsOnly: boolean;
}

const DEFAULTS: OverlaySettings = { livePacksOnly: false, liveCollectionsOnly: false };

export async function getOverlaySettings(): Promise<OverlaySettings> {
  const stored = await kv.get<Partial<OverlaySettings>>(KEY).catch(() => null);
  return { ...DEFAULTS, livePacksOnly: !!stored?.livePacksOnly, liveCollectionsOnly: !!stored?.liveCollectionsOnly };
}

export async function saveOverlaySettings(settings: OverlaySettings): Promise<void> {
  await kv.set(KEY, settings);
}

/**
 * Whether an incoming trigger should be dropped because of the "only when live" switches.
 * "Not live" means no overlay is open, or OBS says it isn't streaming. If OBS didn't tell the overlay
 * (no "read status" permission) we can't know, so the trigger is allowed rather than silently swallowed.
 * Returns the reason when blocked, null when allowed. Fails open on errors.
 */
export async function liveGate(kind: 'pull' | 'collection'): Promise<string | null> {
  try {
    const settings = await getOverlaySettings();
    if (!(kind === 'pull' ? settings.livePacksOnly : settings.liveCollectionsOnly)) return null;
    const status = await getOverlayStatus();
    if (status.connected === 0) return 'The overlay is not open, so the stream is not live';
    if (status.streaming === false) return 'The stream is not live';
    return null;
  } catch {
    return null;
  }
}
