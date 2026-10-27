import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Staff wiki pages. Markdown files in content/wiki, read on the server. The admin layout is what
// keeps them off the public site; this module only loads and lightly checks the files.

export interface WikiDoc {
  slug: string;
  title: string;
  summary: string;
  order: number;
  /** Front matter `audience: mods`: also shown in the mod panel's guide at /mod/guide. */
  mods: boolean;
  body: string;
}

export const WIKI_DIR = join(process.cwd(), 'content', 'wiki');

function field(head: string, key: string): string {
  const m = new RegExp(`^${key}:\\s*(.*)$`, 'm').exec(head);
  return m ? m[1].trim() : '';
}

/** One markdown file, or null when the front matter is missing a title or the slug is not a plain name. */
export function parseWikiFile(filename: string, raw: string): WikiDoc | null {
  const text = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  if (!text.startsWith('---\n')) return null;
  const end = text.indexOf('\n---\n', 4);
  if (end < 0) return null;
  const title = field(text.slice(4, end), 'title');
  const slug = filename.replace(/\.md$/, '');
  if (!title || !/^[a-z0-9-]+$/.test(slug)) return null;
  const order = Number(field(text.slice(4, end), 'order'));
  return {
    slug,
    title,
    summary: field(text.slice(4, end), 'summary'),
    order: Number.isFinite(order) ? order : 100,
    mods: field(text.slice(4, end), 'audience') === 'mods',
    body: text.slice(end + 5).replace(/^\n/, ''),
  };
}

/** Every wiki page, overview first. */
export function loadWiki(): WikiDoc[] {
  return readdirSync(WIKI_DIR)
    .filter(name => name.endsWith('.md'))
    .map(name => parseWikiFile(name, readFileSync(join(WIKI_DIR, name), 'utf8')))
    .filter((doc): doc is WikiDoc => !!doc)
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

export function getWikiPage(slug: string): WikiDoc | null {
  return loadWiki().find(doc => doc.slug === slug) ?? null;
}

/** The topics marked for mods. The only pages /mod/guide may show. */
export function loadModGuide(): WikiDoc[] {
  return loadWiki().filter(doc => doc.mods);
}

export function getModGuidePage(slug: string): WikiDoc | null {
  return loadModGuide().find(doc => doc.slug === slug) ?? null;
}

/** Where a page lives. The overview is the index, not /admin/wiki/index. */
export function wikiHref(slug: string): string {
  return slug === 'index' ? '/admin/wiki' : `/admin/wiki/${slug}`;
}
