import type { IconName } from '@/app/components/Icon';
// The admin dashboard is a grid of widgets the admin can add, remove, reorder (drag and drop) and resize. This file is the
// client-safe model: the registry of widget types and the layout shape + its sanitizer. The server side (data + persistence)
// is in lib/dashboard-data.ts, the widgets themselves in app/admin/dashboard/.

export const WIDGET_TYPES = [
  'overview', 'quick-actions', 'top-collectors', 'leaderboard', 'rarity', 'packs', 'card-ownership', 'activity',
  'trades', 'overlay', 'pulse', 'variants', 'valuable', 'unowned', 'live', 'shortcuts', 'notes',
  'attention', 'pulls-chart', 'economy', 'viewers', 'progress', 'changes', 'overlay-controls', 'recap', 'digest',
] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];

/** Column spans on the 12-column grid (everything stacks on phones, and spans of 6 or less pair up on tablets). */
export const SPANS = [3, 4, 6, 8, 12] as const;
export type Span = (typeof SPANS)[number];

export interface WidgetDef {
  type: WidgetType;
  title: string;
  icon: IconName;
  description: string;
  defaultSpan: Span;
  /** Spans this widget makes sense at (a table is useless at 3 columns). */
  spans: readonly Span[];
}

export const WIDGETS: Record<WidgetType, WidgetDef> = {
  overview: { type: 'overview', title: 'Season overview', icon: 'chart', description: 'Players, cards pulled, card pool and average completion at a glance.', defaultSpan: 12, spans: [6, 8, 12] },
  'quick-actions': { type: 'quick-actions', title: 'Quick actions', icon: 'zap', description: 'Gift packs, show a collection or grant a card to a viewer.', defaultSpan: 12, spans: [8, 12] },
  'top-collectors': { type: 'top-collectors', title: 'Top collectors', icon: 'award', description: 'Who owns the most different cards this season.', defaultSpan: 8, spans: [6, 8, 12] },
  leaderboard: { type: 'leaderboard', title: 'Leaderboard', icon: 'trophy', description: 'The top scorers (points, not card count), with their completion.', defaultSpan: 4, spans: [4, 6, 8] },
  rarity: { type: 'rarity', title: 'Rarity mix', icon: 'gem', description: 'How the season\'s cards split across rarities.', defaultSpan: 4, spans: [3, 4, 6] },
  packs: { type: 'packs', title: 'Active packs', icon: 'cards', description: 'The packs being drawn this season, with a link to each.', defaultSpan: 4, spans: [3, 4, 6] },
  'card-ownership': { type: 'card-ownership', title: 'Card ownership', icon: 'cards', description: 'Every card with how many collectors own it.', defaultSpan: 12, spans: [6, 8, 12] },
  activity: { type: 'activity', title: 'Recent activity', icon: 'radio', description: 'The latest pulls, grants, upgrades and trades.', defaultSpan: 6, spans: [4, 6, 8, 12] },
  trades: { type: 'trades', title: 'Trading', icon: 'trade', description: 'Open offers, cards held in escrow and recent completed trades.', defaultSpan: 6, spans: [4, 6, 8] },
  overlay: { type: 'overlay', title: 'Overlay status', icon: 'monitor', description: 'Whether OBS has the overlay open, and shortcuts to edit it.', defaultSpan: 4, spans: [3, 4, 6] },
  pulse: { type: 'pulse', title: 'Activity pulse', icon: 'trend', description: 'Pulls and active viewers over the last hour, day and week.', defaultSpan: 4, spans: [3, 4, 6] },
  variants: { type: 'variants', title: 'Variant mix', icon: 'sparkles', description: 'How many Regular, Reverse Holo, Full Art and Full Art Holo editions exist.', defaultSpan: 4, spans: [3, 4, 6] },
  valuable: { type: 'valuable', title: 'Most valuable cards', icon: 'coins', description: 'The cards worth the most points per edition right now.', defaultSpan: 4, spans: [4, 6, 8] },
  unowned: { type: 'unowned', title: 'Cards nobody owns', icon: 'hole', description: 'Cards no viewer has pulled yet.', defaultSpan: 4, spans: [3, 4, 6] },
  live: { type: 'live', title: 'Stream status', icon: 'radio', description: 'Whether the channel is live on Twitch, with the title and viewer count.', defaultSpan: 4, spans: [3, 4, 6] },
  recap: { type: 'recap', title: 'Last stream recap', icon: 'radio', description: 'The summary posted to Discord when the last stream ended: packs opened, new collectors, the rarest pull and the top puller.', defaultSpan: 4, spans: [4, 6, 8] },
  digest: { type: 'digest', title: 'Weekly digest', icon: 'calendar', description: 'The last Sunday summary posted to Discord: pulls, trades, top 3, movers and the edition of the week.', defaultSpan: 4, spans: [4, 6, 8] },
  shortcuts: { type: 'shortcuts', title: 'Shortcuts', icon: 'compass', description: 'Jump to creating a pack or season, the overlay editor, trades and the sandbox.', defaultSpan: 4, spans: [3, 4, 6, 8] },
  attention: { type: 'attention', title: 'Needs attention', icon: 'alert', description: 'A to-do list: overlay offline while live, packs in no season, missing full art, expiring trades and more.', defaultSpan: 6, spans: [4, 6, 8, 12] },
  'pulls-chart': { type: 'pulls-chart', title: 'Pulls over time', icon: 'chart', description: 'Pulls per hour or day for the chosen range, split by variant, with the change from the previous period.', defaultSpan: 8, spans: [6, 8, 12] },
  economy: { type: 'economy', title: 'Economy health', icon: 'coins', description: 'Points in circulation, how evenly they are spread, and the scarcest and most common cards.', defaultSpan: 4, spans: [4, 6, 8] },
  viewers: { type: 'viewers', title: 'Viewers', icon: 'users', description: 'Active, new and returning viewers over the chosen range.', defaultSpan: 4, spans: [3, 4, 6] },
  progress: { type: 'progress', title: 'Season progress', icon: 'calendar', description: 'How long the season has run, pulls per day and how much of the card pool has been found.', defaultSpan: 4, spans: [3, 4, 6] },
  changes: { type: 'changes', title: 'Admin actions', icon: 'shield', description: 'Recent grants, removals, resets, gifts and cancellations made by an admin.', defaultSpan: 4, spans: [4, 6, 8] },
  'overlay-controls': { type: 'overlay-controls', title: 'Overlay controls', icon: 'monitor', description: 'Queue size, the "only when live" switches and clearing the queue, without leaving the dashboard.', defaultSpan: 4, spans: [3, 4, 6] },
  notes: { type: 'notes', title: 'Notes', icon: 'note', description: 'A scratchpad for reminders. Saved with the dashboard.', defaultSpan: 4, spans: [3, 4, 6, 8] },
};

