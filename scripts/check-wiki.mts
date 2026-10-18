// The staff wiki: every topic file parses, renders, and only links to real topics or admin paths.
// Pure (reads the repo, no database). Run: npx tsx scripts/check-wiki.mts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const EM = String.fromCharCode(8212);

const { loadWiki, wikiHref } = await import('../lib/wiki');
const { wikiBlocks, wikiLink } = await import('../lib/wiki-markdown');

const docs = loadWiki();
ok(docs.length >= 8, `expected a full wiki, found ${docs.length}`);
ok(docs[0]?.slug === 'index', 'overview is first');
ok(new Set(docs.map(d => d.slug)).size === docs.length, 'slugs are unique');
ok(docs.every(d => d.title && d.summary && (d.body.includes('## ') || d.body.includes('| --- |'))), 'every page has a title, summary and a heading or a table');

const slugs = new Set(docs.map(d => d.slug));
for (const doc of docs) {
  const blob = `${doc.title}\n${doc.summary}\n${doc.body}`;
  ok(!blob.includes(EM), `${doc.slug}: no em dash`);
  ok(wikiBlocks(doc.body).some(b => b.kind === 'h2' || b.kind === 'table'), `${doc.slug}: a heading or table renders`);
  ok(wikiHref(doc.slug) === (doc.slug === 'index' ? '/admin/wiki' : `/admin/wiki/${doc.slug}`), `${doc.slug}: href`);
  for (const match of doc.body.matchAll(/\]\(([^)\s]+)\)/g)) {
    const href = match[1];
    ok(wikiLink(href), `${doc.slug}: rejected link ${href}`);
    const topic = /^\/admin\/wiki\/([a-z0-9-]+)$/.exec(href);
    if (topic) ok(slugs.has(topic[1]) && topic[1] !== 'index', `${doc.slug}: missing topic ${topic[1]}`);
  }
}

const nav = readFileSync(join(import.meta.dirname, '../lib/admin-nav.ts'), 'utf8');
ok(nav.includes("href: '/admin/wiki'"), 'the admin nav links to the wiki');
ok(readFileSync(join(import.meta.dirname, '../app/admin/page.tsx'), 'utf8').includes('href="/admin/wiki"'), 'the dashboard links to the wiki');
ok(wikiLink('/admin/wiki/viewers') === '/admin/wiki/viewers', 'site paths pass');
ok(wikiLink('https://cheesytcg.app/admin') === 'https://cheesytcg.app/admin', 'https passes');
ok(!wikiLink('javascript:alert(1)') && !wikiLink('//evil.example') && !wikiLink('http://evil.example'), 'unsafe links do not');

console.log(`wiki ok (${docs.length} pages)`);
