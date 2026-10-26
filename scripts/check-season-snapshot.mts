// Two reads of the shared season snapshot within the TTL hit KV for the collection blob once (ROADMAP 40.2d), and a direct read
// still does. Needs the mock KV (npm run check starts it); refuses anything non-local.
// Run: npx tsx scripts/check-season-snapshot.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';

const kvLib = await import('../lib/kv');
const { getCollectionCached, getSeasonLeaderboardCached } = await import('../lib/leaderboard');
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const season = { id: 'snap', name: 'Snap', collectionName: 'SNAP', active: false, status: 'published' as const, createdAt: 1, maxConcurrentPacks: 1, packIds: [] };
await kvLib.saveSeason(season);
await kvLib.saveCollection('SNAP', { amy: [1, 2], ben: [3] });

// Count the whole-collection reads (HGETALL of the season's hash).
let reads = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  const body = String(init?.body ?? '');
  if (/hgetall/i.test(body) && body.includes('coll:SNAP')) reads++;
  return realFetch(input, init);
}) as typeof fetch;

const a = await getCollectionCached(season);
const b = await getCollectionCached(season);
await getSeasonLeaderboardCached(season);
ok(reads === 1, `three cached reads within the TTL read the collection once (got ${reads})`);
ok(a === b && a.amy.length === 2, 'both calls return the same loaded collection');
await kvLib.getCollection('SNAP');
ok(reads === 2, 'the direct read still goes to KV');
console.log('check-season-snapshot ok');
