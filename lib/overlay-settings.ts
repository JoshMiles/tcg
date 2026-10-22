import { kv } from './db';
import { getOverlayStatus } from './overlay';
import { sanitizeLayout, sanitizeZones, type OverlayLayout, type OverlayZone } from './overlay-layout';
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
  /** After saving in the Overlay Editor, connected overlays reload themselves (when idle). */
  autoReload: boolean;
  /** Editor-only Twitch UI zones (webcam, chat, alerts) per scope: 'global' or 'scene:<id>'. Never part of the overlay config. */
  zones: Record<string, OverlayZone[]>;
}

export async function getOverlaySettings(): Promise<OverlaySettings> {
  const stored = await kv.get<Partial<OverlaySettings>>(KEY).catch(() => null);
  return {
    livePacksOnly: !!stored?.livePacksOnly,
    liveCollectionsOnly: !!stored?.liveCollectionsOnly,
    layout: sanitizeLayout(stored?.layout),
    props: sanitizePropValues(stored?.props),
    autoReload: !!stored?.autoReload,
    zones: Object.fromEntries(Object.entries(stored?.zones ?? {}).map(([k, z]) => [k, sanitizeZones(z)] as const).filter(([, z]) => z.length)),
  };
}

/** Saves one scope's zones, clamped to that scope's stage; an empty list clears them. */
export async function saveZones(scope: string, zones: unknown): Promise<OverlayZone[]> {
  const current = await getOverlaySettings();
  const layout = scope === 'global' ? current.layout : (await getPreset(scope.replace(/^scene:/, '')))?.layout;
  if (!layout) return [];
  const clean = sanitizeZones(zones, layout.width, layout.height);
  const { [scope]: _old, ...rest } = current.zones;
  await saveOverlaySettings({ ...current, zones: clean.length ? { ...rest, [scope]: clean } : rest });
  return clean;
}

export async function saveOverlaySettings(settings: OverlaySettings): Promise<void> {
  await kv.set(KEY, settings);
}

// ── Per-pack overrides and named presets ──────────────────

const PACK_KEY = 'overlay:packprops';   // { [packId]: sparse PropValues }
const PRESET_KEY = 'overlay:presets';   // OverlayPreset[]

/**
 * A named look, and (optionally) its own layout. A preset with a layout is a "scene": it has its own overlay URL
 * (/overlay.html?preset=<id>) so a different OBS scene (a vertical one, a different canvas size) can use its own stage size and
 * placement and its own values on top of the global look. A preset without a layout keeps using the global layout.
 */
export interface OverlayPreset { id: string; name: string; props: PropValues; layout?: OverlayLayout; updatedAt: number }

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
    // keepDefaults: a scene's value equal to the default must survive (it overrides a global value that is not the default).
    .map(p => ({ id: p.id, name: p.name.slice(0, 40), props: sanitizePropValues(p.props, { keepDefaults: true }), ...(p.layout ? { layout: sanitizeLayout(p.layout) } : {}), updatedAt: Number(p.updatedAt) || 0 }));
}

export async function savePreset(name: string, props: PropValues, layout?: OverlayLayout | null): Promise<string | null> {
  const clean = name.trim().slice(0, 40);
  if (!clean) return null;
  const all = await listPresets();
  const existing = all.find(p => p.name.toLowerCase() === clean.toLowerCase());
  const entry: OverlayPreset = {
    id: existing?.id ?? Math.random().toString(36).slice(2, 10),
    name: clean,
    props: sanitizePropValues(props),
    // A new layout replaces the old one; leaving it out keeps what the preset already had.
    ...(layout ? { layout: sanitizeLayout(layout) } : existing?.layout ? { layout: existing.layout } : {}),
    updatedAt: Date.now(),
  };
  await kv.set(PRESET_KEY, [...all.filter(p => p.id !== entry.id), entry].slice(-30));
  return entry.id;
}

/** Saves the edits made to a scene in the Overlay Editor: its own values (overrides on top of the global look) and/or its layout. */
export async function updateScene(id: string, patch: { props?: PropValues; layout?: OverlayLayout }): Promise<boolean> {
  const all = await listPresets();
  const existing = all.find(p => p.id === id);
  if (!existing) return false;
  const next: OverlayPreset = {
    ...existing,
    props: patch.props !== undefined ? sanitizePropValues(patch.props, { keepDefaults: true }) : existing.props,
    ...(patch.layout ? { layout: sanitizeLayout(patch.layout) } : {}),
    updatedAt: Date.now(),
  };
  await kv.set(PRESET_KEY, all.map(p => (p.id === id ? next : p)));
  return true;
}

