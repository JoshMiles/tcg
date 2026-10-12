// Checks the public search and menu helpers: query cleaning, ranking and per-kind caps, hidden collectors, card deep links and the
// menu's arrow-key movement. Pure. Run: npx tsx scripts/check-site-search.mts
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const eq = (a: unknown, b: unknown, msg: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);

const s = await import('../lib/site-search');
const m = await import('../lib/menu-nav');

// ── cleaning ──
eq(s.cleanQuery('  @Alice  '), 'Alice', 'trims and drops a leading @');
eq(s.cleanQuery('a\u0000b\u001fc'), 'abc', 'control characters are removed');
eq(s.cleanQuery('x'.repeat(100)).length, s.MAX_QUERY, 'long input is capped');
eq(s.cleanQuery('@@@'), '', 'only @ signs is empty');

// ── items ──
const cards = [
  { number: 1, name: 'Cheesygidds', stars: 5, thumb: '/t/1.webp' }, { number: 2, name: 'Dinogidds', stars: 5 },
  { number: 3, name: 'Cheesy Nacho', stars: 2 }, { number: 4, name: 'Gouda Goblin', stars: 1 },
];
const users = ['Alice', 'alice', 'bob_the_builder', 'carol', 'cheesemaster', 'Hidden_Hank'];
const items = s.buildEntityItems(users, new Set(['hidden_hank']), cards);
ok(!items.some(i => i.label === 'hidden_hank'), 'hidden collectors are never searchable');
eq(items.filter(i => i.label === 'alice').length, 1, 'names are lower-cased and de-duplicated');
eq(items.find(i => i.id === 'card:1')?.href, '/cards?card=1', 'a card links to its dex entry');
eq(items.find(i => i.id === 'player:bob_the_builder')?.href, '/collection/bob_the_builder', 'a collector links to their collection');
ok(items.find(i => i.id === 'player:carol')?.href === '/collection/carol', 'player href');

// ── ranking ──
const all = [...s.PUBLIC_PAGES, ...items];
const top = (q: string) => s.rankSearch(all, q)[0]?.label;
eq(top('alice'), 'alice', 'a collector by name');
eq(top('builder'), 'bob_the_builder', 'a word inside a name');
eq(top('gouda'), 'Gouda Goblin', 'a card by name');
eq(top('leaderboard'), 'Leaderboard', 'a page by name');
ok(s.rankSearch(all, 'ranking').some(i => i.id === 'page:leaderboard'), 'page keywords match');
ok(s.rankSearch(all, 'chees').some(i => i.id === 'card:1') && s.rankSearch(all, 'chees').some(i => i.id === 'player:cheesemaster'), 'a query can match both cards and collectors');
eq(s.rankSearch(all, ''), [], 'an empty query returns nothing');
eq(s.rankSearch(all, '   @  '), [], 'a query that cleans to nothing returns nothing');
eq(s.rankSearch(all, 'zzzzqqq'), [], 'nonsense matches nothing');
const many = s.buildEntityItems(Array.from({ length: 30 }, (_, i) => `viewer${i}`), new Set(), []);
eq(s.rankSearch(many, 'viewer', 20).length, 5, 'collectors are capped so they cannot crowd out the rest');
ok(s.rankSearch(all, 'e', 6).length <= 6, 'the overall limit is respected');
ok(!s.rankSearch(all, 'alic').some(i => i.kind === 'page'), 'pages are not matched by scattered letters');
ok(!s.rankSearch(all, 'x').some(i => i.kind === 'page' && i.id === 'page:privacy'), 'unrelated pages are not suggested');

// ── menu keys ──
eq(m.nextMenuIndex(-1, 'ArrowDown', 3), 0, 'down from nothing goes to the first item');
eq(m.nextMenuIndex(2, 'ArrowDown', 3), 0, 'down wraps');
eq(m.nextMenuIndex(0, 'ArrowUp', 3), 2, 'up wraps');
eq(m.nextMenuIndex(-1, 'ArrowUp', 3), 2, 'up from nothing goes to the last item');
eq([m.nextMenuIndex(1, 'Home', 3), m.nextMenuIndex(1, 'End', 3)], [0, 2], 'Home and End');
eq(m.nextMenuIndex(0, 'a', 3), null, 'other keys are not handled');
eq(m.nextMenuIndex(0, 'ArrowDown', 0), null, 'an empty menu does nothing');

console.log('site search checks passed');
