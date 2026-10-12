// Checks the Card Dex's filtering and sorting. Pure.  Run: npx tsx scripts/check-dex.mts
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const eq = (a: unknown, b: unknown, msg: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
const d = await import('../lib/dex-view');

const c = (number: number, name: string, stars: number, packName: string, pullRate: number, copies: number, collectors: number, value: number, owned?: boolean, wanted?: boolean) =>
  ({ number, name, stars, packName, pullRate, copies, collectors, value, owned, wanted });
const cards = [
  c(1, 'Cheesy Cat', 1, 'A', 0.2, 30, 10, 10, true),
  c(2, 'Brie Bear', 3, 'A', 0.05, 4, 3, 60, false, true),
  c(3, 'Gouda Goat', 5, 'B', 0.01, 0, 0, 300, false),
  c(4, 'Swiss Swan', 2, 'B', 0.1, 12, 6, 25, true),
];
const run = (f: Partial<import('../lib/dex-view').DexFilter>) => d.applyDex(cards, { ...d.DEFAULT_DEX, ...f }).map(x => x.number);

eq(run({}), [1, 2, 3, 4], 'default: card number');
eq(run({ sort: 'rarity' }), [3, 2, 4, 1], 'rarest first = smallest pull rate first');
eq(run({ sort: 'rarity', dir: -1 }), [1, 4, 2, 3], 'reversed');
eq(run({ sort: 'value' }), [3, 2, 4, 1], 'most valuable first');
eq(run({ sort: 'copies' }), [1, 4, 2, 3], 'most pulled first');
eq(run({ sort: 'collectors' }), [1, 4, 2, 3], 'most collectors first');
eq(run({ sort: 'name' }), [2, 1, 3, 4], 'name a to z');
eq(run({ sort: 'missing' }), [2, 3, 1, 4], 'missing first, ties by number');
eq(run({ show: 'collected' }), [1, 4], 'collected');
eq(run({ show: 'missing' }), [2, 3], 'missing');
eq(run({ show: 'wanted' }), [2], 'wanted');
eq(run({ show: 'undiscovered' }), [3], 'undiscovered = nobody has pulled it');
eq(run({ stars: 3 }), [2], 'rarity');
eq(run({ pack: 'B' }), [3, 4], 'pack');
eq(run({ q: 'swan' }), [4], 'search by name');
eq(run({ q: '#2' }), [2], 'search by number');
eq(d.dexProgress(cards), { owned: 2, total: 4, pct: 50 }, 'progress');
eq(d.dexProgress([]), { owned: 0, total: 0, pct: 0 }, 'progress of nothing');
console.log('dex checks passed');
