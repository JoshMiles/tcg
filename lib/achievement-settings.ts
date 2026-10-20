import { kv } from './db';
import { RARITIES } from './rarity';
import { GOLDEN_PULLS, VARIANTS, VARIANT_LABELS } from './variants';
import { DETAIL_MAX, TITLE_MAX, achVars, defaultText, fillText, normalizeCustomGoals, type CustomGoal } from './achievements';

// Staff list of the built-in achievement kinds (Admin → Achievements). KV `achievements:settings`.
// A missing row means on, with the built-in title and detail (templates in lib/achievements.ts). Staff-made goals live in KV `achievements:custom`.

export { DETAIL_MAX, TITLE_MAX };

const KEY = 'achievements:settings';

export interface AchievementKind {
  kind: string;
  /** The row name in the editor. The player-facing title is separate, and includes the season name. */
  label: string;
  group: 'Set' | 'Rarity' | 'Version' | 'Edition number' | 'Trading';
}

export const ACHIEVEMENT_KINDS: readonly AchievementKind[] = [
  { kind: 'complete', label: 'Completed set', group: 'Set' },
  { kind: 'master', label: 'Master set', group: 'Set' },
  ...[...RARITIES].sort((a, b) => a.stars - b.stars).map(r => ({ kind: `tier-${r.stars}`, label: `All ${r.label}`, group: 'Rarity' as const })),
  ...VARIANTS.filter(v => v !== 'regular' && (GOLDEN_PULLS || v !== 'golden')).map(v => ({ kind: `all-${v}`, label: `All ${VARIANT_LABELS[v]}`, group: 'Version' as const })),
  { kind: 'first-edition', label: 'First edition', group: 'Edition number' },
  { kind: 'first-shiny', label: 'First Full Art Holo edition', group: 'Edition number' },
  { kind: 'five-firsts', label: 'Five firsts', group: 'Edition number' },
  { kind: 'early-bird', label: 'Early bird', group: 'Edition number' },
  { kind: 'first-trade', label: 'First trade', group: 'Trading' },
  { kind: 'ten-trades', label: 'Ten trades', group: 'Trading' },
];

const KNOWN = new Set(ACHIEVEMENT_KINDS.map(k => k.kind));

export interface AchievementRowSetting {
  on: boolean;
  /** Empty means the built-in title. */
  title: string;
  /** Empty means the built-in detail. */
  detail: string;
  /** Optional bonus buff definition id (from trainer:buffs, scope: self). */
  buffId?: string;
}

/** Only rows that differ from the default (on, blank title, blank detail, no bonus). */
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
    const def = defaultText(kind);
    let title = clip(r.title, TITLE_MAX);
    let detail = clip(r.detail, DETAIL_MAX);
    if (title === def.title) title = ''; // text equal to the default stores nothing
    if (detail === def.detail) detail = '';
    const buffId = typeof r.buffId === 'string' && r.buffId.trim() ? r.buffId.trim().slice(0, 60) : undefined;
    if (on && !title && !detail && !buffId) continue;
    out[kind] = { on, title, detail, ...(buffId ? { buffId } : {}) };
  }
  return out;
}

/** The checkbox is omitted when it is off, so a missing `on:<kind>` means off. */
export function achievementSettingsFromForm(formData: FormData): AchievementSettings {
  const raw: Record<string, AchievementRowSetting> = {};
  for (const kind of KNOWN) {
    const buffVal = formData.get(`buff:${kind}`);
    const buffId = typeof buffVal === 'string' && buffVal.trim() ? buffVal.trim().slice(0, 60) : undefined;
    raw[kind] = {
      on: formData.get(`on:${kind}`) === 'on',
      title: String(formData.get(`title:${kind}`) ?? ''),
      detail: String(formData.get(`detail:${kind}`) ?? ''),
      ...(buffId ? { buffId } : {}),
    };
  }
  return normalizeAchievementSettings(raw);
}

export function disabledKinds(settings: AchievementSettings): Set<string> {
  return new Set(Object.entries(settings).filter(([, row]) => !row.on).map(([kind]) => kind));
}

/** Shows a saved title or detail in place of the built-in words, with its placeholders filled from the achievement. A blank override keeps what the achievement already says. */
export function applyAchievementText<T extends { id: string; seasonId: string; seasonName: string; title: string; detail: string; need: number; cutoff?: number }>(a: T, settings: AchievementSettings): T {
  if (a.seasonId === 'special') return a;
  const row = settings[a.id.slice(a.seasonId.length + 1)];
  if (!row) return a;
  const vars = achVars(a);
  const title = row.title ? fillText(row.title, vars) : a.title;
  const detail = row.detail ? fillText(row.detail, vars) : a.detail;
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

// ── Custom goals ──

const CUSTOM_KEY = 'achievements:custom';

export async function getCustomGoals(): Promise<CustomGoal[]> {
  try {
    return normalizeCustomGoals(await kv.get(CUSTOM_KEY));
  } catch {
    return [];
  }
}

export async function saveCustomGoals(goals: CustomGoal[]): Promise<void> {
  const clean = normalizeCustomGoals(goals);
  if (clean.length === 0) await kv.del(CUSTOM_KEY);
  else await kv.set(CUSTOM_KEY, clean);
}
