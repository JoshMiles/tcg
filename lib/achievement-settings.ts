import { kv } from './db';
import { RARITIES } from './rarity';
import { VARIANTS, VARIANT_LABELS } from './variants';

// Staff list of the built-in achievement kinds (Admin → Settings → Achievements). KV `achievements:settings`.
// A missing row means on, with the built-in title and detail. There is no way to invent a new goal here.

export const TITLE_MAX = 80;
export const DETAIL_MAX = 200;

const KEY = 'achievements:settings';

export interface AchievementKind {
  kind: string;
  /** The row name in the editor. The player-facing title is separate, and includes the season name. */
  label: string;
  group: 'Set' | 'Rarity' | 'Version' | 'Edition number';
}

export const ACHIEVEMENT_KINDS: readonly AchievementKind[] = [
  { kind: 'complete', label: 'Completed set', group: 'Set' },
  { kind: 'master', label: 'Master set', group: 'Set' },
  ...[...RARITIES].sort((a, b) => a.stars - b.stars).map(r => ({ kind: `tier-${r.stars}`, label: `All ${r.label}`, group: 'Rarity' as const })),
  ...VARIANTS.filter(v => v !== 'regular').map(v => ({ kind: `all-${v}`, label: `All ${VARIANT_LABELS[v]}`, group: 'Version' as const })),
  { kind: 'first-edition', label: 'First edition', group: 'Edition number' },
  { kind: 'first-shiny', label: 'First shiny edition', group: 'Edition number' },
  { kind: 'five-firsts', label: 'Five firsts', group: 'Edition number' },
  { kind: 'early-bird', label: 'Early bird', group: 'Edition number' },
];

const KNOWN = new Set(ACHIEVEMENT_KINDS.map(k => k.kind));

export interface AchievementRowSetting {
  on: boolean;
  /** Empty means the built-in title. */
  title: string;
  /** Empty means the built-in detail. */
  detail: string;
}

/** Only rows that differ from the default (on, blank title, blank detail). */
export type AchievementSettings = Record<string, AchievementRowSetting>;

const clip = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Drops unknown kinds, caps the text, and leaves out rows that are still the default. */
export function normalizeAchievementSettings(input: unknown): AchievementSettings {
  const out: AchievementSettings = {};
  if (!input || typeof input !== 'object') return out;
  const raw = input as Record<string, unknown>;
  for (const kind of KNOWN) {
    const row = raw[kind];
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const on = r.on !== false;
    const title = clip(r.title, TITLE_MAX);
    const detail = clip(r.detail, DETAIL_MAX);
    if (on && !title && !detail) continue;
    out[kind] = { on, title, detail };
  }
  return out;
}

/** The checkbox is omitted when it is off, so a missing `on:<kind>` means off. */
export function achievementSettingsFromForm(formData: FormData): AchievementSettings {
  const raw: Record<string, AchievementRowSetting> = {};
  for (const kind of KNOWN) {
    raw[kind] = {
      on: formData.get(`on:${kind}`) === 'on',
      title: String(formData.get(`title:${kind}`) ?? ''),
      detail: String(formData.get(`detail:${kind}`) ?? ''),
    };
  }
  return normalizeAchievementSettings(raw);
}

export function disabledKinds(settings: AchievementSettings): Set<string> {
  return new Set(Object.entries(settings).filter(([, row]) => !row.on).map(([kind]) => kind));
}

/** Shows a saved title or detail in place of the built-in words. A blank override keeps what the achievement already says. */
export function applyAchievementText<T extends { id: string; seasonId: string; title: string; detail: string }>(a: T, settings: AchievementSettings): T {
  if (a.seasonId === 'special') return a;
  const row = settings[a.id.slice(a.seasonId.length + 1)];
  if (!row) return a;
  const title = row.title || a.title;
  const detail = row.detail || a.detail;
  if (title === a.title && detail === a.detail) return a;
  return { ...a, title, detail };
}

export function rowSetting(settings: AchievementSettings, kind: string): AchievementRowSetting {
  return settings[kind] ?? { on: true, title: '', detail: '' };
}

export async function getAchievementSettings(): Promise<AchievementSettings> {
  try {
    return normalizeAchievementSettings(await kv.get(KEY));
  } catch {
    return {};
  }
}

export async function saveAchievementSettings(settings: AchievementSettings): Promise<void> {
  const clean = normalizeAchievementSettings(settings);
  if (Object.keys(clean).length === 0) await kv.del(KEY);
  else await kv.set(KEY, clean);
}