export async function getPreset(id: string | null | undefined): Promise<OverlayPreset | null> {
  if (!id) return null;
  return (await listPresets()).find(p => p.id === id) ?? null;
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

// ── Live refresh ──────────────────────────────────────────

const RELOAD_KEY = 'overlay:reload';

/** A token the overlay compares on every heartbeat; when it changes the overlay reloads itself (once it is idle). */
export async function getReloadToken(): Promise<number> {
  return Number(await kv.get(RELOAD_KEY).catch(() => 0)) || 0;
}

export async function bumpReloadToken(): Promise<void> {
  await kv.set(RELOAD_KEY, Date.now());
}

// ── Seasonal looks: a preset layered over the global values while a season is active ──

const SEASON_LOOK_KEY = 'overlay:seasonlooks';   // { [seasonId]: presetId }

export async function getSeasonLooks(): Promise<Record<string, string>> {
  const raw = await kv.get<Record<string, unknown>>(SEASON_LOOK_KEY).catch(() => null);
  return Object.fromEntries(Object.entries(raw ?? {}).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
}

export async function setSeasonLook(seasonId: string, presetId: string | null): Promise<void> {
  const all = await getSeasonLooks();
  if (presetId) all[seasonId] = presetId; else delete all[seasonId];
  await kv.set(SEASON_LOOK_KEY, all);
}

/** The preset applied for a season (by id), if it still exists. */
export async function getSeasonLookPreset(seasonId: string | null | undefined): Promise<OverlayPreset | null> {
  if (!seasonId) return null;
  const id = (await getSeasonLooks())[seasonId];
  if (!id) return null;
  return (await listPresets()).find(p => p.id === id) ?? null;
}

// ── Scheduled looks: a preset that switches on at a start time and off at an end (a Halloween stream) ──

const SCHEDULE_KEY = 'overlay:scheduledlooks';
const SCHEDULE_MAX = 20;
const SCHEDULE_KEEP_MS = 30 * 24 * 3600_000;   // entries that ended longer ago than this are dropped on write

/** Start / end are epoch ms (UTC); the admin UI enters and shows them in the browser's time zone. */
export interface ScheduledLook { id: string; presetId: string; start: number; end: number }

export async function getScheduledLooks(): Promise<ScheduledLook[]> {
  const raw = await kv.get<unknown>(SCHEDULE_KEY).catch(() => null);
  if (!Array.isArray(raw)) return [];
  return raw.filter((e): e is ScheduledLook => !!e && typeof e.id === 'string' && typeof e.presetId === 'string'
    && Number.isFinite(e.start) && Number.isFinite(e.end) && e.start < e.end).slice(0, SCHEDULE_MAX);
}

export async function addScheduledLook(presetId: string, start: number, end: number, now = Date.now()): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) return { ok: false, message: 'The end must be after the start.' };
  if (!(await listPresets()).some(p => p.id === presetId)) return { ok: false, message: 'That preset no longer exists.' };
  const kept = (await getScheduledLooks()).filter(e => e.end > now - SCHEDULE_KEEP_MS);
  if (kept.length >= SCHEDULE_MAX) return { ok: false, message: `At most ${SCHEDULE_MAX} scheduled looks. Remove one first.` };
  kept.push({ id: Math.random().toString(36).slice(2, 10), presetId, start, end });
  await kv.set(SCHEDULE_KEY, kept);
  return { ok: true };
}

export async function removeScheduledLook(id: string): Promise<void> {
  await kv.set(SCHEDULE_KEY, (await getScheduledLooks()).filter(e => e.id !== id));
}

/** The schedule running now (when two overlap, the one that started latest wins) and its preset, if that still exists. */
const runningLook = (looks: ScheduledLook[], now: number) => looks.filter(e => e.start <= now && now < e.end).sort((a, b) => b.start - a.start)[0];

export async function getActiveScheduledLook(now = Date.now()): Promise<{ look: ScheduledLook; preset: OverlayPreset | null } | null> {
  const look = runningLook(await getScheduledLooks(), now);
  if (!look) return null;
  return { look, preset: (await listPresets()).find(p => p.id === look.presetId) ?? null };
}

/** What the heartbeat sends: the stored refresh token plus the active schedule, so the overlay reloads by itself at each start / end. */
export async function getReloadSignal(now = Date.now()): Promise<string> {
  // Reads only the schedule list (not the presets): this runs on every overlay's 10 s ping.
  const [token, looks] = await Promise.all([getReloadToken(), getScheduledLooks()]);
  return `${token}:${runningLook(looks, now)?.id ?? ''}`;
}
