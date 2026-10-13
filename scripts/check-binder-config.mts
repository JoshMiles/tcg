// Pure checks for binder customisation: config validation, grid sizes, sorts and hand-placed pages.
// Run: npx tsx scripts/check-binder-config.mts
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const b = await import('../lib/binder');
const c = await import('../lib/binder-config');
type Page = import('../lib/binder-config').BinderPageCfg;

// Defaults store nothing; junk is dropped; limits are enforced.
ok(c.sanitizeBinder(null) === null && c.sanitizeBinder({}) === null && c.sanitizeBinder('x') === null, 'nothing, or an empty object, is the default (null)');
ok(c.sanitizeBinder({ ...c.DEFAULT_BINDER }) === null, 'the default config is stored as null');
const odd = c.sanitizeBinder({ title: ('  Hello\u0000   world  ').padEnd(80, 'x'), cover: 'nope', material: 'cloth', emblem: 'bad', cols: 99, rows: -4, pocketStyle: 'sleeve', evil: 1 })!;
ok(odd.title.length === 40 && !odd.title.includes('\u0000') && odd.title.startsWith('Hello world'), 'title is cleaned and capped');
ok(odd.cover === 'saddle' && odd.emblem === 'cheese' && odd.material === 'cloth' && odd.pocketStyle === 'sleeve', 'unknown options fall back, known ones stay');
ok(odd.cols === 4 && odd.rows === 1 && !('evil' in odd), 'grid size is clamped and unknown keys dropped');
ok(c.sanitizeBinder({ mode: 'custom', cols: 3, rows: 3 }) === null, 'custom mode with no pages is just auto (and so default)');

// Pages: padded to the grid, bad slots become empty, duplicates are allowed, version pins validated.
const withPages = c.sanitizeBinder({ mode: 'custom', pagesSeason: 's1', cols: 2, rows: 2, pages: [
  { title: 'One', slots: [{ card: 5, variant: 'shiny' }, { card: 5, variant: 'bogus' }, { card: -1 }, 'x'] },
  { title: 'Two', slots: [{ card: 7 }] },
  'junk',
] })!;
ok(withPages.mode === 'custom' && withPages.pages.length === 2 && withPages.pagesSeason === 's1', 'pages kept, junk page dropped');
ok(withPages.pages.every(p => p.slots.length === 4), 'every page is padded to the grid');
ok(withPages.pages[0].slots[0]?.variant === 'shiny' && withPages.pages[0].slots[1]?.variant === null && withPages.pages[0].slots[2] === null && withPages.pages[0].slots[3] === null, 'versions validated, bad slots empty');
ok(c.sanitizeBinder({ mode: 'custom', cols: 3, rows: 3, pages: new Array(80).fill({ title: 'p', slots: [] }) })!.pages.length === c.BINDER_LIMITS.pages, 'page count is capped');

// Shrinking the grid moves overflow cards onto a new page instead of dropping them.
const fat: Page[] = [{ title: 'A', slots: Array.from({ length: 9 }, (_, i) => ({ card: i + 1, variant: null })) }];
const slim = c.reflowPages(fat, 4);
ok(slim.length === 3 && slim.every(p => p.slots.length === 4), '9 cards at 4 per page: three pages');
ok(slim.flatMap(p => p.slots).filter(Boolean).map(s => s!.card).join() === '1,2,3,4,5,6,7,8,9', 'no card is lost or reordered');
ok(slim[1].title === 'A (more)', 'overflow pages are labelled');
ok(c.reflowPages(slim, 9).length === 3, 'growing again does not merge pages (it only pads)');

// Page editing.
let pg = c.addPage([], 4);
ok(pg.length === 1 && pg[0].slots.length === 4 && pg[0].slots.every(s => s === null), 'a new page is empty');
pg = c.setSlot(pg, 0, 1, { card: 3, variant: 'full' });
ok(pg[0].slots[1]?.card === 3 && c.setSlot(pg, 0, 9, { card: 1, variant: null })[0].slots.length === 4, 'setSlot ignores a pocket that does not exist');
pg = c.addPage(pg, 4);
pg = c.renamePage(pg, 1, '  Shinies  ');
ok(pg[1].title === 'Shinies', 'rename trims');
ok(c.movePage(pg, 1, 0)[0].title === 'Shinies' && c.movePage(pg, 5, 0) === pg, 'move, and a bad index changes nothing');
ok(c.nextEmpty(pg, 0, 1)?.slot === 2, 'the next empty pocket');
const nearlyFull = c.setSlot(c.setSlot(pg, 0, 2, { card: 1, variant: null }), 0, 3, { card: 2, variant: null }); // slots 1, 2, 3 taken; slot 0 empty
ok(c.nextEmpty(nearlyFull, 0, 1)?.page === 1, 'onto the next page when the rest of this one is full');
ok(c.nextEmpty([{ title: '', slots: [{ card: 1, variant: null }] }], 0, 0) === null, 'a full binder has no next empty pocket');
const sw = c.swapSlots(pg, { page: 0, slot: 1 }, { page: 1, slot: 0 });
ok(sw[0].slots[1] === null && sw[1].slots[0]?.card === 3, 'swapping with an empty pocket moves the card');
ok(c.clearPage(pg, 0)[0].slots.every(s => s === null) && c.removePage(pg, 0).length === 1, 'clear and delete a page');
ok(c.addPage(new Array(c.BINDER_LIMITS.pages).fill(pg[0]), 4).length === c.BINDER_LIMITS.pages, 'cannot add past the page limit');

