// The docs check (scripts/check-docs.mjs): stale docs, the "No change needed" opt-out, rotted globs, unmapped docs, docs-only PRs, the
// globber and the wiki "covers:" line. Pure. Run: npx tsx scripts/check-check-docs.mts
import { bridgeNotesProblems, docsOptOuts, docsProblems, globToRegExp, parseCovers } from './check-docs.mjs';

const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

ok(globToRegExp('lib/*.ts').test('lib/a.ts') && !globToRegExp('lib/*.ts').test('lib/x/a.ts'), '* stays in one folder');
ok(globToRegExp('app/**').test('app/a/b/c.tsx') && globToRegExp('a/**/b.ts').test('a/b.ts') && globToRegExp('a/**/b.ts').test('a/x/y/b.ts'), '** crosses folders');
ok(globToRegExp('app/(site)/[id]/p?.tsx').test('app/(site)/[id]/p1.tsx') && !globToRegExp('a.ts').test('aXts'), '? is one char; brackets, parentheses and dots are literal');

const files = ['lib/a.ts', 'lib/b.ts', 'docs/a.md', 'docs/b.md', 'docs/archive/old.md', 'docs/doc-map.json', 'content/wiki/w.md', 'ROADMAP.md', 'HANDOFF.md', '.github/pull_request_template.md', 'README.md'];
const entries = [
  { doc: 'docs/a.md', code: ['lib/a.ts'] },
  { doc: 'docs/b.md', code: ['lib/b.ts'] },
  { doc: 'content/wiki/w.md', code: ['lib/*.ts'], exclude: ['lib/b.ts'] },
  { doc: 'README.md', code: ['docs/doc-map.json'] },
];
const ignore = ['docs/archive/**'];
const run = (changed: string[], body = '', over: Record<string, unknown> = {}) => docsProblems({ entries, ignore, files, changed, body, ...over });
const mentions = (problems: string[], ...needles: string[]) => needles.every(n => problems.join('\n').includes(n));

ok(run([]).length === 0, 'the sample map is clean');

// stale doc
let p = run(['lib/a.ts']);
ok(mentions(p, 'docs/a.md', 'lib/a.ts', 'No change needed: docs/a.md:'), 'a changed file without its doc is stale, with the line to add');
ok(!mentions(p, 'docs/b.md'), 'an unrelated doc is not stale');
ok(p.join('\n').includes('content/wiki/w.md'), 'a wiki page is covered through its own globs');
ok(run(['lib/a.ts', 'docs/a.md', 'content/wiki/w.md']).length === 0, 'changing the doc itself clears it');
ok(!run(['lib/b.ts']).join('\n').includes('content/wiki/w.md'), 'exclude removes a path from a doc');

// opt-out
const skip = (line: string) => `## Docs\n${line}\n\n## Test plan\nx`;
ok(run(['lib/a.ts', 'docs/a.md', 'content/wiki/w.md'], skip('x')).length === 0, 'no opt-out needed when the doc changed');
ok(!run(['lib/a.ts', 'content/wiki/w.md'], skip('No change needed: docs/a.md: only renamed a local variable')).length, 'a named doc with a reason is skipped');
ok(!run(['lib/a.ts'], skip('- No change needed: all: internal refactor, behaviour unchanged')).length, '"all" skips every doc');
ok(!run(['lib/a.ts'], skip('No change needed: docs/a.md, content/wiki/w.md: internal refactor only')).length, 'a comma list skips each');
ok(run(['lib/a.ts', 'content/wiki/w.md'], skip('No change needed: docs/b.md: nothing relevant here')).length > 0, 'skipping a different doc does not help');
ok(mentions(run(['lib/a.ts', 'content/wiki/w.md'], skip('No change needed: docs/a.md: fine')), 'too short'), 'a too-short reason fails and says so');
ok(run(['lib/a.ts', 'content/wiki/w.md'], 'No change needed: docs/a.md: only a comment changed').length > 0, 'the line counts only inside the ## Docs section');
ok(run(['lib/a.ts', 'content/wiki/w.md'], '## Docs\n<!-- No change needed: docs/a.md: only a comment changed -->\n').length > 0, 'the template hint comment is not an opt-out');
ok(docsOptOuts('## Docs\nDocs updated: x\nno change needed: docs/a.md: ok to skip\n## Test plan\nNo change needed: docs/b.md: later section').length === 1, 'opt-outs end at the next heading, case-insensitive');

