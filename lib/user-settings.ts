// A viewer's own settings (client-safe, pure). Stored sparsely in KV by lib/user-settings-store.ts; everything here is
// validated on the way in, so a crafted request can never store an unknown key or an out-of-range value.

export const BIO_MAX = 160;

import { sanitizeProfileLayout, type ProfilePlacement } from './profile-widgets';
import { sanitizeBinder, type BinderConfig } from './binder-config';
import { UID_BASE } from './serials-core';
import { VARIANTS } from './variants';
import type { Variant } from './types';
import { PUSH_KINDS, type PushKind } from './push-core';
import { HEX_RE, clampAccent } from './accent';
import { DEFAULT_PRONOUNS, sanitizePronouns, type Pronouns } from './pronouns';

export const WANTED_MAX = 6;
/** Saved listing alerts: tell me when someone lists this card (in this version, or any). */
export const WATCH_MAX = 10;
export interface Watch { card: number; variant: Variant | null }
/** Named header colours for the profile accent (a custom colour is stored as a clamped #rrggbb instead). */
export const ACCENTS = [
  { id: 'cheddar', label: 'Cheddar', hex: '#facc15' }, { id: 'ember', label: 'Ember', hex: '#fb923c' }, { id: 'rose', label: 'Rose', hex: '#fb7185' },
  { id: 'grape', label: 'Grape', hex: '#c084fc' }, { id: 'ocean', label: 'Ocean', hex: '#38bdf8' }, { id: 'mint', label: 'Mint', hex: '#34d399' },
  { id: 'lime', label: 'Lime', hex: '#a3e635' }, { id: 'teal', label: 'Teal', hex: '#2dd4bf' }, { id: 'sky', label: 'Sky', hex: '#60a5fa' },
  { id: 'indigo', label: 'Indigo', hex: '#818cf8' }, { id: 'magenta', label: 'Magenta', hex: '#e879f9' }, { id: 'slate', label: 'Slate', hex: '#94a3b8' },
] as const;
/** The colour of a stored accent: a named swatch's hex, or a custom #rrggbb (clamped again here, so a hand-edited value can't escape the limits). */
export const accentHex = (v: string) => ACCENTS.find(a => a.id === v)?.hex ?? clampAccent(v) ?? undefined;

export type MotionPref = 'system' | 'reduce';
export type CollectionView = 'grid' | 'binder';

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
  /** Bell notices when staff answer a suggestion or problem report they sent. */
  notifyFeedback: boolean;
  /** A short sound when a new notice arrives while the site is open (off unless they switch it on). */
  noticeSound: boolean;
  /** Which kinds of notice also arrive as a push alert on their devices (the bell switches above still apply first). */
  pushKinds: PushKind[];
  /** Accept direct trade offers from other viewers (the open board is unaffected). */
  allowOffers: boolean;
  /** Staff only: hide my Streamer / Admin / Mod badge (a personal account used as a normal player). */
  hideStaffBadge: boolean;
  /** 'reduce' calms the site's animations even when the device does not ask for it. */
  motion: MotionPref;
  /** Start collection grids with uncollected cards hidden. */
  hideUncollected: boolean;
  /** Smaller card tiles in grids. */
  compactGrids: boolean;
  /** Profile header colour: an ACCENTS id, or a custom '#rrggbb' (lightness-clamped on the way in). Empty = the default gold. */
  accent: string;
  /** Card numbers they are looking for (the Looking for widget on their profile). */
  wanted: number[];
  /** Saved listing alerts (see Watch). A card on the Looking for list alerts too, in any version. */
  watches: Watch[];
  /** The unique number (Copy.uid) of the copy they pinned as their profile's Showcase copy, or null. Checked against the live owner whenever it is shown. */
  pinned: number | null;
  /** Unique numbers (Copy.uid) of prints they marked as favourites: these can't be traded or spent in an upgrade. Checked against the live owner whenever used. */
  favourites: number[];
  /** Pronouns shown after their name: nothing until they choose (see lib/pronouns.ts). */
  pronouns: Pronouns;
  /** Which view their collection tab opens in for visitors who have not picked one themselves. */
  collectionView: CollectionView;
  /** The widgets of their profile Overview, in order (null = the default layout). */
  profileLayout: ProfilePlacement[] | null;
  /** How their collection binder looks and (optionally) which card is in which pocket; null = the default look and automatic layout. */
  binder: BinderConfig | null;
  /** Ids of switched-on experimental features (see EXPERIMENTS). */
  experiments: string[];
}

