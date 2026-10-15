// The home page's recent pulls: pulls AND granted cards, found even when many other events came after them, hidden collectors and
// other seasons left out. Needs the mock KV (npm run check starts it); refuses anything non-local.
// Run: npx tsx scripts/check-recent-pulls.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';

const kvLib = await import('../lib/kv');
const { recordActivity } = await import('../lib/activity');
const { recentPullItems } = await import('../lib/home-pulls');
const { SEED_CARDS } = await import('../lib/seed');
const { saveFlags } = await import('../lib/user-admin');

const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

await kvLib.seedSeason1();
const season = (await kvLib.listSeasons())[0];
const coll = season.collectionName;
const pull = (username: string, n: number, collectionName = coll) => recordActivity({
  type: 'pull', username, collectionName, cardNumber: n, cardName: SEED_CARDS[n - 1].name, stars: SEED_CARDS[n - 1].stars, packName: 'Pack', variant: 'regular', isNew: true, copies: 1, uniqueOwned: 1,
});

// One early pull, then more than the old 150-event window of other events on top of it: the pull must still be found.
await pull('early_bird', 3);
for (let i = 0; i < 200; i++) await recordActivity({ type: 'collection_shown', username: `viewer${i % 7}`, collectionName: coll });
let items = await recentPullItems(season, SEED_CARDS, 8);
ok(items.length === 1 && items[0].username === 'early_bird' && items[0].kind === 'pull', 'a pull buried under 200 other events is still shown');

// Granted cards appear, newest first, with the card's name and stars filled in from the season (a grant event carries only the number).
await recordActivity({ type: 'grant', source: 'admin', username: 'lucky', cardNumber: 1, variant: 'shiny', collectionName: coll });
await recordActivity({ type: 'grant', source: 'webhook', username: 'gifted', cardNumber: 16, collectionName: coll });
items = await recentPullItems(season, SEED_CARDS, 8);
ok(items.map(i => i.username).join() === 'gifted,lucky,early_bird', 'grants and pulls are merged, newest first');
const g = items.find(i => i.username === 'lucky')!;
ok(g.kind === 'grant' && g.cardName === SEED_CARDS[0].name && g.stars === SEED_CARDS[0].stars && g.variant === 'shiny', 'a grant gets its card name, stars and version');
ok(g.notable, 'a granted Shiny is highlighted like a pulled one');
ok(items.find(i => i.username === 'gifted')!.kind === 'grant' && !items.find(i => i.username === 'gifted')!.notable, 'an ordinary grant is not highlighted');
ok(items.find(i => i.username === 'early_bird')!.kind === 'pull', 'a pull stays a pull');

// A grant of a card the season does not have is left out rather than shown nameless.
await recordActivity({ type: 'grant', source: 'admin', username: 'ghost', cardNumber: 9999, collectionName: coll });
items = await recentPullItems(season, SEED_CARDS, 8);
ok(!items.some(i => i.username === 'ghost'), 'a grant of an unknown card is skipped');

// Other seasons' events and hidden collectors never show.
await pull('elsewhere', 2, 'SomeOtherSeason');
await kvLib.ensureUserProfile('hidden_hank');
await saveFlags('hidden_hank', { hideFromBoard: true, reason: 'check' });
await pull('hidden_hank', 4);
await recordActivity({ type: 'grant', source: 'admin', username: 'hidden_hank', cardNumber: 5, collectionName: coll });
items = await recentPullItems(season, SEED_CARDS, 8);
ok(!items.some(i => i.username === 'elsewhere'), 'another season\'s pulls are left out');
ok(!items.some(i => i.username === 'hidden_hank'), 'hidden collectors are left out, pulled or granted');

// The limit is respected and the newest come first.
for (let i = 0; i < 12; i++) await pull(`flood${i}`, 1 + (i % 5));
items = await recentPullItems(season, SEED_CARDS, 8);
ok(items.length === 8 && items[0].username === 'flood11' && items[7].username === 'flood4', 'limit 8 returns the eight newest');
ok(items.every((i, k) => k === 0 || items[k - 1].seq > i.seq), 'newest first');

console.log('recent pulls checks passed');
