// The home feed's arrivals (ROADMAP 48.2): the newest 100 log entries are read first, the whole log only when they hold too few.
// Mock KV: node scripts/mock-kv.cjs. Run: npx tsx scripts/check-recent-arrivals.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const { recordActivity } = await import('../lib/activity');
const { getRecentCardArrivals } = await import('../lib/site-data');

const pull = (username: string, n: number, collectionName = 'c1') => recordActivity({ type: 'pull', cardNumber: n, cardName: `Card ${n}`, stars: 1, packName: 'P', isNew: true, copies: 1, uniqueOwned: 1, username, collectionName });
const noise = (n: number) => Promise.all(Array.from({ length: n }, () => recordActivity({ type: 'collection_shown', username: 'x', collectionName: 'c1' })));

for (let i = 1; i <= 3; i++) await pull('amy', i);
await pull('amy', 99, 'other-season');
let got = await getRecentCardArrivals('c1', 16);
ok(got.length === 3 && got.map(e => e.type === 'pull' && e.cardNumber).join() === '3,2,1', `newest first, this season only: ${JSON.stringify(got.map(e => e.seq))}`);

await noise(150); // buries the three pulls below the newest 100 entries
got = await getRecentCardArrivals('c1', 16);
ok(got.length === 3, `a long run of other events still finds the pulls (${got.length})`);

for (let i = 4; i <= 8; i++) await pull('bob', i);
got = await getRecentCardArrivals('c1', 4);
ok(got.length === 4 && got[0].type === 'pull' && got[0].cardNumber === 8, 'limit applies to the newest');
console.log('ok');
