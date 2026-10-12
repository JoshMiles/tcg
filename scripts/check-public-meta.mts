// Checks the public site's search / sharing basics: every public page has a title and is either in the sitemap list or deliberately
// noindex, no title repeats the site name (the layout template adds it), the sitemap and robots rules are right, and the leaderboard
// cache behaves. Pure (reads the app folder, no database). Run: npx tsx scripts/check-public-meta.mts
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const eq = (a: unknown, b: unknown, msg: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);

const seo = await import('../lib/seo');
const { createTtlCache } = await import('../lib/ttl-cache');

// ── find every public page ──
const appDir = join(process.cwd(), 'app');
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out); else if (name === 'page.tsx') out.push(p);
  }
  return out;
}
const pages = walk(appDir)
  .map(file => ({ file, route: '/' + relative(appDir, file).split(sep).slice(0, -1).filter(s => !/^\(.*\)$/.test(s)).join('/') }))
  .map(p => ({ ...p, route: p.route === '/' ? '/' : p.route.replace(/\/$/, '') }))
  .filter(p => !p.route.startsWith('/admin'));

const known = new Set([...seo.INDEXED_PATHS.map(p => p.path), ...seo.NOINDEX_PATHS]);
const dynamicRoute = (r: string) => r.includes('[');
for (const p of pages) {
  if (dynamicRoute(p.route)) continue;
  ok(known.has(p.route), `public page ${p.route} is in neither INDEXED_PATHS nor NOINDEX_PATHS (lib/seo.ts)`);
}
for (const path of [...seo.INDEXED_PATHS.map(p => p.path), ...seo.NOINDEX_PATHS.filter(p => p !== '/admin')]) {
  ok(pages.some(p => p.route === path), `lib/seo.ts lists ${path} but there is no such page`);
}

// ── titles ──
const hasMeta = (src: string) => /export const metadata\b|export async function generateMetadata\b/.test(src);
for (const p of pages) {
  if (p.route === '/') continue; // the home page uses the site default
  const src = readFileSync(p.file, 'utf8');
  if (/permanentRedirect\(/.test(src)) continue; // a redirect-only address never renders, so it needs no title
  const layout = join(p.file, '..', 'layout.tsx');
  ok(hasMeta(src) || (existsSync(layout) && hasMeta(readFileSync(layout, 'utf8'))), `${p.route} has no title (export metadata or generateMetadata)`);
}
function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== 'admin' && name !== 'api') yield* sources(p); }
    else if (/\.tsx?$/.test(name)) yield p;
  }
}
for (const f of sources(appDir)) {
  const src = readFileSync(f, 'utf8');
  if (!hasMeta(src)) continue; // only files that declare page metadata (a share-sheet title in a client component is not a page title)
  for (const m of src.matchAll(/title:\s*[`'"]([^`'"]*)[`'"]/g)) {
    ok(!/The Cheesy TCG\s*$/.test(m[1]) || f.endsWith('layout.tsx'), `${relative(process.cwd(), f)}: title "${m[1]}" repeats the site name (the template adds it)`);
  }
}
// noindex pages say so
for (const route of ['/account', '/trade/new', '/auth/error']) {
  const page = pages.find(p => p.route === route)!;
  ok(/index:\s*false/.test(readFileSync(page.file, 'utf8')), `${route} should be noindex`);
}
ok(/index:\s*false/.test(readFileSync(join(appDir, 'login', 'layout.tsx'), 'utf8')), '/login should be noindex');

// ── sitemap ──
const map = seo.buildSitemap('https://example.test/', [{ id: 's1', status: 'published', createdAt: 1 }, { id: 's2', status: 'draft' }, { id: 's3' }], new Date(0));
const urls = map.map(m => m.url);
ok(urls.includes('https://example.test'), 'the home page has no trailing slash');
ok(urls.includes('https://example.test/leaderboard/s1') && urls.includes('https://example.test/leaderboard/s3'), 'published seasons are listed');
ok(!urls.includes('https://example.test/leaderboard/s2'), 'draft seasons are not');
ok(!urls.some(u => /\/\/.*\/\//.test(u.replace('https://', ''))), 'no double slashes');
ok(seo.INDEXED_PATHS.every(p => urls.includes('https://example.test' + (p.path === '/' ? '' : p.path))), 'every indexed page is listed');
ok(!urls.some(u => /account|trade|login|admin/.test(u)), 'private pages are not listed');
ok(map.every(m => m.priority >= 0 && m.priority <= 1), 'priorities are in range');

// ── robots ──
ok(seo.DISALLOWED_PATHS.includes('/admin') && seo.DISALLOWED_PATHS.includes('/api/') && seo.DISALLOWED_PATHS.includes('/login'), 'robots keeps crawlers out of admin, api and login');
ok(!seo.DISALLOWED_PATHS.some(p => seo.INDEXED_PATHS.some(i => i.path !== '/' && (i.path === p || i.path.startsWith(p + '/')))), 'robots does not block an indexed page');

// ── ttl cache ──
let t = 0;
const cache = createTtlCache<number>(1000, () => t, 3);
let calls = 0;
const compute = async () => { calls++; await new Promise(r => setTimeout(r, 5)); return calls; };
const [a, b, c] = await Promise.all([cache.get('k', compute), cache.get('k', compute), cache.get('k', compute)]);
eq([a, b, c, calls], [1, 1, 1, 1], 'simultaneous callers share one computation');
t = 500; eq(await cache.get('k', compute), 1, 'a value within the TTL is reused');
t = 1500; eq(await cache.get('k', compute), 2, 'an expired value is recomputed');
let failed = false; try { await cache.get('bad', async () => { throw new Error('x'); }); } catch { failed = true; }
ok(failed, 'a failure is passed on');
eq(await cache.get('bad', async () => 99), 99, 'and is not cached');
t = 2000; for (const k of ['a', 'b', 'c', 'd']) await cache.get(k, async () => 1);
ok(cache.size() <= 3, 'the cache stays within its size limit');
cache.clear(); eq(cache.size(), 0, 'clear empties it');

console.log('public meta checks passed');
