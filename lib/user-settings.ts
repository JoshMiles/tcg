// A viewer's own settings (client-safe, pure). Stored sparsely in KV by lib/user-settings-store.ts; everything here is
// validated on the way in, so a crafted request can never store an unknown key or an out-of-range value.

export const BIO_MAX = 160;

export type MotionPref = 'system' | 'reduce';

export interface UserSettings {
  /** A short line shown under their name on their profile. */
  bio: string;
  /** Leave them off the public leaderboard, card owner lists and recent pulls (their own page still works). */
  privateProfile: boolean;
  /** Bell + trade-page notices for new offers and counters. */
  notifyOffers: boolean;
  /** Bell notices for how their own offers ended (accepted, declined, expired...). */
  notifyResults: boolean;
  /** Accept direct trade offers from other viewers (the open board is unaffected). */
  allowOffers: boolean;
  /** 'reduce' calms the site's animations even when the device does not ask for it. */
  motion: MotionPref;
  /** Start collection grids with uncollected cards hidden. */
  hideUncollected: boolean;
  /** Smaller card tiles in grids. */
  compactGrids: boolean;
  /** Ids of switched-on experimental features (see EXPERIMENTS). */
  experiments: string[];
}

export const DEFAULT_SETTINGS: UserSettings = {
  bio: '',
  privateProfile: false,
  notifyOffers: true,
  notifyResults: true,
  allowOffers: true,
  motion: 'system',
  hideUncollected: true,
  compactGrids: false,
  experiments: [],
};

export interface Experiment { id: string; label: string; description: string }

/** Opt-in features that are still settling. Switching one on only changes this viewer's own browser. */
export const EXPERIMENTS: Experiment[] = [
  { id: 'shortcuts', label: 'Keyboard shortcuts', description: 'Press g then h, c, l, s, d, t or a to jump to Home, Collection, Leaderboard, Stats, Card Dex, Trade or My stats. Press ? for the list. Off while you are typing.' },
];

const EXPERIMENT_IDS = new Set(EXPERIMENTS.map(e => e.id));

export const BOOLEAN_KEYS = ['privateProfile', 'notifyOffers', 'notifyResults', 'allowOffers', 'hideUncollected', 'compactGrids'] as const;

/** Anything → a complete, valid settings object. Unknown keys are dropped, bad values fall back to the default. */
export function sanitizeUserSettings(input: unknown): UserSettings {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const out: UserSettings = { ...DEFAULT_SETTINGS, experiments: [] };
  if (typeof o.bio === 'string') out.bio = o.bio.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, BIO_MAX);
  for (const k of BOOLEAN_KEYS) if (typeof o[k] === 'boolean') out[k] = o[k] as boolean;
  if (o.motion === 'reduce' || o.motion === 'system') out.motion = o.motion;
  if (Array.isArray(o.experiments)) out.experiments = [...new Set(o.experiments.filter((x): x is string => typeof x === 'string' && EXPERIMENT_IDS.has(x)))];
  return out;
}

/** Only what differs from the defaults (what is actually stored). */
export function sparse(s: UserSettings): Partial<UserSettings> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s)) if (JSON.stringify(v) !== JSON.stringify((DEFAULT_SETTINGS as unknown as Record<string, unknown>)[k])) out[k] = v;
  return out as Partial<UserSettings>;
}

export const hasExperiment = (s: UserSettings, id: string) => s.experiments.includes(id);

export type NoticeGroup = 'offers' | 'results';
/** Which settings switch governs a notice kind (admin notices are never silenced). */
export function noticeGroup(kind: string): NoticeGroup | null {
  if (kind === 'offer' || kind === 'countered') return 'offers';
  if (kind === 'accepted' || kind === 'declined' || kind === 'cancelled' || kind === 'expired') return 'results';
  return null;
}

/** Should a notice of this kind reach this viewer? */
export function wantsNotice(s: UserSettings, kind: string): boolean {
  const g = noticeGroup(kind);
  return g === 'offers' ? s.notifyOffers : g === 'results' ? s.notifyResults : true;
}
