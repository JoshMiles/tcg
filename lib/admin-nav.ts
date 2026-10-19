import type { IconName } from '@/app/components/Icon';

// The admin's pages in one place (client-safe, no server imports): the sidebar, the command palette and the "g then a letter"
// shortcuts all read this, so a page added or renamed here shows up everywhere. scripts/check-admin-shell.mts verifies every
// href is a real page and every shortcut letter is unique.

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  /** Only an exact path match counts as "here" (the dashboard). */
  exact?: boolean;
  /** The letter pressed after "g" to go here. */
  key: string;
  /** Extra words the palette matches (so "scores" finds Settings). */
  keywords?: string[];
}

export const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  { title: 'Overview', items: [
    { href: '/admin', label: 'Dashboard', icon: 'chart', exact: true, key: 'd', keywords: ['home', 'stats'] },
    { href: '/admin/activity', label: 'Live Activity', icon: 'radio', key: 'a', keywords: ['feed', 'events', 'pulls'] },
    { href: '/admin/changelog', label: "What's new", icon: 'sparkles', key: 'w', keywords: ['changelog', 'updates', 'release notes', 'staff changes'] },
  ] },
  { title: 'Game', items: [
    { href: '/admin/seasons', label: 'Seasons', icon: 'trophy', key: 's', keywords: ['wrap up', 'activate'] },
    { href: '/admin/packs', label: 'Packs', icon: 'cards', key: 'p', keywords: ['cards', 'odds'] },
    { href: '/admin/assets', label: 'Assets', icon: 'image', key: 'e', keywords: ['images', 'sounds', 'media', 'storage'] },
    { href: '/admin/overlay', label: 'Overlay Editor', icon: 'palette', key: 'o', keywords: ['obs', 'look', 'layout', 'holo'] },
    { href: '/admin/mixitup', label: 'Mix It Up', icon: 'coins', key: 'm', keywords: ['brie bucks', 'paid pulls', 'chat bot', 'commands', 'currency', 'price', 'webhook'] },
  ] },
  { title: 'Community', items: [
    { href: '/admin/users', label: 'Users', icon: 'users', key: 'u', keywords: ['viewers', 'collectors'] },
    { href: '/admin/trades', label: 'Trades', icon: 'trade', key: 't', keywords: ['offers', 'escrow'] },
    { href: '/admin/feedback', label: 'Feedback', icon: 'chat', key: 'i', keywords: ['suggestions', 'ideas', 'bugs', 'problems', 'reports', 'inbox', 'replies'] },
    { href: '/admin/serials', label: 'Editions', icon: 'cheese', key: 'n', keywords: ['editions', 'copies', 'numbers', 'serial', 'edition', 'history', 'holders'] },
  ] },
  { title: 'System', items: [
    { href: '/admin/staff', label: 'Staff', icon: 'shield', key: 'f', keywords: ['admins', 'mods', 'moderators', 'roles', 'permissions', 'team'] },
    { href: '/admin/wiki', label: 'Staff wiki', icon: 'book', key: 'k', keywords: ['handbook', 'help', 'docs', 'guide', 'glossary', 'support'] },
    { href: '/admin/sandbox', label: 'Sandbox', icon: 'flask', key: 'b', keywords: ['test', 'testing'] },
    { href: '/admin/settings', label: 'Settings', icon: 'settings', key: 'c', keywords: ['scoring', 'webhooks', 'discord', 'environment', 'twitch', 'config'] },
  ] },
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap(g => g.items);

/** Is `pathname` inside this item? */
export const isActive = (item: NavItem, pathname: string) => (item.exact ? pathname === item.href : pathname.startsWith(item.href));
