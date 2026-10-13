import { scoreItem } from './palette';

// The public site's search (pure, client-safe): what can be found, how queries are cleaned and how results are ranked.
// Pages are searched in the browser; viewers and cards come from GET /api/search. Viewers an admin has hidden from public
// boards never appear here (their own page still works if you know the address).

export type SearchKind = 'page' | 'player' | 'card' | 'copy';

export interface SearchItem {
  id: string;
  kind: SearchKind;
  label: string;
  href: string;
  hint?: string;
  keywords?: string[];
  /** Cards: the static thumbnail, shown beside the name. */
  image?: string;
  stars?: number;
}

export const PUBLIC_PAGES: SearchItem[] = [
  { id: 'page:home', kind: 'page', label: 'Home', href: '/', keywords: ['start', 'main'] },
  { id: 'page:leaderboard', kind: 'page', label: 'Leaderboard', href: '/leaderboard', keywords: ['ranking', 'top', 'points', 'score'] },
  { id: 'page:collection', kind: 'page', label: 'Find a collector', href: '/collection', keywords: ['collections', 'players', 'search', 'viewer'] },
  { id: 'page:cards', kind: 'page', label: 'Card dex', href: '/cards', keywords: ['cards', 'rarity', 'odds'] },
  { id: 'page:stats', kind: 'page', label: 'Season stats', href: '/stats', keywords: ['numbers', 'charts'] },
  { id: 'page:trade', kind: 'page', label: 'Trade', href: '/trade', keywords: ['swap', 'offers', 'board'] },
  { id: 'page:faq', kind: 'page', label: 'FAQ', href: '/faq', keywords: ['help', 'how', 'points', 'upgrade', 'variants'] },
  { id: 'page:install', kind: 'page', label: 'Get the app', href: '/install', keywords: ['install', 'home screen', 'add to home screen', 'ios', 'android', 'iphone', 'pwa', 'app'] },
  { id: 'page:account', kind: 'page', label: 'My stats', href: '/account', keywords: ['account', 'profile', 'me', 'upgrade'] },
  { id: 'page:privacy', kind: 'page', label: 'Privacy policy', href: '/privacy' },
  { id: 'page:terms', kind: 'page', label: 'Terms of use', href: '/terms', keywords: ['eula'] },
];

export const MAX_QUERY = 40;
const LIMITS: Record<SearchKind, number> = { page: 3, player: 5, card: 4, copy: 1 };

/** What the user typed, made safe to send and match: trimmed, no control characters, no leading @, length-capped. */
export function cleanQuery(raw: string): string {
  return raw.replace(/[\u0000-\u001f\u007f]/g, '').trim().replace(/^@+/, '').slice(0, MAX_QUERY);
}

/** Search items for the entities on the server: the active season's viewers (hidden ones excluded) and cards. */
export function buildEntityItems(
  usernames: string[], hidden: Set<string>,
  cards: { number: number; name: string; stars: number; thumb?: string }[],
): SearchItem[] {
  const players = [...new Set(usernames.map(u => u.toLowerCase()))].filter(u => !hidden.has(u)).map<SearchItem>(u => ({
    id: `player:${u}`, kind: 'player', label: u, href: `/u/${encodeURIComponent(u)}`, hint: 'Collector',
  }));
  const dex = cards.map<SearchItem>(c => ({
    id: `card:${c.number}`, kind: 'card', label: c.name, href: `/cards?card=${c.number}`, hint: `Card #${c.number}`, image: c.thumb, stars: c.stars,
  }));
  return [...players, ...dex];
}

/** Best matches first, with a cap per kind so one kind can't crowd the rest out. */
export function rankSearch(items: SearchItem[], rawQuery: string, limit = 10): SearchItem[] {
  const q = cleanQuery(rawQuery);
  if (!q) return [];
  const scored = items
    .map(it => ({ it, s: scoreItem(it, q) }))
    // Loose letter-order matching is fine for names, but for pages it only produces noise ("alic" finding "Privacy policy").
    .filter(x => x.s > 0 && (x.it.kind !== 'page' || x.s >= 25))
    .sort((a, b) => b.s - a.s || a.it.label.localeCompare(b.it.label));
  const taken: Record<SearchKind, number> = { page: 0, player: 0, card: 0, copy: 0 };
  const out: SearchItem[] = [];
  for (const { it } of scored) {
    if (taken[it.kind] >= LIMITS[it.kind]) continue;
    taken[it.kind]++;
    out.push(it);
    if (out.length >= limit) break;
  }
  return out;
}