// rotted glob and missing doc
p = run([], '', { entries: [...entries, { doc: 'docs/b.md', code: ['lib/gone/**'] }] });
ok(mentions(p, 'lib/gone/**', 'matches no file'), 'a glob that matches nothing fails');
p = run([], '', { entries: [...entries, { doc: 'docs/missing.md', code: ['lib/a.ts'] }] });
ok(mentions(p, 'docs/missing.md', 'does not exist'), 'an entry for a missing doc fails');
ok(mentions(run([], '', { entries: [...entries, { doc: 'docs/b.md', code: [] }] }), 'lists no code globs'), 'a doc with no globs fails');

// unmapped docs
ok(mentions(run([], '', { entries: entries.filter(e => e.doc !== 'docs/b.md') }), 'docs/b.md is not in docs/doc-map.json'), 'an unmapped doc fails');
ok(!run([], '', { entries: entries.filter(e => e.doc !== 'docs/b.md'), files: files.filter(f => f !== 'docs/b.md') }).length, 'archived docs need no mapping');
ok(mentions(run([], '', { entries: entries.filter(e => e.doc !== 'content/wiki/w.md') }), 'content/wiki/w.md is not in'), 'a wiki page without covers fails');

// docs-only PRs pass
ok(run(['docs/a.md', 'docs/b.md', 'content/wiki/w.md', 'ROADMAP.md', 'HANDOFF.md', '.github/pull_request_template.md']).length === 0, 'a docs-only PR passes');
ok(run(['ROADMAP.md', 'HANDOFF.md']).length === 0, 'ROADMAP/HANDOFF-only PRs pass');

// the wiki front matter
ok(parseCovers('---\ntitle: T\ncovers: lib/*.ts, app/x/**\n---\nbody covers: no').join('|') === 'lib/*.ts|app/x/**', 'covers: is read from the front matter');
ok(parseCovers('---\ntitle: T\n---\ncovers: lib/a.ts').length === 0, 'covers: in the body is ignored');
ok(parseCovers('---\r\ntitle: T\r\ncovers: lib/a.ts\r\n---\r\n').join() === 'lib/a.ts', 'CRLF pages parse');

// the TCG Bridge notes rule
const notes = (changed: string[], body: string) => bridgeNotesProblems({ changed, body });
const withBullets = '## Summary\nx\n\n## TCG Bridge\n- Shows what changed for you.\n\n## Docs\nx';
ok(notes(['lib/a.ts', 'bridge/README.md'], '## Summary\nx').length === 0, 'a PR that does not touch the app needs no section');
ok(notes(['bridge/src/main.ts'], withBullets).length === 0, 'a bridge PR with a bulleted section passes');
ok(notes(['streamdeck/src/keys.ts'], withBullets.replace('- Shows', '* Shows')).length === 0, 'a streamdeck PR passes, with a * bullet');
ok(mentions(notes(['bridge/src/main.ts'], '## Summary\nx\n\n## Docs\nx'), '## TCG Bridge'), 'a bridge PR without the section fails and says what to add');
ok(notes(['streamdeck/manifest.json'], '## Summary\nx').length === 1, 'a streamdeck PR without the section fails');
ok(notes(['bridge/src/main.ts'], '## TCG Bridge\n\n## Docs\n- not in the section').length === 1, 'an empty section fails; bullets after the next heading do not count');
ok(notes(['bridge/src/main.ts'], '## TCG Bridge\r\n- ok\r\n## Docs').length === 0, 'CRLF bodies parse');
ok(notes(['bridge/src/main.ts'], '## TCG Bridge\n<!-- - a commented bullet -->\n## Docs').length === 1, 'a bullet inside a comment does not count');
ok(notes(['bridge/src/main.ts'], '## TCG Bridge\nplain text only\n## Docs').length === 1, 'text without a bullet does not count');

console.log('check-docs checks passed');