export const FAVOURITES_MAX = 50;

export const DEFAULT_SETTINGS: UserSettings = {
  bio: '',
  privateProfile: false,
  notifyOffers: true,
  notifyResults: true,
  notifyWatch: true,
  notifyFeedback: true,
  noticeSound: false,
  pushKinds: [...PUSH_KINDS],
  allowOffers: true,
  hideStaffBadge: false,
  motion: 'system',
  hideUncollected: true,
  compactGrids: false,
  accent: '',
  pronouns: DEFAULT_PRONOUNS,
  collectionView: 'grid',
  wanted: [],
  watches: [],
  pinned: null,
  favourites: [],
  profileLayout: null,
  binder: null,
  experiments: [],
};

export interface Experiment { id: string; label: string; description: string }

/** Opt-in features that are still settling. The 'shortcuts' one changes only this viewer's browser; an experiment that changes how their own public profile looks would go here too. */
export const EXPERIMENTS: Experiment[] = [
  { id: 'shortcuts', label: 'Keyboard shortcuts', description: 'Press g then h, c, l, s, d, t, a or e to jump to Home, My profile, Leaderboard, Season stats, Card Dex, Trade, My stats or Settings. Press ? for the list. Off while you are typing.' },
];

const EXPERIMENT_IDS = new Set(EXPERIMENTS.map(e => e.id));

export const BOOLEAN_KEYS = ['privateProfile', 'notifyOffers', 'notifyResults', 'notifyWatch', 'notifyFeedback', 'noticeSound', 'allowOffers', 'hideStaffBadge', 'hideUncollected', 'compactGrids'] as const;

/** Anything → a complete, valid settings object. Unknown keys are dropped, bad values fall back to the default. */
export function sanitizeUserSettings(input: unknown): UserSettings {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const out: UserSettings = { ...DEFAULT_SETTINGS, experiments: [], watches: [], favourites: [] };
  if (typeof o.bio === 'string') out.bio = o.bio.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, BIO_MAX);
  for (const k of BOOLEAN_KEYS) if (typeof o[k] === 'boolean') out[k] = o[k] as boolean;
  if (Array.isArray(o.pushKinds)) out.pushKinds = PUSH_KINDS.filter(k => (o.pushKinds as unknown[]).includes(k));
  if (o.motion === 'reduce' || o.motion === 'system') out.motion = o.motion;
  out.pronouns = sanitizePronouns(o.pronouns);
  if (o.collectionView === 'grid' || o.collectionView === 'binder') out.collectionView = o.collectionView;
  if (typeof o.accent === 'string') out.accent = ACCENTS.some(a => a.id === o.accent) ? o.accent : HEX_RE.test(o.accent) ? clampAccent(o.accent) ?? '' : '';
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
  if (Array.isArray(o.favourites)) out.favourites = [...new Set(o.favourites.filter((n): n is number => Number.isInteger(n) && n > UID_BASE && n < 1_000_000_000))].slice(0, FAVOURITES_MAX);
  if (Array.isArray(o.profileLayout)) out.profileLayout = sanitizeProfileLayout(o.profileLayout);
  if (o.binder && typeof o.binder === 'object') out.binder = sanitizeBinder(o.binder);
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

export type NoticeGroup = 'offers' | 'results' | 'watch' | 'feedback';
/** Which settings switch governs a notice kind (admin notices are never silenced). */
export function noticeGroup(kind: string): NoticeGroup | null {
  if (kind === 'offer' || kind === 'countered') return 'offers';
  if (kind === 'watch') return 'watch';
  if (kind === 'feedback') return 'feedback';
  if (kind === 'accepted' || kind === 'declined' || kind === 'cancelled' || kind === 'expired') return 'results';
  return null;
}

/** Should a notice of this kind reach this viewer? */
export function wantsNotice(s: UserSettings, kind: string): boolean {
  const g = noticeGroup(kind);
  return g === 'offers' ? s.notifyOffers : g === 'results' ? s.notifyResults : g === 'watch' ? s.notifyWatch : g === 'feedback' ? s.notifyFeedback : true;
}
