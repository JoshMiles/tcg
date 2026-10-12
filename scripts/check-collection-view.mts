// Checks the profile's collection filters / sort / progress / compare, the profile experiments' settings and the showcase. Pure.
// Run: npx tsx scripts/check-collection-view.mts
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const eq = (a: unknown, b: unknown, msg: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);

const v = await import('../lib/collection-view');
const s = await import('../lib/user-settings');
const pd = await import('../lib/profile-data');

const none = { regular: 0, reverse: 0, full: 0, shiny: 0 };
const vals = { regular: 10, reverse: 30, full: 80, shiny: 300 };
const mk = (number: number, name: string, stars: number, packName: string, counts: Partial<typeof none>) => ({ number, name, stars, packName, counts: { ...none, ...counts }, values: vals });
const cards = [
  mk(1, 'Cheesy Cat', 1, 'A', { regular: 3 }),
  mk(2, 'Brie Bear', 3, 'A', {}),
  mk(3, 'Gouda Goat', 5, 'B', { shiny: 1 }),
  mk(4, 'Swiss Swan', 2, 'B', { regular: 1, reverse: 1 }),
];
const run = (view: Partial<import('../lib/collection-view').ViewState>, hide = true, mine?: Record<number, number>) =>
  v.applyView(cards, { ...v.DEFAULT_VIEW, ...view }, { hideUncollected: hide, mine }).map(i => cards[i].number);

eq(run({}), [1, 3, 4], 'default hides uncollected');
eq(run({}, false), [1, 2, 3, 4], 'default shows everything when not hiding');
eq(run({ show: 'missing' }), [2], 'missing');
eq(run({ show: 'dupes' }), [1, 4], 'duplicates are 2+ copies, any version');
eq(run({ show: 'versions' }), [3, 4], 'special versions');
eq(run({ stars: 5, show: 'all' }), [3], 'rarity filter');
eq(run({ pack: 'B', show: 'all' }), [3, 4], 'pack filter');
eq(run({ q: 'swan' }), [4], 'search by name');
eq(run({ q: '#3' }), [3], 'search by number');
eq(run({ sort: 'rarity' }), [3, 4, 1], 'rarity sorts high first');
eq(run({ sort: 'rarity', dir: -1 }), [1, 4, 3], 'direction reverses');
eq(run({ sort: 'value' }), [3, 4, 1], 'points sort: shiny 300 > 10+30 > 3x10');
eq(run({ sort: 'name' }), [1, 3, 4], 'name sorts a to z');
eq(run({ sort: 'copies' }), [1, 4, 3], 'copies sort, ties by number');

eq(v.packProgress(cards), [{ pack: 'A', owned: 1, total: 2, pct: 50 }, { pack: 'B', owned: 2, total: 2, pct: 100 }], 'per-pack progress');

const mine = { 2: 1, 3: 2, 9: 1 };
eq(run({ show: 'theyHave' }, true, mine), [1, 4], 'they have, I lack');
eq(run({ show: 'iHave' }, true, mine), [2], 'I have, they lack');
eq(run({ show: 'shared' }, true, mine), [3], 'both have');
eq(v.compareCollections(cards, mine), { shared: 1, theyHave: 2, iHave: 1, both: 4, total: 4 }, 'comparison counts');

// ── profile experiments ──
eq(s.sanitizeUserSettings({ accent: 'nope', wanted: 'x' }).accent, '', 'unknown accent dropped');
eq(s.sanitizeUserSettings({ accent: 'grape' }).accent, 'grape', 'known accent kept');
eq(s.sanitizeUserSettings({ wanted: [3, 3, 0, -1, 1.5, '4', 1_000_000, 7, 8, 9, 10, 11, 12] }).wanted, [3, 7, 8, 9, 10, 11], 'wanted: unique ints in range, capped at 6');
ok(['showcase', 'accent', 'wishlist'].every(id => s.EXPERIMENTS.some(e => e.id === id)), 'profile experiments are registered');
eq(s.sparse({ ...s.DEFAULT_SETTINGS, wanted: [2] }), { wanted: [2] }, 'wanted is stored sparsely');

const info = (n: number) => ({ number: n, name: `c${n}`, imageUrl: '', stars: 1 });
const top = pd.topCopies([info(1), info(2), info(3), info(4)],
  new Map([[1, { ...none, regular: 5 }], [3, { ...none, regular: 1, shiny: 1 }], [4, { ...none, reverse: 1 }]]),
  new Map([[1, { values: vals }], [3, { values: vals }], [4, { values: vals }]]), 2);
eq(top.map(t => [t.number, t.variant]), [[3, 'shiny'], [4, 'reverse']], 'showcase: best version per card, most valuable first, capped');
console.log('collection view checks passed');
