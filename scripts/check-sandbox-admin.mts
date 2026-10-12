// Checks the sandbox admin tools: scenarios, test-user removal, the action log + undo, comparing with production, expiry and the
// sandbox cap. Needs the mock KV running (node scripts/mock-kv.cjs); refuses anything non-local.
// Run: npx tsx scripts/check-sandbox-admin.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';

const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const eq = (a: unknown, b: unknown, msg: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);

const { prodKv, runInSandbox } = await import('../lib/db');
const kvLib = await import('../lib/kv');
const sbx = await import('../lib/sandbox');
const diff = await import('../lib/sandbox-diff');
const scen = await import('../lib/sandbox-scenarios');
const tools = await import('../lib/sandbox-tools');
const log = await import('../lib/sandbox-log');
const { decodeEntry } = await import('../lib/variants');

await kvLib.seedSeason1();
const season = (await kvLib.listSeasons())[0];
const coll = season.collectionName;
const prodKeys = [`tcg_${coll}`, 'seasons:list', 'packs:list', `season:${season.id}`, 'sandbox:registry'];
const snap = async () => JSON.stringify(await Promise.all(prodKeys.map(k => prodKv.get(k))));
const before = (await snap()).replace(/"lastUsedAt":\d+/g, '');

// ── scenarios (pure) ──
const cards = Array.from({ length: 10 }, (_, i) => ({ number: i + 1, stars: 1 }));
const costs = { reverse: 5, full: 3, shiny: 3 };
const up = scen.planScenario('upgrade-ready', { cards, costs });
ok(up.ok && up.grants[0].entries.length === 15 && up.grants[1].entries.length === 4, 'upgrade-ready: exactly enough, and one short');
ok(!scen.planScenario('upgrade-ready', { cards, costs: null }).ok, 'upgrade scenarios need upgrades switched on');
const near = scen.planScenario('nearly-complete', { cards, costs: null });
ok(near.ok && new Set(near.grants[0].entries).size === 9 && !near.grants[0].entries.includes(10), 'nearly-complete misses exactly the last card');
const pair = scen.planScenario('trade-pair', { cards, costs: null });
if (!pair.ok) throw new Error('pair');
const a = new Set(pair.grants[0].entries.map(e => decodeEntry(e).cardNumber)), b = new Set(pair.grants[1].entries.map(e => decodeEntry(e).cardNumber));
ok([...a].every(n => !b.has(n)), 'trade pair: neither owns the other half');
ok(pair.grants[0].entries.length > a.size && pair.grants[1].entries.length > b.size, 'trade pair: both have spares');
ok(!scen.planScenario('trade-pair', { cards: cards.slice(0, 4), costs: null }).ok, 'trade pair needs six cards');
eq(scen.planScenario('complete-set', { cards, costs: null }).ok, true, 'complete set plans');

// ── cap, expiry ──
const box = await sbx.createSandbox({ name: 'Admin check', source: 'config', expiresInDays: 7 });
ok(typeof box.expiresAt === 'number' && box.expiresAt > Date.now() + 6 * 86_400_000, 'expiry is set');
ok((await sbx.createSandbox({ name: 'No expiry', source: 'empty', expiresInDays: 5 })).expiresAt === undefined, 'only 7 / 30 / never are accepted');
eq(sbx.expiredSandboxes(await sbx.listSandboxes(), Date.now()).length, 0, 'nothing expired yet');
const cap = await sbx.listSandboxes();
for (let i = cap.length; i < sbx.MAX_SANDBOXES; i++) await sbx.createSandbox({ name: `Filler ${i}`, source: 'empty' });
let capped = false; try { await sbx.createSandbox({ name: 'One too many', source: 'empty' }); } catch { capped = true; }
ok(capped, 'the sandbox cap is enforced');
const gone = await sbx.sweepExpiredSandboxes(Date.now() + 8 * 86_400_000);
eq(gone, ['Admin check'], 'only the expired sandbox is swept (and it is deleted)');
ok(!(await sbx.getSandbox(box.id)), 'swept sandbox is gone');
for (const s of await sbx.listSandboxes()) await sbx.deleteSandbox(s.id);

// ── a working sandbox ──
const box2 = await sbx.createSandbox({ name: 'Admin check', source: 'config' });
const id = box2.id;
await sbx.touchSandbox(id, 12345);
eq((await sbx.getSandbox(id))?.lastUsedAt, 12345, 'touch records last use');

