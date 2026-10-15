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
const SANDBOX_REGISTRY_FAKE = db.SANDBOX_REGISTRY_KEY;
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
// ---- Preview deployments (VERCEL_ENV=preview): pinned to sbx:preview:*, production can be read but never written. ----
const staff = await import('../lib/staff');
const staffCore = await import('../lib/staff-core');
await prodKv.hset('staff:members', { 'preview_mod': { login: 'preview_mod', role: 'mod', addedBy: 'check', addedAt: 1 } });
await prodKv.set(SANDBOX_REGISTRY_FAKE, [{ id: 'preview', name: 'Fake', createdAt: 1, source: 'empty' }]); // a registry entry for the reserved id must never be listed
const prodKeys2 = [...prodKeys, 'staff:members', 'staff:log', SANDBOX_REGISTRY_FAKE];
const before2 = await snapshot(prodKeys2);
const rejects = async (p: Promise<unknown>) => { try { await p; return false; } catch { return true; } };

process.env.VERCEL_ENV = 'preview';
try {
  // Pinned whatever the caller says, including outside a request (where it used to mean production) and under runInSandbox.
  ok((await db.currentSandboxId()) === 'preview', 'preview: outside a request is the preview namespace, not production');
  ok((await runInSandbox(null, () => db.currentSandboxId())) === 'preview', 'preview: runInSandbox(null) cannot reach production');
  ok((await runInSandbox('some-box', () => db.currentSandboxId())) === 'preview', 'preview: runInSandbox(other) cannot move the namespace');
  ok(await db.inSandbox(), 'preview counts as a sandbox (silences Discord, webhooks, Blob deletes)');

  // Everything the app writes lands under sbx:preview:.
  await kvLib.addCollectionEntry(coll, 'previewer', 9);
  ok(JSON.stringify(await prodKv.get(`sbx:preview:tcg_${coll}`)).includes('previewer'), 'preview: a pull is written under sbx:preview:');
  ok(!JSON.stringify(await prodKv.get(`tcg_${coll}`)).includes('previewer'), 'preview: the production collection is untouched');
  await act.recordActivity({ type: 'grant', source: 'admin', cardNumber: 9, username: 'previewer' });
  ok((await snapshot(prodKeys2)) === before2, 'PRODUCTION UNCHANGED after preview writes');

  // The raw client is fenced: reads pass, writes outside the namespace are refused.
  ok(JSON.stringify(await prodKv.get(`tcg_${coll}`)) === JSON.stringify({ realviewer: [1, 2, 3] }), 'preview: production can still be read');
  ok(await rejects(prodKv.set('seasons:list', ['x'])), 'preview: prodKv.set on a production key is refused');
  ok(await rejects(prodKv.hset('staff:members', { evil: { login: 'evil', role: 'admin' } })), 'preview: prodKv.hset on the staff list is refused');
  ok(await rejects(prodKv.lpush('activity:log', 'x')), 'preview: prodKv.lpush on a production key is refused');
  ok(await rejects(prodKv.del('sbx:preview:a', 'tcg_' + coll)), 'preview: a del that includes a production key is refused');
  ok(await rejects(prodKv.set('sbx:other:thing', 1)), 'preview: another sandbox namespace is refused too');
  ok(await rejects((prodKv as unknown as { pipeline: () => Promise<unknown> }).pipeline() as Promise<unknown>), 'preview: pipelines are refused');
  await prodKv.set('sbx:preview:ok', 1);
  ok((await prodKv.get('sbx:preview:ok')) === 1, 'preview: writes inside the namespace work');

  // Staff: real roles can be read (so staff can sign in), nothing can be written.
  ok((await staff.getStaffRecord('preview_mod'))?.role === 'mod', 'preview: the staff list can be read');
  const actor = { login: staffCore.SUPER_ADMINS[0].login, role: 'super' as const };
  ok(!(await staff.addStaff(actor, 'newperson', 'mod')).ok, 'preview: adding staff is refused');
  ok(!(await staff.setStaffRole(actor, 'preview_mod', 'admin')).ok, 'preview: changing a role is refused');
  ok(!(await staff.removeStaff(actor, 'preview_mod')).ok, 'preview: removing staff is refused');
  await staff.touchStaffLogin('preview_mod', '555', 'Preview Mod'); // best effort: must not throw or write
  ok((await staff.getStaffRecord('preview_mod'))?.twitchId === undefined, 'preview: a staff sign-in does not bind or stamp the record');

  // Seeding copies the live setup in (read production, write the namespace) and wiping clears only the namespace.
  await sbx.seedPreviewFromProduction(true);
  ok(((await prodKv.get<string[]>('sbx:preview:seasons:list')) ?? []).length === 1, 'preview: setup is copied into the namespace');
  ok(JSON.stringify(await prodKv.get(`sbx:preview:tcg_${coll}`)) === JSON.stringify({ realviewer: [1, 2, 3] }), 'preview: collections can be copied in');
  ok((await sbx.countKeys('preview')) > 0, 'preview: the namespace is counted');
  await sbx.wipeKeys('preview');
  ok((await sbx.countKeys('preview')) === 0, 'preview: wipe empties the namespace');
  ok((await snapshot(prodKeys2)) === before2, 'PRODUCTION UNCHANGED after preview seed and wipe');
} finally {
  delete process.env.VERCEL_ENV;
}
ok((await db.currentSandboxId()) === null, 'outside a preview, a script is production again');
ok(await rejects(Promise.resolve().then(() => { if (sbx.makeId('Preview', []) === 'preview') throw new Error('x'); })) === false, 'the reserved id can never be handed out');
ok((await sbx.listSandboxes()).length === 0, 'a registry entry for the reserved id is never listed');
await prodKv.del(SANDBOX_REGISTRY_FAKE);

ok((await snapshot(prodKeys)) === before, 'PRODUCTION UNCHANGED at the end');
console.log('sandbox isolation checks passed');
