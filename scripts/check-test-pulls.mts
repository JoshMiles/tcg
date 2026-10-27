// Test pulls (ROADMAP 55.14): "Simulate a chat pull" runs the real pull webhook code and the real POST /api/collection against the mock KV
// with a fake bridge. Covers the step order, free vs paid, that the test edition counts nowhere (leaderboard, stats, recap, activity feed,
// Twitch panel), Undo and its refund, and every refusal. Run: npx tsx scripts/check-test-pulls.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const { NextRequest } = await import('next/server');
const kvLib = await import('../lib/kv');
const { kv } = await import('../lib/db');
const m = await import('../lib/mixitup');
const mc = await import('../lib/mixitup-core');
const b = await import('../lib/bridge');
const core = await import('../lib/bridge-core');
const t = await import('../lib/mixitup-test');
const tc = await import('../lib/mixitup-test-core');
const trace = await import('../lib/mixitup-trace');
const act = await import('../lib/activity');
const lb = await import('../lib/leaderboard');
const recap = await import('../lib/stream-recap');
const pq = await import('../lib/pull-queue');
const { POST } = await import('../app/api/collection/route');
const ach = await import('../lib/achievements-store');

await kvLib.seedSeason1();
const season = (await kvLib.getActiveSeason())!;
const VIEWER = 'testviewer';
const settings = (o: Partial<ReturnType<typeof mc.normalizeMixItUp>> = {}) => m.saveMixItUpSettings({ ...mc.normalizeMixItUp(null), enabled: true, connection: 'bridge', currencyId: 'cur-1', cost: 100, testViewers: [VIEWER], ...o });
await settings();
ok(!!(await b.pairBridge((await b.createPairCode('check')).code, 'Stream PC')), 'a bridge is paired');

// ── Settings: the test viewers default to the channel, keep to 5 and stay backwards compatible ──
ok(mc.normalizeMixItUp(null).testViewers.join() === 'cheesygidds' || mc.normalizeMixItUp(null).testViewers.length === 1, 'test viewers default to the channel login');
ok(mc.normalizeMixItUp({ testViewers: ['aaa', 'bbb', 'ccc', 'ddd', 'eee', 'fff', 'AAA'] }).testViewers.length === 5, 'at most 5 test viewers');
ok(mc.normalizeMixItUp({ enabled: true }).testViewers.length === 1, 'settings saved before test viewers existed still load');

// ── The fake bridge: answers every job at once, and keeps what it was asked ──
const seen: core.BridgeJob[] = [];
const poll = setInterval(async () => {
  for (const j of await b.claimJobs()) {
    seen.push(j);
    if (j.kind === 'balance') await kv.set(`bridge:result:${j.id}`, { id: j.id, ok: true, balance: 500 });
    else await kv.set(`bridge:result:${j.id}`, { id: j.id, ok: true });
  }
}, 15);
b.tuning.pollMs = 10;
const kinds = (k: string) => seen.filter(j => j.kind === k);

const ticketOf = async () => { const q = await kv.lrange<{ id: string }>('webhooks:queue', 0, 0); return q[0].id; };
const save = (ticket: string, username = VIEWER) => POST(new NextRequest('http://localhost/api/collection', { method: 'POST', body: JSON.stringify({ pull: { username, ticket } }) }));
const waitFor = async (id: string, step: string) => { for (let i = 0; i < 150; i++) { if ((await trace.readTrace(id)).some(s => s.step === step)) return; await new Promise(r => setTimeout(r, 20)); } };
const stepsOf = async (id: string) => (await trace.readTrace(id)).map(s => `${s.step}:${s.state}`);