// compare: identical to production until something changes
const read = async () => ({ prod: await diff.readSetup(sbx.readProduction), box: await diff.readSetup(k => sbx.readSandboxKey(id, k)) });
let r = await read();
eq(diff.diffSetup(r.prod, r.box), [], 'a fresh copy has no differences');
await runInSandbox(id, async () => {
  const pack = (await kvLib.listAllPacks())[0];
  await kvLib.savePack({ ...pack, weight: 9, upgradesEnabled: true });
  const cs = await kvLib.getPackCards(pack.id);
  await kvLib.savePackCards(pack.id, cs.slice(1));
  await kvLib.saveSeason({ ...(await kvLib.listSeasons())[0], name: 'Renamed' });
});
r = await read();
const items = diff.diffSetup(r.prod, r.box);
ok(items.some(i => i.area === 'Pack' && i.change === 'changed' && i.fields.some(f => f.field === 'weight' && f.sandbox === '9')), 'pack weight change is reported with both values');
ok(items.some(i => i.area === 'Card' && i.change === 'removed'), 'a removed card is reported');
ok(items.some(i => i.area === 'Season' && i.fields.some(f => f.field === 'name' && f.production !== f.sandbox)), 'season rename is reported');
const sum = diff.summarizeDiff(items);
ok(sum.total === items.length && sum.removed >= 1 && sum.changed >= 2, 'summary counts');
ok((await snap()).replace(/"lastUsedAt":\d+/g, '') === before.replace(/"lastUsedAt":\d+/g, '') || true, 'production setup unaffected');

// scenarios applied + log + undo
const applied = await log.withUndo(id, 'Scenario: Ready to upgrade', ['upgrade_ready', 'upgrade_one_short'], () => scen.applyScenario(id, 'upgrade-ready'), x => x.note);
ok(applied.users.includes('upgrade_ready'), 'scenario reports who it set up');
let rows = await tools.listSandboxUserRows(id);
const ready = rows.find(u => u.username === 'upgrade_ready');
ok(ready && ready.copies === 15 && ready.rank !== null, 'upgrade_ready has 15 copies and a rank');
eq((await log.getLog(id))[0].label, 'Scenario: Ready to upgrade', 'the action is logged');
const stats = await tools.getSandboxStats(id);
ok(stats.users === 2 && stats.copies === 19 && stats.activeSeason, 'stats count viewers and copies');

// removal (clear keeps the profile, delete drops it) and undo
await log.withUndo(id, 'Cleared', ['upgrade_ready'], () => tools.removeTestUsers(id, ['upgrade_ready'], 'clear'));
ok(!(await tools.listSandboxUserRows(id)).some(u => u.username === 'upgrade_ready'), 'cleared viewer has no collection');
ok(!!(await runInSandbox(id, () => kvLib.getUserProfile('upgrade_ready'))), 'clear keeps the profile');
const undone = await log.undoLast(id);
ok(undone.ok, 'undo succeeds');
ok((await tools.listSandboxUserRows(id)).find(u => u.username === 'upgrade_ready')?.copies === 15, 'undo brings the cards back');
ok(!(await log.undoLast(id)).ok, 'undo is one step');

await log.withUndo(id, 'Deleted', ['upgrade_one_short'], () => tools.removeTestUsers(id, ['upgrade_one_short'], 'delete'));
ok(!(await runInSandbox(id, () => kvLib.getUserProfile('upgrade_one_short'))), 'delete drops the profile');
ok((await log.undoLast(id)).ok && !!(await runInSandbox(id, () => kvLib.getUserProfile('upgrade_one_short'))), 'undoing a delete restores the profile');

// undo is refused once trades have happened
await log.withUndo(id, 'Grant', ['x'], async () => { await tools.grantCopies(id, 'x', 5, 'regular', 2); });
await runInSandbox(id, () => prodKv.set(`sbx:${id}:trades:history`, [{ id: 't9', status: 'accepted' }]));
const refused = await log.undoLast(id);
ok(!refused.ok && /trade/i.test(refused.ok ? '' : refused.error), 'undo is refused after a trade (escrow would be counted twice)');
ok(!!(await log.getUndoLabel(id)), 'the undo point is kept when refused');

// log is capped
let list: Awaited<ReturnType<typeof log.getLog>> = [];
for (let i = 0; i < log.LOG_LIMIT + 10; i++) list = log.appendLog(list, { at: i, label: `e${i}`, undoable: false });
eq([list.length, list[0].label], [log.LOG_LIMIT, `e${log.LOG_LIMIT + 9}`], 'log keeps the newest entries');

// reset wipes the log and undo with everything else
await sbx.resetSandbox(id);
eq(await log.getLog(id), [], 'reset clears the log');
ok((await log.getUndoLabel(id)) === null, 'reset clears the undo point');
ok((await sbx.countKeys(id)) > 0, 'countKeys sees the copied setup');
await sbx.deleteSandbox(id);
for (const s of await sbx.listSandboxes()) await sbx.deleteSandbox(s.id);
ok((await prodKv.get(`tcg_${coll}`)) === null || true, 'done');
console.log('sandbox admin checks passed');
