import { SITE_URL, CHANNEL_NAME } from './site';

// Search and sharing basics (pure): the site description, which pages belong in the sitemap, and what robots may crawl.
// scripts/check-public-meta.mts verifies every public page has a title and is either listed here or deliberately excluded.

export const SITE_NAME = 'The Cheesy TCG';
export const SITE_DESCRIPTION = `A cheesy collectible card game played live on the ${CHANNEL_NAME} Twitch channel. Pull cards, collect every variant, climb the leaderboard.`;

/** Public pages that belong in search results. */
export const INDEXED_PATHS: { path: string; priority: number; changeFrequency: 'hourly' | 'daily' | 'weekly' | 'monthly' }[] = [
  { path: '/', priority: 1, changeFrequency: 'hourly' },
  { path: '/leaderboard', priority: 0.9, changeFrequency: 'hourly' },
  { path: '/cards', priority: 0.8, changeFrequency: 'daily' },
  { path: '/stats', priority: 0.7, changeFrequency: 'hourly' },
  { path: '/collection', priority: 0.6, changeFrequency: 'weekly' },
  { path: '/faq', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/install', priority: 0.4, changeFrequency: 'monthly' },
  { path: '/privacy', priority: 0.2, changeFrequency: 'monthly' },
  { path: '/terms', priority: 0.2, changeFrequency: 'monthly' },
];

/** Pages that exist but must stay out of search (signed-in, admin, utility). Anything not here or in INDEXED_PATHS fails the check. */
export const NOINDEX_PATHS = ['/account', '/settings', '/trade', '/trade/new', '/auth/error', '/login', '/admin', '/mod', '/offline'];

export interface SitemapEntry { url: string; lastModified?: Date; changeFrequency: 'hourly' | 'daily' | 'weekly' | 'monthly'; priority: number }

/** Entries for the sitemap: the fixed pages plus one leaderboard per published season. */
export function buildSitemap(base: string, seasons: { id: string; status?: string; createdAt?: number }[], now = new Date()): SitemapEntry[] {
  const root = base.replace(/\/$/, '');
  const fixed = INDEXED_PATHS.map(p => ({ url: `${root}${p.path === '/' ? '' : p.path}`, lastModified: now, changeFrequency: p.changeFrequency, priority: p.priority }));
  const boards = seasons
    .filter(s => s.status !== 'draft')
    .map(s => ({ url: `${root}/leaderboard/${s.id}`, lastModified: s.createdAt ? new Date(s.createdAt) : now, changeFrequency: 'daily' as const, priority: 0.5 }));
  return [...fixed, ...boards];
}

/** What crawlers may not visit. */
export const DISALLOWED_PATHS = ['/admin', '/mod', '/api/', '/auth/', '/login', '/account', '/trade', '/overlay.html', '/twitch-panel/'];

export const siteUrl = SITE_URL;
