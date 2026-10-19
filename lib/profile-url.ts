import type { IconName } from '@/app/components/Icon';
import { copyHrefFor } from './copy-link';

// Where a viewer's profile lives and what tabs it has (pure, client-safe). The old /collection/<name> address still works: it
// redirects here, so links in Discord posts, the Twitch panel and old bookmarks keep working.

export const PROFILE_TABS: { id: 'overview' | 'collection' | 'stats' | 'trades' | 'activity' | 'share'; label: string; icon: IconName; ownerOnly?: boolean }[] = [
  { id: 'overview', label: 'Overview', icon: 'grid' },
  { id: 'collection', label: 'Collection', icon: 'cards' },
  { id: 'stats', label: 'Stats', icon: 'trend' },
  { id: 'trades', label: 'Trades', icon: 'trade' },
  { id: 'activity', label: 'Activity', icon: 'activity' },
  { id: 'share', label: 'Share', icon: 'image', ownerOnly: true },
];
export type ProfileTab = (typeof PROFILE_TABS)[number]['id'];

/** The profile address for a username (lower-cased, URL-safe), optionally on a tab. */
export function profileHref(username: string, tab?: ProfileTab): string {
  const base = `/u/${encodeURIComponent(username.trim().toLowerCase())}`;
  return tab && tab !== 'overview' ? `${base}?tab=${tab}` : base;
}

/** The browser-tab title for a profile page: "Alice's profile", "Alice's collection", "Alice's stats" ... one pattern for every tab. */
export function profileTitle(name: string, tab: ProfileTab): string {
  const t = PROFILE_TABS.find(x => x.id === tab);
  return `${name}'s ${tab === 'overview' || !t ? 'profile' : t.label.toLowerCase()}`;
}

/** `?tab=` to a known tab, falling back to the overview. */
export function pickProfileTab(raw: string | undefined, isOwner = false): ProfileTab {
  const t = PROFILE_TABS.find(x => x.id === raw);
  return t && (!t.ownerOnly || isOwner) ? t.id : 'overview';
}

/** Event types the public Activity tab may show: pulls, upgrades and completed trades only (never admin actions or declined offers). */
export const PUBLIC_ACTIVITY_TYPES = ['pull', 'upgrade', 'trade', 'buff'] as const;

/** The facts a public activity row needs in order to link somewhere. */
export type ActivityLink = {
  type: string;
  cardNumber?: number;
  uid?: number;
  copyId?: string;
  tradeId?: string;
};

/**
 * Where a public Activity row opens. A pull or upgrade with a print number goes to `/c/<uid>` (`copyHrefFor`); one that only has a
 * print id goes to `/copy/<season>/<id>`. With neither, it goes to the card dex. An accepted trade goes to `/trade/<id>` only when
 * the event recorded one. Older trades, and anything else, stay plain text (null).
 */
export function publicActivityHref(e: ActivityLink, seasonId: string): string | null {
  if (e.type === 'trade') return e.tradeId ? `/trade/${encodeURIComponent(e.tradeId)}` : null;
  if (e.type !== 'pull' && e.type !== 'upgrade' && e.type !== 'buff') return null;
  if (e.uid) return copyHrefFor({ type: e.type, uid: e.uid, cardNumber: e.cardNumber }, seasonId);
  if (e.copyId && seasonId) return `/copy/${encodeURIComponent(seasonId)}/${e.copyId}`;
  return e.cardNumber != null ? `/cards?card=${e.cardNumber}` : null;
}
