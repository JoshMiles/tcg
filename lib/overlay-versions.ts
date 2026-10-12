import { kv } from './db';
import { sanitizeLayout, type OverlayLayout } from './overlay-layout';
import { sanitizePropValues, type PropValues } from './overlay-props';
import { getOverlaySettings, getPackOverrides, savePackOverrides, saveOverlaySettings } from './overlay-settings';

// Saved versions of the Overlay Editor: every save keeps a snapshot of the whole look (layout, global values, per-pack overrides)
// so a bad change is one click from undone. The newest 20 are kept in KV `overlay:versions` (newest first).

const KEY = 'overlay:versions';
const CAP = 20;

export interface OverlayVersion {
  id: string;
  at: number;
  note: string;
  layout: OverlayLayout;
  props: PropValues;
  packs: Record<string, PropValues>;
}

export async function listVersions(): Promise<OverlayVersion[]> {
  const raw = await kv.get<OverlayVersion[]>(KEY).catch(() => null);
  return (Array.isArray(raw) ? raw : [])
    .filter(v => v && typeof v.id === 'string')
    .map(v => ({
      id: v.id,
      at: Number(v.at) || 0,
      note: String(v.note ?? '').slice(0, 80),
      layout: sanitizeLayout(v.layout),
      props: sanitizePropValues(v.props),
      packs: Object.fromEntries(Object.entries(v.packs ?? {}).map(([id, p]) => [id, sanitizePropValues(p, { keepDefaults: true })])),
    }));
}

/** Snapshots the current saved state. */
export async function recordVersion(note: string): Promise<void> {
  const [settings, packs, all] = await Promise.all([getOverlaySettings(), getPackOverrides(), listVersions()]);
  const entry: OverlayVersion = { id: Math.random().toString(36).slice(2, 10), at: Date.now(), note: note.trim().slice(0, 80), layout: settings.layout, props: settings.props, packs };
  await kv.set(KEY, [entry, ...all].slice(0, CAP));
}

export async function deleteVersion(id: string): Promise<void> {
  await kv.set(KEY, (await listVersions()).filter(v => v.id !== id));
}

/** Writes a version back as the live look (used by the scripted checks; the editor loads versions client-side and saves normally). */
export async function applyVersion(v: OverlayVersion): Promise<void> {
  const current = await getOverlaySettings();
  await saveOverlaySettings({ ...current, layout: v.layout, props: v.props });
  const existing = await getPackOverrides();
  for (const id of new Set([...Object.keys(existing), ...Object.keys(v.packs)])) await savePackOverrides(id, v.packs[id] ?? {});
}
