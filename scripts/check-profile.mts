// Checks the profile pages' addresses and the old-link redirect. Pure (reads the app folder, no database).
// Run: npx tsx scripts/check-profile.mts
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const eq = (a: unknown, b: unknown, msg: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);

const p = await import('../lib/profile-url');

// ── addresses ──
eq(p.profileHref('Alice'), '/u/alice', 'lower-cased');
eq(p.profileHref('  bob_the_builder '), '/u/bob_the_builder', 'trimmed');
eq(p.profileHref('a b/c#d'), '/u/a%20b%2Fc%23d', 'unsafe characters are encoded');
eq(p.profileHref('alice', 'overview'), '/u/alice', 'the overview is the plain address');
eq(p.profileHref('alice', 'collection'), '/u/alice?tab=collection', 'the collection is its own tab');
eq(p.profileHref('alice', 'stats'), '/u/alice?tab=stats', 'other tabs add ?tab=');
eq(p.profileTitle('Alice', 'overview'), "Alice's profile", 'the overview title');
eq(['collection', 'stats', 'trades', 'activity', 'share'].map(t => p.profileTitle('Alice', t as never)), ["Alice's collection", "Alice's stats", "Alice's trades", "Alice's activity", "Alice's share"], 'every other tab uses the same pattern');
eq(p.pickProfileTab('trades'), 'trades', 'a known tab');
eq(p.pickProfileTab('nope'), 'overview', 'an unknown tab falls back');
eq(p.pickProfileTab(undefined), 'overview', 'no tab falls back');
eq(new Set(p.PROFILE_TABS.map(t => t.id)).size, p.PROFILE_TABS.length, 'tab ids are unique');
ok(p.PUBLIC_ACTIVITY_TYPES.every(t => ['pull', 'upgrade', 'trade', 'buff'].includes(t)) && !(p.PUBLIC_ACTIVITY_TYPES as readonly string[]).includes('grant'), 'the public activity feed never includes admin grants / removals / resets');
eq(p.publicActivityHref({ type: 'pull', cardNumber: 4, uid: 1000007 }, 'season2'), '/c/1000007', 'a pull with a edition number opens that print');
eq(p.publicActivityHref({ type: 'upgrade', cardNumber: 4, copyId: '4.2.1' }, 'season2'), '/copy/season2/4.2.1', 'an upgrade with only a print id opens that print');
eq(p.publicActivityHref({ type: 'pull', cardNumber: 4 }, 'season2'), '/cards?card=4', 'a pull with neither a edition number nor a print id opens the card dex');
eq(p.publicActivityHref({ type: 'trade', tradeId: 'abc' }, 'season2'), '/trade/abc', 'a trade that recorded its id opens the offer');
eq(p.publicActivityHref({ type: 'trade' }, 'season2'), null, 'an older trade without an id stays plain text');
eq(p.publicActivityHref({ type: 'grant', cardNumber: 1, uid: 1000007 }, 'season2'), null, 'a grant is not a public activity link');

// ── the old address redirects, and nothing inside the site still links to it ──
const root = process.cwd();
const old = readFileSync(join(root, 'app/collection/[username]/page.tsx'), 'utf8');
ok(/permanentRedirect\(/.test(old) && /profileHref\(/.test(old), '/collection/<name> permanently redirects to the profile');
function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const f = join(dir, name);
    if (statSync(f).isDirectory()) { if (!['node_modules', '.next', 'admin'].includes(name)) yield* files(f); }
    else if (/\.(tsx?|mts)$/.test(name)) yield f;
  }
}
const stale: string[] = [];
for (const dir of ['app', 'lib']) for (const f of files(join(root, dir))) {
  const rel = relative(root, f);
  if (rel === 'lib/profile-url.ts' || rel === 'app/collection/[username]/page.tsx') continue; // they explain the old address
  readFileSync(f, 'utf8').split('\n').forEach((line, i) => { if (/\/collection\/(\$\{|<|\w)/.test(line) && !line.trim().startsWith('//')) stale.push(`${rel}:${i + 1}`); });
}
eq(stale, [], 'no internal link still points at /collection/<name> (it should be /u/<name>)');
ok(readFileSync(join(root, 'app/u/[username]/page.tsx'), 'utf8').includes('generateMetadata'), 'the profile has dynamic titles');
console.log('profile checks passed');