export interface WidgetPlacement {
  type: WidgetType;
  span: Span;
}

export interface DashboardLayout {
  widgets: WidgetPlacement[];
}

/** What a fresh install shows: the original dashboard (header stats, quick actions, collectors + rarity + packs, card table), plus a couple of extras. */
export const DEFAULT_LAYOUT: DashboardLayout = {
  widgets: [
    { type: 'overview', span: 12 },
    { type: 'attention', span: 4 },
    { type: 'pulls-chart', span: 8 },
    { type: 'quick-actions', span: 12 },
    { type: 'top-collectors', span: 8 },
    { type: 'rarity', span: 4 },
    { type: 'activity', span: 6 },
    { type: 'trades', span: 6 },
    { type: 'packs', span: 4 },
    { type: 'leaderboard', span: 4 },
    { type: 'overlay', span: 4 },
    { type: 'card-ownership', span: 12 },
  ],
};

const isType = (t: unknown): t is WidgetType => typeof t === 'string' && (WIDGET_TYPES as readonly string[]).includes(t);

/** Cleans a layout from the client: known widgets only, each at most once, spans snapped to what the widget allows. */
export function sanitizeLayout(input: unknown): DashboardLayout {
  const raw = (input && typeof input === 'object' ? (input as { widgets?: unknown }).widgets : null);
  if (!Array.isArray(raw)) return DEFAULT_LAYOUT;
  const seen = new Set<WidgetType>();
  const widgets: WidgetPlacement[] = [];
  for (const w of raw) {
    const type = (w as { type?: unknown })?.type;
    if (!isType(type) || seen.has(type)) continue;
    seen.add(type);
    const def = WIDGETS[type];
    const span = Number((w as { span?: unknown }).span);
    widgets.push({ type, span: (def.spans as readonly number[]).includes(span) ? (span as Span) : def.defaultSpan });
  }
  return { widgets };
}

/** Tailwind needs whole class names, so the spans are spelled out. */
export const SPAN_CLASS: Record<Span, string> = {
  3: 'md:col-span-6 xl:col-span-3',
  4: 'md:col-span-6 xl:col-span-4',
  6: 'md:col-span-6 xl:col-span-6',
  8: 'md:col-span-12 xl:col-span-8',
  12: 'md:col-span-12 xl:col-span-12',
};

/** Whose layout key to use: a Twitch staff member's own login, or null (the shared layout) for the emergency password login. */
export function loginForLayout(who: { login: string; via: 'twitch' | 'password' } | null): string | null {
  return who && who.via === 'twitch' ? who.login : null;
}

/** Ready-made layouts every staff member can switch to (shown above the team layouts). Applying one replaces the person's own layout. */
export const BUILTIN_PRESETS: { name: string; layout: DashboardLayout }[] = [
  { name: 'Stream night', layout: { widgets: [
    { type: 'live', span: 4 }, { type: 'overlay-controls', span: 4 }, { type: 'recap', span: 4 }, { type: 'quick-actions', span: 12 },
    { type: 'activity', span: 6 }, { type: 'pulls-chart', span: 6 },
  ] } },
  { name: 'Season overview', layout: { widgets: [
    { type: 'overview', span: 12 }, { type: 'pulls-chart', span: 8 }, { type: 'rarity', span: 4 },
    { type: 'top-collectors', span: 6 }, { type: 'packs', span: 6 }, { type: 'card-ownership', span: 12 }, { type: 'digest', span: 6 },
  ] } },
  { name: 'Trading desk', layout: { widgets: [
    { type: 'trades', span: 8 }, { type: 'attention', span: 4 }, { type: 'activity', span: 6 }, { type: 'leaderboard', span: 6 },
  ] } },
  { name: 'Minimal', layout: { widgets: [
    { type: 'overview', span: 12 }, { type: 'attention', span: 4 }, { type: 'quick-actions', span: 8 },
  ] } },
];