// Layouts: grid size, sort, grouping, hiding.
const cards = [
  { packName: 'A', number: 1, stars: 1, name: 'Zed', owned: false }, { packName: 'A', number: 2, stars: 5, name: 'Bob', owned: true },
  { packName: 'A', number: 3, stars: 3, name: 'Amy', owned: true }, { packName: 'B', number: 4, stars: 2, name: 'Cat', owned: false },
];
const nums = (p: import('../lib/binder').BinderPage) => p.slots.filter(s => s !== null).map(s => cards[s!].number).join();
const two = b.buildBinderPages(cards, { cap: 2 });
ok(two.length === 4 && two[1].slots.length === 2 && nums(two[1]) === '1,2' && nums(two[2]) === '3' && two[3].pack === 'B', 'two pockets per page, packs apart');
ok(nums(b.buildBinderPages(cards, { cap: 4, sort: 'rarity' })[1]) === '2,3,1', 'rarest first within a pack');
ok(nums(b.buildBinderPages(cards, { cap: 4, sort: 'name' })[1]) === '3,2,1', 'by name');
ok(nums(b.buildBinderPages(cards, { cap: 4, sort: 'collected' })[1]) === '2,3,1', 'collected first');
const all = b.buildBinderPages(cards, { cap: 4, group: false });
ok(all.length === 2 && all[1].pack === 'All cards' && nums(all[1]) === '1,2,3,4', 'one run of all cards');
ok(b.buildBinderPages(cards, { cap: 4, hideUncollected: true }).flatMap(p => p.slots).filter(s => s !== null).length === 2, 'uncollected cards can be left out');
ok(b.buildBinderPages(cards, { cap: 16 })[1].slots.length === 16, 'a 4x4 page has sixteen pockets');
ok(b.buildBinderPages(cards.map(({ packName, number }) => ({ packName, number })), { cap: 9 }).length === 3, 'cards without extra info still lay out (old call shape)');

// Hand-placed pages resolve card numbers to indexes; a number that is not in the season is an empty pocket.
const hand = b.buildCustomPages(cards, [{ title: 'Faves', slots: [{ card: 3, variant: 'shiny' }, { card: 999, variant: null }, null, { card: 2, variant: null }] }], 4);
ok(hand.length === 2 && hand[0].kind === 'cover' && hand[1].title === 'Faves' && hand[1].cfgIndex === 0, 'a cover then the hand-made page, tagged with its saved index');
ok(hand[1].slots.join() === '2,,,1' && hand[1].pins!.join() === 'shiny,,,', 'card numbers become indexes, pins follow, unknown numbers are empty');
ok(b.buildCustomPages(cards, [], 4).length === 1, 'no custom pages: just the cover');
ok(b.buildCustomPages(cards, [{ title: 'x', slots: Array.from({ length: 6 }, () => ({ card: 1, variant: null })) }], 4).length === 3, 'a page with too many cards for the grid spills onto another');

// Filling pages from the automatic layout keeps every card once and names the pages.
const filled = b.autoFillPages(cards, { cols: 2, rows: 1, sort: 'number', groupByPack: true, hideUncollected: false });
ok(filled.length === 3 && filled[0].title === 'A 1/2' && filled[2].title === 'B', 'auto-fill makes titled pages');
ok(filled.flatMap(p => p.slots).filter(Boolean).length === 4, 'every card appears once');

// The user settings carry it through (and drop it when it is the default).
const us = await import('../lib/user-settings');
ok(us.sanitizeUserSettings({}).binder === null && us.sanitizeUserSettings({ binder: { cover: 'navy' } }).binder?.cover === 'navy', 'settings keep a binder');
ok(!('binder' in us.sparse(us.sanitizeUserSettings({ binder: {} }))), 'a default binder is not stored');

console.log('binder customisation checks passed');
