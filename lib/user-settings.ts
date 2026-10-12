// A viewer's own settings (client-safe, pure). Stored sparsely in KV by lib/user-settings-store.ts; everything here is
// validated on the way in, so a crafted request can never store an unknown key or an out-of-range value.

export const BIO_MAX = 160;

import { sanitizeProfileLayout, type ProfilePlacement } from './profile-widgets';
import { UID_BASE } from './serials-core';
import { VARIANTS } from './variants';
import type { Variant } from './types';

export const WANTED_MAX = 6;
/** Saved listing alerts: tell me when someone lists this card (in this version, or any). */
export const WATCH_MAX = 10;
export interface Watch { card: number; variant: Variant | null }
/** Header colours for the Profile accent experiment. */
export const ACCENTS = [
  { id: 'cheddar', label: 'Cheddar', hex: '#facc15' }, { id: 'ember', label: 'Ember', hex: '#fb923c' }, { id: 'rose', label: 'Rose', hex: '#fb7185' },
  { id: 'grape', label: 'Grape', hex: '#c084fc' }, { id: 'ocean', label: 'Ocean', hex: '#38bdf8' }, { id: 'mint', label: 'Mint', hex: '#34d399' },
] as const;
export const accentHex = (id: string) => ACCENTS.find(a => a.id === id)?.hex;

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
  /** Bell notices when someone lists a card on their Looking for list or one of their saved alerts. */
  notifyWatch: boolean;
  /** Accept direct trade offers from other viewers (the open board is unaffected). */
  allowOffers: boolean;
  /** 'reduce' calms the site's animations even when the device does not ask for it. */
  motion: MotionPref;
  /** Start collection grids with uncollected cards hidden. */
  hideUncollected: boolean;
  /** Smaller card tiles in grids. */
  compactGrids: boolean;
  /** Header colour (an ACCENTS id) shown on their own profile while the 'accent' experiment is on. */
  accent: string;
  /** Card numbers they are looking for (the Looking for widget on their profile). */
  wanted: number[];
  /** Saved listing alerts (see Watch). A card on the Looking for list alerts too, in any version. */
  watches: Watch[];
  /** The unique number (Copy.uid) of the copy they pinned as their profile's Showcase copy, or null. Checked against the live owner whenever it is shown. */
  pinned: number | null;
  /** The widgets of their profile Overview, in order (null = the default layout). */
  profileLayout: ProfilePlacement[] | null;
  /** Ids of switched-on experimental features (see EXPERIMENTS). */
  experiments: string[];
}

export const DEFAULT_SETTINGS: UserSettings = {
  bio: '',
  privateProfile: false,
  notifyOffers: true,
  notifyResults: true,
  notifyWatch: true,
  allowOffers: true,
  motion: 'system',
  hideUncollected: true,
  compactGrids: false,
  accent: '',
  wanted: [],
  watches: [],
  pinned: null,
  profileLayout: null,
  experiments: [],
};

export interface Experiment { id: string; label: string; description: string }

/** Opt-in features that are still settling. The 'shortcuts' one changes only this viewer's browser; the profile ones change how their own public profile looks. */
export const EXPERIMENTS: Experiment[] = [
  { id: 'shortcuts', label: 'Keyboard shortcuts', description: 'Press g then h, c, l, s, d, t or a to jump to Home, Collection, Leaderboard, Stats, Card Dex, Trade or My stats. Press ? for the list. Off while you are typing.' },
  { id: 'accent', label: 'Profile accent', description: 'Colour your public profile header. Pick the colour below once this is on.' },
];

const EXPERIMENT_IDS = new Set(EXPERIMENTS.map(e => e.id));

export const BOOLEAN_KEYS = ['privateProfile', 'notifyOffers', 'notifyResults', 'notifyWatch', 'allowOffers', 'hideUncollected', 'compactGrids'] as const;

/** Anything → a complete, valid settings object. Unknown keys are dropped, bad values fall back to the default. */
export function sanitizeUserSettings(input: unknown): UserSettings {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const out: UserSettings = { ...DEFAULT_SETTINGS, experiments: [], watches: [] };
  if (typeof o.bio === 'string') out.bio = o.bio.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, BIO_MAX);
  for (const k of BOOLEAN_KEYS) if (typeof o[k] === 'boolean') out[k] = o[k] as boolean;
  if (o.motion === 'reduce' || o.motion === 'system') out.motion = o.motion;
  if (typeof o.accent === 'string' && ACCENTS.some(a => a.id === o.accent)) out.accent = o.accent;
  if (Array.isArray(o.wanted)) out.wanted = [...new Set(o.wanted.filter((n): n is number => Number.isInteger(n) && n >= 1 && n < 1_000_000))].slice(0, WANTED_MAX);
  if (Array.isArray(o.watches)) {
    const seen = new Set<string>();
    for (const w of o.watches) {
      const card = Number((w as { card?: unknown })?.card);
      const v = (w as { variant?: unknown })?.variant;
      const variant: Variant | null = typeof v === 'string' && (VARIANTS as readonly string[]).includes(v) ? (v as Variant) : null;
      if (!Number.isInteger(card) || card < 1 || card >= 1_000_000 || seen.has(`${card}|${variant}`) || out.watches.length >= WATCH_MAX) continue;
      seen.add(`${card}|${variant}`);
      out.watches.push({ card, variant });
    }
  }
  if (typeof o.pinned === 'number' && Number.isInteger(o.pinned) && o.pinned > UID_BASE && o.pinned < 1_000_000_000) out.pinned = o.pinned;
  if (Array.isArray(o.profileLayout)) out.profileLayout = sanitizeProfileLayout(o.profileLayout);
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

export type NoticeGroup = 'offers' | 'results' | 'watch';
/** Which settings switch governs a notice kind (admin notices are never silenced). */
export function noticeGroup(kind: string): NoticeGroup | null {
  if (kind === 'offer' || kind === 'countered') return 'offers';
  if (kind === 'watch') return 'watch';
  if (kind === 'accepted' || kind === 'declined' || kind === 'cancelled' || kind === 'expired') return 'results';
  return null;
}

/** Should a notice of this kind reach this viewer? */
export function wantsNotice(s: UserSettings, kind: string): boolean {
  const g = noticeGroup(kind);
  return g === 'offers' ? s.notifyOffers : g === 'results' ? s.notifyResults : g === 'watch' ? s.notifyWatch : true;
}
