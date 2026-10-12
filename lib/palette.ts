import { NAV_ITEMS } from './admin-nav';
import type { IconName } from '@/app/components/Icon';

// The command palette's items and ranking (pure, client-safe). Pages and actions are static; packs, seasons and viewers are
// fetched when the palette opens (GET /api/admin/palette).

export type PaletteGroup = 'Pages' | 'Actions' | 'Packs' | 'Seasons' | 'Users';
export type PaletteAction = 'copy-overlay' | 'open-preview' | 'exit-sandbox' | 'logout';

export interface PaletteItem {
  id: string;
  label: string;
  group: PaletteGroup;
  icon: IconName;
  hint?: string;
  href?: string;
  action?: PaletteAction;
  keywords?: string[];
  /** The "g x" shortcut, shown at the right. */
  keys?: string[];
}

export const GROUP_ORDER: PaletteGroup[] = ['Pages', 'Actions', 'Packs', 'Seasons', 'Users'];

export const STATIC_ITEMS: PaletteItem[] = [
  ...NAV_ITEMS.map(i => ({ id: `page:${i.href}`, label: i.label, group: 'Pages' as const, icon: i.icon, href: i.href, keywords: i.keywords, keys: ['g', i.key] })),
  { id: 'act:new-pack', label: 'New pack', group: 'Actions', icon: 'cards', href: '/admin/packs/new', hint: 'Start the pack wizard', keywords: ['create', 'add'] },
  { id: 'act:new-season', label: 'New season', group: 'Actions', icon: 'trophy', href: '/admin/seasons/new', hint: 'Start the season wizard', keywords: ['create', 'add'] },
  { id: 'act:gift', label: 'Gift packs to a viewer', group: 'Actions', icon: 'gift', href: '/admin', hint: 'Dashboard quick actions', keywords: ['quick', 'send'] },
  { id: 'act:scoring', label: 'Scoring settings', group: 'Actions', icon: 'trophy', href: '/admin/settings?tab=scoring', keywords: ['points', 'leaderboard', 'values'] },
  { id: 'act:env', label: 'Environment health', group: 'Actions', icon: 'shield', href: '/admin/settings?tab=environment', keywords: ['secrets', 'keys', 'variables'] },
  { id: 'act:twitch', label: 'Twitch extension setup', group: 'Actions', icon: 'tv', href: '/admin/settings?tab=viewers', keywords: ['panel', 'urls'] },
  { id: 'act:copy-overlay', label: 'Copy the overlay URL', group: 'Actions', icon: 'copy', action: 'copy-overlay', keywords: ['obs', 'browser source'] },
  { id: 'act:preview', label: 'Preview the overlay', group: 'Actions', icon: 'external', action: 'open-preview', keywords: ['obs'] },
  { id: 'act:exit-sandbox', label: 'Exit the sandbox', group: 'Actions', icon: 'flask', action: 'exit-sandbox', keywords: ['production'] },
  { id: 'act:logout', label: 'Log out', group: 'Actions', icon: 'logout', action: 'logout', keywords: ['sign out'] },
];

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s_#-]/gu, '').trim();

/** Every character of `q` appears in `s` in order (a loose "fuzzy" match). */
function subsequence(q: string, s: string): boolean {
  let i = 0;
  for (const c of s) if (c === q[i] && ++i === q.length) return true;
  return q.length === 0;
}

/** Higher is better; 0 means no match. */
export function scoreItem(item: Pick<PaletteItem, 'label' | 'hint' | 'keywords'>, query: string): number {
  const q = norm(query);
  if (!q) return 1;
  const label = norm(item.label);
  if (label === q) return 100;
  if (label.startsWith(q)) return 85;
  if (label.split(/[\s_-]+/).some(w => w.startsWith(q))) return 70;
  if (label.includes(q)) return 55;
  if ((item.keywords ?? []).some(k => norm(k).startsWith(q))) return 45;
  if ((item.keywords ?? []).some(k => norm(k).includes(q))) return 35;
  if (item.hint && norm(item.hint).includes(q)) return 25;
  if (q.length >= 2 && subsequence(q, label)) return 15;
  return 0;
}

/** Items that match, best first (ties keep group order, then alphabetical). With no query: pages and actions in their natural order. */
export function rankItems(items: PaletteItem[], query: string, limit = 30): PaletteItem[] {
  const q = norm(query);
  const scored = items.map((it, i) => ({ it, i, s: scoreItem(it, q) })).filter(x => x.s > 0);
  scored.sort((a, b) =>
    b.s - a.s || GROUP_ORDER.indexOf(a.it.group) - GROUP_ORDER.indexOf(b.it.group) || (q ? a.it.label.localeCompare(b.it.label) : a.i - b.i));
  // With no query, keep the list short: pages and actions only (entities appear once you type).
  const filtered = q ? scored : scored.filter(x => x.it.group === 'Pages' || x.it.group === 'Actions');
  return filtered.slice(0, limit).map(x => x.it);
}
