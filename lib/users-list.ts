// The Admin Users list, filtered, sorted and paged on the server (ROADMAP 51.11). Pure: rows in, one page out.
// The page and the CSV export read the same query, so "export" is always the whole filtered list, not the visible page.

export interface UserRow {
  username: string;
  displayName: string;
  avatar?: string;
  isTwitch: boolean;
  tags: string[];
  noTrading: boolean;
  hidden: boolean;
  hasNotes: boolean;
  unique: number;
  pulls: number;
  shiny: number;
  full: number;
  primary: { name: string; owned: number; total: number; pct: number } | null;
  otherSeasons: number;
  score: number | null;
  scoreRank: number | null;
  joined: number | null;
  lastActive: number | null;
  trades: number;
}

export const USERS_PAGE_SIZE = 50;
export const SORT_KEYS = ['cards', 'score', 'pulls', 'active', 'joined', 'trades', 'name'] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export const ACTIVITY_KEYS = ['any', '24h', '7d', '30d', 'never'] as const;
export type ActivityKey = (typeof ACTIVITY_KEYS)[number];
const DAYS = { '24h': 1, '7d': 7, '30d': 30 } as const;

export interface UsersQuery {
  q: string; sort: SortKey; activity: ActivityKey; complete: boolean; shiny: boolean; full: boolean; tag: string; restricted: boolean; notes: boolean; page: number;
}

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

/** Reads the page's search params; anything unknown falls back to the default. */
export function parseUsersQuery(sp: Params): UsersQuery {
  const sort = one(sp.sort) as SortKey, activity = one(sp.activity) as ActivityKey;
  const page = Math.floor(Number(one(sp.page)));
  return {
    q: one(sp.q).trim().slice(0, 100),
    sort: SORT_KEYS.includes(sort) ? sort : 'cards',
    activity: ACTIVITY_KEYS.includes(activity) ? activity : 'any',
    complete: one(sp.complete) === '1', shiny: one(sp.shiny) === '1', full: one(sp.full) === '1',
    tag: one(sp.tag).slice(0, 40), restricted: one(sp.restricted) === '1', notes: one(sp.notes) === '1',
    page: page >= 1 ? page : 1,
  };
}

/** The query as URL search params, defaults left out. `over` replaces fields; changing anything but the page goes back to page 1. */
export function usersQueryString(query: UsersQuery, over: Partial<UsersQuery> = {}): string {
  const c = { ...query, page: 1, ...over };
  const p = new URLSearchParams();
  if (c.q) p.set('q', c.q);
  if (c.sort !== 'cards') p.set('sort', c.sort);
  if (c.activity !== 'any') p.set('activity', c.activity);
  if (c.tag) p.set('tag', c.tag);
  for (const k of ['complete', 'shiny', 'full', 'restricted', 'notes'] as const) if (c[k]) p.set(k, '1');
  if (c.page > 1) p.set('page', String(c.page));
  return p.toString();
}

const by: Record<SortKey, (a: UserRow, b: UserRow) => number> = {
  cards: (a, b) => b.unique - a.unique || b.pulls - a.pulls,
  score: (a, b) => (b.score ?? -1) - (a.score ?? -1),
  pulls: (a, b) => b.pulls - a.pulls || b.unique - a.unique,
  active: (a, b) => (b.lastActive ?? 0) - (a.lastActive ?? 0),
  joined: (a, b) => (b.joined ?? 0) - (a.joined ?? 0),
  trades: (a, b) => b.trades - a.trades,
  name: (a, b) => a.username.localeCompare(b.username),
};

/** Every row that matches the filters, in the chosen order. */
export function filterSortUsers(rows: UserRow[], c: UsersQuery, now: number): UserRow[] {
  const q = c.q.toLowerCase();
  return rows.filter(r => {
    if (q && !`${r.username} ${r.displayName} ${r.tags.join(' ')}`.toLowerCase().includes(q)) return false;
    if (c.activity === 'never' ? r.lastActive !== null : c.activity !== 'any' && !(r.lastActive && now - r.lastActive <= DAYS[c.activity] * 86_400_000)) return false;
    if (c.complete && !(r.primary && r.primary.total > 0 && r.primary.owned >= r.primary.total)) return false;
    if (c.shiny && r.shiny === 0) return false;
    if (c.full && r.full === 0) return false;
    if (c.tag && !r.tags.includes(c.tag)) return false;
    if (c.restricted && !(r.noTrading || r.hidden)) return false;
    if (c.notes && !r.hasNotes) return false;
    return true;
  }).sort(by[c.sort]);
}

/** One page of a list; the page number is clamped into range. */
export function pageOfUsers<T>(list: T[], page: number, size = USERS_PAGE_SIZE): { items: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(list.length / size));
  const p = Math.min(Math.max(1, page), pages);
  return { items: list.slice((p - 1) * size, p * size), page: p, pages };
}

const csvCell = (v: string | number | null) => `"${String(v ?? '').replace(/"/g, '""')}"`;

/** The CSV for a list of rows (the same columns the client export always had). */
export function usersCsv(list: UserRow[]): string {
  const head = ['username', 'display name', 'tags', 'unique cards', 'pulls', 'score', 'last active', 'joined', 'trades', 'restricted'].join(',');
  const body = list.map(r => [r.username, r.displayName, r.tags.join('; '), r.unique, r.pulls, r.score, r.lastActive ? new Date(r.lastActive).toISOString() : '', r.joined ? new Date(r.joined).toISOString() : '', r.trades, r.noTrading || r.hidden ? [r.noTrading && 'no trading', r.hidden && 'hidden'].filter(Boolean).join('; ') : ''].map(csvCell).join(','));
  return [head, ...body].join('\n');
}