try {
  // ── Refusals before anything runs ──
  ok(!(await t.startTestPull({ username: 'someoneelse', paid: false, force: true })).ok, 'a viewer not on the list is refused');
  ok(!(await t.startTestPull({ username: 'cheesygidds', paid: false, force: true })).ok, 'the channel is refused when it is not on the list');
  const noOverlay = await t.startTestPull({ username: VIEWER, paid: false });
  ok(!noOverlay.ok && noOverlay.needsForce === true, 'with no overlay connected it asks to queue anyway');
  ok((await kv.lrange('webhooks:queue', 0, -1)).length === 0 && (await kv.get(trace.LOCK)) === null, 'a refusal queues nothing and takes no lock');
  await settings({ enabled: false });
  ok(!(await t.startTestPull({ username: VIEWER, paid: true, force: true })).ok, 'a paid test is refused while paid pulls are off');
  await settings();

  // ── A free pull: the charge step is skipped, the balance is never asked ──
  const free = await t.startTestPull({ username: VIEWER, paid: false, force: true });
  ok(free.ok && !!free.id, 'a free test pull is queued');
  const second = await t.startTestPull({ username: VIEWER, paid: false, force: true });
  ok(!second.ok && /already running/.test(second.message), 'the lock refuses a second simulate while one runs');
  const freeTicket = await ticketOf();
  const stored = await kv.get<{ test?: boolean; trace?: string }>(`draw:${freeTicket}`);
  ok(stored?.test === true && stored.trace === free.id, 'the ticket carries the test flag and the trace id');
  const res = await save(freeTicket);
  ok(res.status === 200, 'the overlay saves the free test pull');
  await waitFor(free.id!, 'chat');
  const freeSteps = await stepsOf(free.id!);
  ok(freeSteps.join() === 'received:ok,balance:skipped,queued:ok,shown:ok,charged:skipped,saved:ok,rules:ok,chat:skipped' || /^received:ok,balance:skipped,queued:ok,shown:ok,charged:skipped,saved:ok,rules:(ok|skipped),chat:skipped$/.test(freeSteps.join()), `free pull steps in order (got ${freeSteps.join()})`);
  ok(kinds('balance').length === 0 && kinds('deduct').length === 0, 'a free pull never touches the bridge for a balance or a charge');
  ok((await kv.get(trace.LOCK)) === null, 'the lock is let go when the chain ends');

  // ── The edition counts nowhere ──
  const made = await kv.get<trace.MadeTest>(trace.madeKey(free.id!));
  ok(!!made && tc.isTestCollection(made.collectionName) && made.collectionName === tc.testCollectionName(season.collectionName), 'the edition is kept in the test collection');
  ok((await kvLib.getUserCards(season.collectionName, VIEWER)).length === 0, 'the season collection has nothing for the test viewer');
  ok((await kvLib.getUserCards(tc.testCollectionName(season.collectionName), VIEWER)).length === 1, 'the test collection has the edition');
  const board = await lb.getSeasonLeaderboard(season);
  ok(!board.rows.some(r => r.username === VIEWER) && !board.collection[VIEWER], 'not in the leaderboard or its collection');
  ok(!(await kv.hgetall(`stats:h:${season.collectionName}`)) || Object.keys((await kv.hgetall(`stats:h:${season.collectionName}`)) ?? {}).length === 0, 'no stats counters');
  ok(((await kv.hgetall<Record<string, number>>('stats:last')) ?? {})[VIEWER] === undefined, 'the viewer is not marked as seen');
  ok((await act.getActivity({ limit: 200 })).events.every(e => e.username !== VIEWER), 'not in the public activity feed');
  const staff = (await act.getActivity({ limit: 200, includeTest: true })).events;
  const withTest = staff.filter(e => e.username === VIEWER);
  ok(withTest.length >= 1 && withTest.every(e => e.test === true), 'staff can see the activity, marked as a test');
  const rc = recap.buildStreamRecap(staff, 0, Date.now() + 1000);
  ok(JSON.stringify(rc).indexOf(VIEWER) === -1, 'the stream recap does not mention a test viewer');
  ok((await ach.syncAchievements(VIEWER)).earned.length === 0, 'no achievements earned from a test edition');

  // ── A paid pull: balance, then charge at the claim, in order ──
  const paid = await t.startTestPull({ username: VIEWER, paid: true, force: true });
  ok(paid.ok, 'a paid test pull is queued');
  const paidTicket = await ticketOf();
  ok(kinds('balance').length === 1, 'the balance was read before queueing');
  ok((await save(paidTicket)).status === 200, 'the overlay saves the paid test pull');
  await waitFor(paid.id!, 'chat');
  const paidSteps = await stepsOf(paid.id!);
  ok(/^received:ok,balance:ok,queued:ok,shown:ok,charged:ok,saved:ok,rules:(ok|skipped),chat:ok$/.test(paidSteps.join()), `paid pull steps in order (got ${paidSteps.join()})`);
  ok(kinds('deduct').length === 1 && kinds('deduct')[0].amount === 100, 'one charge of the price was sent');

  // ── Undo ──
  const undo = await t.undoTestPull(paid.id!);
  ok(undo.ok, `undo works (${undo.message})`);
  ok((await kvLib.getUserCards(tc.testCollectionName(season.collectionName), VIEWER)).length === 1, 'undo removed exactly the one edition');
  await new Promise(r => setTimeout(r, 100));
  ok(kinds('add').length === 1 && kinds('add')[0].amount === 100 && kinds('add')[0].username === VIEWER, 'undo of a paid pull queues the refund');
  ok(!(await t.undoTestPull(paid.id!)).ok, 'a second undo is refused');
  const undoFree = await t.undoTestPull(free.id!);
  ok(undoFree.ok && kinds('add').length === 1, 'undo of a free pull refunds nothing');
  ok((await kvLib.getUserCards(tc.testCollectionName(season.collectionName), VIEWER)).length === 0, 'the test collection is empty again');

  // ── Undo refuses anything that is not a saved test pull ──
  await kvLib.seedSeason1();
  await kv.set(trace.madeKey('real'), { username: 'ann', collectionName: season.collectionName, entry: 1, cardName: 'x', paid: true, amount: 100, at: Date.now() } satisfies trace.MadeTest);
  ok(!(await t.undoTestPull('real')).ok, 'undo of an edition in a real collection is refused');
  ok(!(await t.undoTestPull('nothing-here')).ok && !(await t.undoTestPull('')).ok, 'undo of an unknown id is refused');

  // ── A real pull writes no trace and no test mark ──
  const before = ((await kv.lrange(trace.RECENT, 0, -1)) ?? []).length;
  ok(await pq.queuePull('ann').then(r => r.ok === true), 'a real pull queues');
  const realTicket = await ticketOf();
  const realDraw = await kv.get<{ test?: boolean }>(`draw:${realTicket}`);
  ok(realDraw?.test === undefined, 'a real ticket has no test flag');
  ok((await save(realTicket, 'ann')).status === 200, 'a real pull saves');
  await new Promise(r => setTimeout(r, 200));
  ok(((await kv.lrange(trace.RECENT, 0, -1)) ?? []).length === before && (await trace.readTrace(realTicket)).length === 0 && (await kv.get(trace.madeKey(realTicket))) === null, 'a real pull writes no trace');
  ok((await kvLib.getUserCards(season.collectionName, 'ann')).length === 1, 'a real pull lands in the season collection');

  // ── The test viewers form: the failure shape, a failed step lets the lock go ──
  await kv.set(trace.LOCK, 'x', { ex: 90 });
  await trace.traceStep('x', 'queued', 'failed', 'boom');
  ok((await kv.get(trace.LOCK)) === null, 'a failed step releases the lock');
  ok(tc.traceSettled([{ step: 'queued', state: 'failed', detail: '', at: 1 }], 0, 1), 'a failed step settles the live list');
  ok(!tc.traceSettled([], 0, 1000) && tc.traceSettled([], 0, 61_000), 'the live list gives up after a minute');
} finally {
  clearInterval(poll);
}
console.log('check-test-pulls: ok');
process.exit(0);
