// Proves a sandbox can't touch production. Needs the mock KV running (node scripts/mock-kv.cjs); refuses anything non-local.
// Run: npx tsx scripts/check-sandbox.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';

const db = await import('../lib/db');
const kvLib = await import('../lib/kv');
const sbx = await import('../lib/sandbox');
const tools = await import('../lib/sandbox-tools');
const wh = await import('../lib/webhooks');
const act = await import('../lib/activity');

const { prodKv, runInSandbox } = db;
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const snapshot = async (keys: string[]) => JSON.stringify(await Promise.all(keys.map(k => prodKv.get(k))));

await kvLib.seedSeason1();
const season = (await kvLib.listSeasons())[0];
const coll = season.collectionName;
await prodKv.set(`tcg_${coll}`, { realviewer: [1, 2, 3] });
const prodKeys = [`tcg_${coll}`, 'seasons:list', 'packs:list', `season:${season.id}`, 'activity:seq', 'activity:log', 'webhooks:settings', 'overlay:settings'];
const before = await snapshot(prodKeys);

// Create a sandbox from production including viewer collections: it starts as an exact copy...
const box = await sbx.createSandbox({ name: 'Check run', source: 'collections' });
ok(box.id === 'check-run', 'id from name');
ok(JSON.stringify(await prodKv.get(`sbx:${box.id}:tcg_${coll}`)) === JSON.stringify({ realviewer: [1, 2, 3] }), 'collections copied into the namespace');
ok((await prodKv.get<string[]>(`sbx:${box.id}:seasons:list`))?.length === 1, 'seasons copied');

// ...and everything done inside it stays inside it.
await runInSandbox(box.id, async () => {
  await kvLib.addCollectionEntry(coll, 'alice', 5);
  await kvLib.saveSeason({ ...season, name: 'Renamed in sandbox' });
  await act.recordActivity({ type: 'grant', source: 'admin', cardNumber: 5, username: 'alice' });
  const seen = await kvLib.getSeason(season.id);
  ok(seen?.name === 'Renamed in sandbox', 'sandbox sees its own write');
  ok(JSON.stringify(await kvLib.getCollection(coll)).includes('alice'), 'sandbox collection has alice');
  let threw = false;
  try { await (db.kv as unknown as { keys: (p: string) => Promise<unknown> }).keys('*'); } catch { threw = true; }
  ok(threw, 'unsupported commands are refused in a sandbox');
});
ok((await snapshot(prodKeys)) === before, 'PRODUCTION UNCHANGED after sandbox writes');
ok(!JSON.stringify(await prodKv.get(`tcg_${coll}`)).includes('alice'), 'alice never reached production');

// Test tools run pinned to the sandbox.
const sim = await tools.simulatePulls(box.id, 'Bob', 30);
ok(sim.pulls === 30, 'simulated 30 pulls');
const granted = await tools.grantCopies(box.id, 'bob', 5, 'regular', 7);
ok(granted === 7, 'granted copies');
ok((await tools.listSandboxUsers(box.id)).some(u => u.username === 'bob' && u.copies >= 37), 'bob has his pulls and copies');
ok((await snapshot(prodKeys)) === before, 'PRODUCTION UNCHANGED after test tools');

// The outside world is silenced in a sandbox (and not elsewhere).
let calls = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = (async () => { calls++; return new Response('ok'); }) as typeof fetch;
const hook = { enabled: true, url: 'http://localhost:9/hook', fields: [{ key: 'u', value: '{username}' }] };
await runInSandbox(box.id, () => wh.fireOutgoing(hook, { username: 'x' }));
ok(calls === 0, 'outgoing webhooks are not called from a sandbox');
await wh.fireOutgoing(hook, { username: 'x' });
globalThis.fetch = realFetch;
ok(calls === 1, 'outgoing webhooks still fire on production');

// The fake Twitch page's tokens are honoured only inside the sandbox they were minted for, and never forge a real one.
process.env.SESSION_SECRET = 'check-secret-0123456789';
const jwt = await import('../lib/twitch-jwt');
const mock = jwt.signMockTwitchJwt({ opaque_user_id: 'Umockalice', user_id: '123', channel_id: '1', role: 'viewer', sandbox: box.id, login: 'alice' })!;
ok(!!mock, 'a fake token can be signed');
ok((await jwt.verifyExtensionAuth(mock)) === null, 'a fake token is refused outside any sandbox (production)');
ok((await runInSandbox(box.id, () => jwt.verifyExtensionAuth(mock)))?.login === 'alice', 'a fake token works inside its own sandbox');
ok((await runInSandbox('some-other-box', () => jwt.verifyExtensionAuth(mock))) === null, 'a fake token is refused in a different sandbox');
ok((await runInSandbox(box.id, () => jwt.verifyExtensionAuth(mock.slice(0, -2) + 'xx'))) === null, 'a tampered fake token is refused');
ok(jwt.verifyTwitchJwt(mock) === null, 'a fake token is not a real Twitch token');

// Clearing viewer data keeps the setup; reset restores production's copy; delete removes everything.
await sbx.resetTestData(box.id);
ok((await prodKv.get(`sbx:${box.id}:tcg_${coll}`)) === null, 'test data cleared');
ok((await prodKv.get(`sbx:${box.id}:seasons:list`)) !== null, 'setup kept');
await sbx.resetSandbox(box.id);
ok(JSON.stringify(await prodKv.get(`sbx:${box.id}:tcg_${coll}`)) === JSON.stringify({ realviewer: [1, 2, 3] }), 'reset restores the copy');
await sbx.deleteSandbox(box.id);
ok((await sbx.listSandboxes()).length === 0, 'deleted from the registry');
ok((await prodKv.scan(0, { match: `sbx:${box.id}:*`, count: 100 }) as [string, string[]])[1].length === 0, 'namespace wiped');
ok((await snapshot(prodKeys)) === before, 'PRODUCTION UNCHANGED at the end');
console.log('sandbox isolation checks passed');
