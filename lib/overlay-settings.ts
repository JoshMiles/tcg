import { kv } from '@vercel/kv';
import { getOverlayStatus } from './overlay';
import { sanitizeLayout, type OverlayLayout } from './overlay-layout';
import { sanitizePropValues, type PropValues } from './overlay-props';

// Admin switches for the overlay. Stored in one KV key; missing = everything allowed.
const KEY = 'overlay:settings';

export interface OverlaySettings {
  /** Ignore incoming "open a pack" triggers unless the stream is live. */
  livePacksOnly: boolean;
  /** Ignore incoming "show collection" triggers unless the stream is live. */
  liveCollectionsOnly: boolean;
  /** Size/position of the overlay's stage (see lib/overlay-layout.ts). */
  layout: OverlayLayout;
  /** Look & animation properties, sparse: only values that differ from the defaults (see lib/overlay-props.ts). */
  props: PropValues;
}

export async function getOverlaySettings(): Promise<OverlaySettings> {
  const stored = await kv.get<Partial<OverlaySettings>>(KEY).catch(() => null);
  return {
    livePacksOnly: !!stored?.livePacksOnly,
    liveCollectionsOnly: !!stored?.liveCollectionsOnly,
    layout: sanitizeLayout(stored?.layout),
    props: sanitizePropValues(stored?.props),
  };
}

export async function saveOverlaySettings(settings: OverlaySettings): Promise<void> {
  await kv.set(KEY, settings);
}

// ── Per-pack overrides and named presets ──────────────────

const PACK_KEY = 'overlay:packprops';   // { [packId]: sparse PropValues }
const PRESET_KEY = 'overlay:presets';   // OverlayPreset[]

export interface OverlayPreset { id: string; name: string; props: PropValues; updatedAt: number }

export async function getPackOverrides(): Promise<Record<string, PropValues>> {
  const raw = await kv.get<Record<string, unknown>>(PACK_KEY).catch(() => null);
  const out: Record<string, PropValues> = {};
  for (const [packId, v] of Object.entries(raw ?? {})) {
    const clean = sanitizePropValues(v, { keepDefaults: true });
    if (Object.keys(clean).length) out[packId] = clean;
  }
  return out;
}

export async function savePackOverrides(packId: string, props: PropValues): Promise<void> {
  const all = await getPackOverrides();
  const clean = sanitizePropValues(props, { keepDefaults: true });
  if (Object.keys(clean).length) all[packId] = clean; else delete all[packId];
  await kv.set(PACK_KEY, all);
}

export async function listPresets(): Promise<OverlayPreset[]> {
  const raw = await kv.get<OverlayPreset[]>(PRESET_KEY).catch(() => null);
  return (Array.isArray(raw) ? raw : [])
    .filter(p => p && typeof p.id === 'string' && typeof p.name === 'string')
    .map(p => ({ id: p.id, name: p.name.slice(0, 40), props: sanitizePropValues(p.props), updatedAt: Number(p.updatedAt) || 0 }));
}

export async function savePreset(name: string, props: PropValues): Promise<void> {
  const clean = name.trim().slice(0, 40);
  if (!clean) return;
  const all = await listPresets();
  const existing = all.find(p => p.name.toLowerCase() === clean.toLowerCase());
  const entry: OverlayPreset = {
    id: existing?.id ?? Math.random().toString(36).slice(2, 10),
    name: clean,
    props: sanitizePropValues(props),
    updatedAt: Date.now(),
  };
  await kv.set(PRESET_KEY, [...all.filter(p => p.id !== entry.id), entry].slice(-30));
}

export async function deletePreset(id: string): Promise<void> {
  await kv.set(PRESET_KEY, (await listPresets()).filter(p => p.id !== id));
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
