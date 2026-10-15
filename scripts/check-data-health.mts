// Data health: sizes of the stored collections, the serial ledger and the capped lists, and the dashboard's size warning.
// Needs the mock KV (npm run check starts it); refuses anything non-local.
// Run: npx tsx scripts/check-data-health.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';

const dh = await import('../lib/data-health');
const kvLib = await import('../lib/kv');
const serials = await import('../lib/serials');
const { prodKv } = await import('../lib/db');

const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

// ---- pure ----
ok(dh.formatBytes(0) === '0 B' && dh.formatBytes(1023) === '1023 B' && dh.formatBytes(2048) === '2.0 KB' && dh.formatBytes(3 * 1_048_576) === '3.00 MB', 'sizes read naturally');
ok(dh.jsonBytes(null) === 0 && dh.jsonBytes(undefined) === 0 && dh.jsonBytes({ a: [1, 2] }) === 11, 'jsonBytes counts the stored text');
ok(dh.jsonBytes({ n: 'é' }) === Buffer.byteLength('{"n":"é"}'), 'jsonBytes counts UTF-8 bytes, not characters');
ok(dh.healthLevel(dh.BLOB_WARN_BYTES - 1) === 'ok' && dh.healthLevel(dh.BLOB_WARN_BYTES) === 'warn' && dh.healthLevel(dh.BLOB_HIGH_BYTES - 1) === 'warn' && dh.healthLevel(dh.BLOB_HIGH_BYTES) === 'high', 'levels switch at 512 KB and 2 MB');

const sum = dh.summarizeCollection({ alice: [1, 1, 2], bob: [3], carol: [] });
ok(sum.viewers === 3 && sum.entries === 4 && sum.largest?.username === 'alice' && sum.largest.entries === 3, 'collection summary counts viewers, copies and the biggest holder');
ok(sum.bytes === dh.jsonBytes({ alice: [1, 1, 2], bob: [3], carol: [] }), 'collection size is the stored size');
const empty = dh.summarizeCollection({});
ok(empty.viewers === 0 && empty.entries === 0 && empty.largest === null && empty.bytes === 2, 'an empty collection is fine');

ok(dh.sizeAttention('Season 1', 1000) === null, 'no warning while small');
const warn = dh.sizeAttention('Season 1', 600 * 1024);
ok(warn?.level === 'warn' && warn.text.includes('Season 1') && warn.text.includes('600.0 KB'), 'a warning names the season and the size');
ok(dh.sizeAttention('Season 1', 3 * 1_048_576)?.level === 'high', 'a very large collection is flagged high');
ok(!warn!.text.includes(String.fromCharCode(8212)), 'no em dash in the copy');

// ---- measured against the mock KV ----
await kvLib.seedSeason1();
const season = (await kvLib.listSeasons())[0];
const coll = season.collectionName;
await prodKv.set(`tcg_${coll}`, { alice: [1, 1, 2, 3], bob: [4], carol: [5, 6] });

let h = await dh.loadDataHealth(season.id);
const row = h.seasons.find(s => s.id === season.id)!;
ok(!!row && row.active, 'the published season is listed and marked active');
ok(row.collection.viewers === 3 && row.collection.entries === 7 && row.collection.largest?.username === 'alice', 'measured viewers, entries and largest holder');
ok(row.collection.bytes === dh.jsonBytes({ alice: [1, 1, 2, 3], bob: [4], carol: [5, 6] }) && row.level === 'ok', 'measured size and level');
ok(!row.ledger.tracking && row.ledger.live === 0 && row.ledger.ownerEntries === 0 && row.ledger.largestOwner === null, 'an unnumbered season has no ledger numbers');
ok(h.trades.openCount === 0 && h.trades.historyCount === 0 && h.activityEvents === 0, 'empty trades and activity read as zero');

// Draft seasons are not measured.
await kvLib.saveSeason({ ...season, id: 'draft-x', name: 'Draft', status: 'draft', collectionName: 'DraftX' });
await prodKv.set('seasons:list', [...((await prodKv.get<string[]>('seasons:list')) ?? []), 'draft-x']);
h = await dh.loadDataHealth(null);
ok(h.seasons.every(s => s.id !== 'draft-x'), 'draft seasons are skipped');
ok(h.seasons.every(s => !s.active), 'no season is marked active when none is given');

// Number the copies, then the ledger shows up.
await serials.backfillSerials(coll, await kvLib.getCollection(coll));
h = await dh.loadDataHealth(season.id);
const led = h.seasons.find(s => s.id === season.id)!.ledger;
ok(led.tracking && led.live === 7 && led.retired === 0, 'a tracked season reports its live copies');
ok(led.editions >= 6 && led.ownerEntries > 0 && led.largestOwner?.username === 'alice' && !led.sampled, 'the ledger reports editions and per-viewer entries');

// Trades and activity.
await prodKv.set('trades:open', [{ id: 't1' }, { id: 't2' }]);
await prodKv.set('trades:history', [{ id: 'h1' }, { id: 'h2' }, { id: 'h3' }]);
await prodKv.lpush('activity:log', { id: 1 }); await prodKv.lpush('activity:log', { id: 2 });
h = await dh.loadDataHealth(season.id);
ok(h.trades.openCount === 2 && h.trades.historyCount === 3 && h.trades.historyBytes === dh.jsonBytes([{ id: 'h1' }, { id: 'h2' }, { id: 'h3' }]), 'trade offers and history are measured');
ok(h.activityEvents === 2, 'activity events are counted');

console.log('data health checks passed');
