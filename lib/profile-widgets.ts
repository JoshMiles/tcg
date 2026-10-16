import type { IconName } from '@/app/components/Icon';

// A profile's Overview is a grid of widgets its owner can add, remove, reorder and resize (client-safe model: the registry and the
// layout + its sanitizer). The widgets themselves are in app/u/[username]/widgets.tsx, the editor in ProfileGrid.tsx, and the
// owner's chosen layout lives in their settings (UserSettings.profileLayout).

export const PROFILE_WIDGET_TYPES = ['stats', 'showcase', 'pinned', 'rarity', 'progress', 'rarest', 'recent', 'activity', 'trades', 'awards', 'achievements', 'wishlist', 'collection'] as const;
export type ProfileWidgetType = (typeof PROFILE_WIDGET_TYPES)[number];

/** Column spans on a 12-column grid (everything stacks on phones; spans of 6 or less pair up on tablets). */
export const PROFILE_SPANS = [3, 4, 6, 8, 12] as const;
export type ProfileSpan = (typeof PROFILE_SPANS)[number];

export interface ProfileWidgetDef {
  type: ProfileWidgetType;
  title: string;
  icon: IconName;
  description: string;
  defaultSpan: ProfileSpan;
  spans: readonly ProfileSpan[];
}

export const PROFILE_WIDGETS: Record<ProfileWidgetType, ProfileWidgetDef> = {
  stats: { type: 'stats', title: 'Score breakdown', icon: 'trend', description: 'Points from cards and bonuses, version mix and total prints.', defaultSpan: 4, spans: [4, 6, 8] },
  showcase: { type: 'showcase', title: 'Showcase', icon: 'gem', description: 'Your three most valuable cards, front and centre. Each opens the print that earned its place.', defaultSpan: 8, spans: [4, 6, 8, 12] },
  pinned: { type: 'pinned', title: 'Showcase print', icon: 'pin', description: 'One print you picked, shown as a card you can flip over to see its engraved print number. Pin it from the print\'s own page.', defaultSpan: 4, spans: [3, 4, 6, 8] },
  rarity: { type: 'rarity', title: 'Rarity progress', icon: 'award', description: 'How much of each rarity you have collected.', defaultSpan: 12, spans: [6, 8, 12] },
  progress: { type: 'progress', title: 'Pack progress', icon: 'cards', description: 'How complete each pack is.', defaultSpan: 6, spans: [4, 6, 8, 12] },
  rarest: { type: 'rarest', title: 'Rarest prints', icon: 'sparkles', description: 'The hardest-to-pull prints you own, by the chance of that card in that version. Each opens its page.', defaultSpan: 6, spans: [4, 6, 8, 12] },
  recent: { type: 'recent', title: 'Recent pulls', icon: 'history', description: 'The prints you pulled or were granted most recently, with their edition and print number, each opening its page. A print you traded away or upgraded still shows.', defaultSpan: 6, spans: [4, 6, 8, 12] },
  activity: { type: 'activity', title: 'Recent activity', icon: 'activity', description: 'Pulls, upgrades and trades as they happen.', defaultSpan: 6, spans: [4, 6, 8, 12] },
  trades: { type: 'trades', title: 'Trading', icon: 'trade', description: 'Completed trades and your open board listings.', defaultSpan: 6, spans: [4, 6, 8, 12] },
  awards: { type: 'awards', title: 'Awards', icon: 'trophy', description: 'Season awards you have earned.', defaultSpan: 6, spans: [4, 6, 8, 12] },
  achievements: { type: 'achievements', title: 'Achievements', icon: 'award', description: 'Collection goals you have reached, such as completing a season or owning every card of a rarity, and how close you are to the next.', defaultSpan: 12, spans: [6, 8, 12] },
  wishlist: { type: 'wishlist', title: 'Looking for', icon: 'search', description: 'Cards you want. Collectors who own one get a one-click trade offer.', defaultSpan: 4, spans: [3, 4, 6, 8, 12] },
  collection: { type: 'collection', title: 'Collection preview', icon: 'cards', description: 'A strip of the cards you own, linking to the full collection.', defaultSpan: 12, spans: [6, 8, 12] },
};

export interface ProfilePlacement { type: ProfileWidgetType; span: ProfileSpan }

/** What a profile shows until its owner changes it. */
export const DEFAULT_PROFILE_LAYOUT: ProfilePlacement[] = [
  { type: 'stats', span: 4 },
  { type: 'showcase', span: 8 },
  { type: 'rarity', span: 12 },
  { type: 'rarest', span: 6 },
  { type: 'recent', span: 6 },
  { type: 'activity', span: 6 },
  { type: 'awards', span: 6 },
  { type: 'achievements', span: 12 },
];

const isType = (t: unknown): t is ProfileWidgetType => typeof t === 'string' && (PROFILE_WIDGET_TYPES as readonly string[]).includes(t);

/** Known widgets only, each at most once, spans snapped to what the widget allows. Not an array: the default layout. */
export function sanitizeProfileLayout(input: unknown): ProfilePlacement[] {
  if (!Array.isArray(input)) return DEFAULT_PROFILE_LAYOUT.map(w => ({ ...w }));
  const seen = new Set<ProfileWidgetType>();
  const out: ProfilePlacement[] = [];
  for (const w of input) {
    const type = (w as { type?: unknown })?.type;
    if (!isType(type) || seen.has(type)) continue;
    seen.add(type);
    const def = PROFILE_WIDGETS[type];
    const span = Number((w as { span?: unknown }).span);
    out.push({ type, span: (def.spans as readonly number[]).includes(span) ? (span as ProfileSpan) : def.defaultSpan });
  }
  return out;
}

export const PROFILE_SPAN_CLASS: Record<ProfileSpan, string> = {
  3: 'md:col-span-6 xl:col-span-3',
  4: 'md:col-span-6 xl:col-span-4',
  6: 'md:col-span-6 xl:col-span-6',
  8: 'md:col-span-12 xl:col-span-8',
  12: 'md:col-span-12 xl:col-span-12',
};

/** The layout with the Showcase copy widget added at the top when it is missing (pinning a copy should make it show up). */
export function withPinnedWidget(layout: ProfilePlacement[] | null): ProfilePlacement[] {
  const current = sanitizeProfileLayout(layout);
  return current.some(w => w.type === 'pinned') ? current : [{ type: 'pinned', span: PROFILE_WIDGETS.pinned.defaultSpan }, ...current];
}
