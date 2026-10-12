// Pure checks for the binder's page layout. Run: npx tsx scripts/check-binder.mts
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const b = await import('../lib/binder');
const mk = (pack: string, from: number, n: number) => Array.from({ length: n }, (_, i) => ({ packName: pack, number: from + i }));

// 25 cards in one pack (stored in rarity order, not number order): 3 pages, the last with 7 pockets filled.
const shuffled = mk('Starter', 1, 25).reverse();
const pages = b.buildBinderPages(shuffled);
ok(pages.length === 4 && pages[0].kind === 'cover', 'a cover plus three pages');
ok(pages.slice(1).every(p => p.slots.length === 9), 'every page has nine pockets');
ok(pages[3].slots.filter(s => s !== null).length === 7 && pages[3].slots[7] === null, 'the last page has empty pockets at the end');
const first = pages[1].slots.map(s => shuffled[s!].number);
ok(first.join() === '1,2,3,4,5,6,7,8,9', 'cards are in card-number order');
ok(pages.slice(1).flatMap(p => p.slots).filter(s => s !== null).length === 25 && new Set(pages.flatMap(p => p.slots).filter(s => s !== null)).size === 25, 'every card appears exactly once');
ok(pages[1].part === 1 && pages[1].parts === 3 && pages[3].part === 3, 'part numbers');

// Two packs: each starts on its own page, in the order they appear.
const two = b.buildBinderPages([...mk('A', 1, 10), ...mk('B', 100, 3)]);
ok(two.map(p => p.pack ?? 'cover').join() === 'cover,A,A,B', 'packs are kept apart and in order');

// Empty collection: just the cover.
ok(b.buildBinderPages([]).length === 1, 'no cards, only a cover');

// Spreads.
const d = b.buildSpreads(pages, true);
ok(d.length === 3 && d[0].left === undefined && d[0].right === pages[0], 'two-page mode opens on the cover alone');
ok(d[1].left === pages[1] && d[1].right === pages[2] && d[2].left === pages[3] && d[2].right === undefined, 'then pairs, the last may stand alone');
ok(b.buildSpreads(pages, false).length === 4, 'one-page mode: one spread per page');
ok(b.spreadOfPage(0, true) === 0 && b.spreadOfPage(1, true) === 1 && b.spreadOfPage(2, true) === 1 && b.spreadOfPage(3, true) === 2 && b.spreadOfPage(3, false) === 3, 'a page finds its spread');
ok(b.clampSpread(-3, 4) === 0 && b.clampSpread(9, 4) === 3 && b.clampSpread(1.7, 4) === 1 && b.clampSpread(2, 0) === 0, 'clamping');
console.log('binder checks passed');
