import type { IconName } from '@/app/components/Icon';

// Where a viewer's profile lives and what tabs it has (pure, client-safe). The old /collection/<name> address still works: it
// redirects here, so links in Discord posts, the Twitch panel and old bookmarks keep working.

export const PROFILE_TABS: { id: 'overview' | 'collection' | 'stats' | 'trades' | 'activity'; label: string; icon: IconName }[] = [
  { id: 'overview', label: 'Overview', icon: 'grid' },
  { id: 'collection', label: 'Collection', icon: 'cards' },
  { id: 'stats', label: 'Stats', icon: 'trend' },
  { id: 'trades', label: 'Trades', icon: 'trade' },
  { id: 'activity', label: 'Activity', icon: 'activity' },
];
export type ProfileTab = (typeof PROFILE_TABS)[number]['id'];

/** The profile address for a username (lower-cased, URL-safe), optionally on a tab. */
export function profileHref(username: string, tab?: ProfileTab): string {
  const base = `/u/${encodeURIComponent(username.trim().toLowerCase())}`;
  return tab && tab !== 'overview' ? `${base}?tab=${tab}` : base;
}

/** `?tab=` to a known tab, falling back to the overview. */
export function pickProfileTab(raw: string | undefined): ProfileTab {
  return PROFILE_TABS.find(t => t.id === raw)?.id ?? 'overview';
}

/** Event types the public Activity tab may show: pulls, upgrades and completed trades only (never admin actions or declined offers). */
export const PUBLIC_ACTIVITY_TYPES = ['pull', 'upgrade', 'trade'] as const;
