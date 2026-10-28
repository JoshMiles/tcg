// Control from the PC (ROADMAP 55.9): POST /api/bridge/action and GET /api/bridge/queue (token needed), each action, pause turning paid pulls
// and !pack away, skip and clear refunding, and the dashboard's Clear queue refunding too. Against the mock KV. Run: npx tsx scripts/check-bridge-actions.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const kvLib = await import('../lib/kv');
const { kv } = await import('../lib/db');
const b = await import('../lib/bridge');
const buffs = await import('../lib/buffs');
const core = await import('../lib/buffs-core');
const mixitup = await import('../lib/mixitup');
const { normalizeMixItUp } = await import('../lib/mixitup-core');
const { queuePull } = await import('../lib/pull-queue');
const { enqueueEvent, peekQueue } = await import('../lib/webhooks');
const { issueDraw, claimDraw } = await import('../lib/draw');
const { isPullsPaused } = await import('../lib/pull-pause');
const { readQueue } = await import('../lib/queue-control');
const actionRoute = await import('../app/api/bridge/action/route');
const queueRoute = await import('../app/api/bridge/queue/route');

await kvLib.seedSeason1();
const code = await b.createPairCode('josh');
const token = (await b.pairBridge(code.code, 'Stream PC'))!.token;
const act = async (body: Record<string, unknown>, tok: string | null = token) => {
  const res = await actionRoute.POST(new Request('http://localhost/api/bridge/action', { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}) }, body: JSON.stringify(body) }));
  return { status: res.status, ...(await res.json()) } as { status: number; ok: boolean; message: string; paused?: boolean; reason?: string; buffs?: { id: string; name: string }[] };
};
const getQueue = (tok: string | null = token) => queueRoute.GET(new Request('http://localhost/api/bridge/queue', { headers: tok ? { authorization: `Bearer ${tok}` } : {} }));

// ── Auth ──
ok((await act({ action: 'status' }, null)).status === 401 && (await act({ action: 'status' }, 'nope')).status === 401, 'the action route needs a paired token');
ok((await getQueue(null)).status === 401 && (await getQueue('nope')).status === 401, 'the queue route needs a paired token');
ok((await act({ action: 'launch-missiles' })).ok === false && (await act({})).ok === false, 'an unknown action is refused in words');

// ── Pause: off by default, toggles, audited ──
ok(!(await isPullsPaused()) && (await act({ action: 'status' })).paused === false, 'pulls are open by default');
let r = await act({ action: 'pause' });
ok(r.ok && r.paused === true && (await isPullsPaused()), 'pause with no value toggles on');
r = await act({ action: 'pause', on: true });
ok(r.ok && r.paused === true, 'pausing twice stays paused');
ok((await act({ action: 'status' })).paused === true, 'status says paused');

// ── Paused: !pack (free path) and paid pulls are turned away, a test and a free pack still go through ──
const free = await queuePull('bob');
ok(free.ignored === true && free.reason === 'paused' && free.message === 'Packs are paused, back soon', `a !pack while paused: ${JSON.stringify(free)}`);
ok((await peekQueue()).length === 0, 'a paused !pack queued nothing');
const mix = normalizeMixItUp({ enabled: true, balanceUrl: 'https://hook.example/mix', cost: 10, limit: 1, secret: 's' });
await mixitup.saveMixItUpSettings(mix);
const paidTry = await queuePull('cat');
ok(paidTry.reason === 'paused' && (await peekQueue()).length === 0, 'a paid pull while paused is turned away before Mix It Up is asked');
ok((await kv.get('mixitup:pending:cat')) == null, 'a paused paid pull reserved nothing');
await mixitup.saveMixItUpSettings(normalizeMixItUp({}));
ok((await queuePull('dan', { test: true, trace: 'tr-1' })).ok === true && (await peekQueue()).length === 1, 'a test pull still goes through while paused');
ok((await queuePull('eve', { free: true })).ok === true && (await peekQueue()).length === 2, 'a free pack the streamer gave still goes through');
const rows = await readQueue();
ok(rows.length === 2 && rows[0].username === 'dan' && rows[1].username === 'eve' && rows[0].kind === 'pull' && rows[0].pack !== '' && rows[0].waitedS >= 0, `the queue lists who, which pack and how long, the next one first: ${JSON.stringify(rows)}`);
const viaRoute = (await (await getQueue()).json()) as { rows: { username: string }[] };
ok(viaRoute.rows.map(x => x.username).join() === 'dan,eve', 'the queue route answers the same rows');

// ── Resume ──
r = await act({ action: 'pause', on: false });
ok(r.ok && r.paused === false && !(await isPullsPaused()), 'resume opens pulls');
ok((await act({ action: 'pause' })).paused === true && (await act({ action: 'pause' })).paused === false, 'with no value it toggles both ways');

// ── Pause on a scene (ROADMAP 57.2): the reason is kept, only a scene pause is lifted by a scene, a hand pause wins ──
ok((await act({ action: 'status' })).reason === '', 'open pulls have no reason');
r = await act({ action: 'scene-pause', scene: 'Just Chatting' });
ok(r.paused === true && r.reason === 'scene Just Chatting', `a listed scene pauses with its name as the reason: ${JSON.stringify(r)}`);
ok((await act({ action: 'status' })).reason === 'scene Just Chatting', 'status carries the reason');
r = await act({ action: 'scene-pause', scene: 'BRB' });
ok(r.paused === true && r.reason === 'scene BRB', 'moving to another listed scene changes the reason only');
r = await act({ action: 'pause', on: true });
ok(r.paused === true && r.reason === '', 'a hand pause while scene-paused takes over (no reason)');
r = await act({ action: 'scene-pause', scene: null });
ok(r.paused === true && r.reason === '' && (await isPullsPaused()), 'leaving the scene does not lift a hand pause');
r = await act({ action: 'scene-pause', scene: 'BRB' });
ok(r.paused === true && r.reason === '', 'a scene does not turn a hand pause into a scene pause');
await act({ action: 'pause', on: false });
r = await act({ action: 'scene-pause', scene: null });
ok(r.paused === false && r.reason === '', 'leaving a scene with nothing paused changes nothing');
await act({ action: 'scene-pause', scene: 'BRB' });
r = await act({ action: 'scene-pause', scene: null });
ok(r.paused === false && !(await isPullsPaused()), 'leaving the scene resumes the pause it made');
await kv.set('pulls:paused', 1);
ok((await act({ action: 'status' })).reason === '', 'an older pause with no reason reads as a hand pause');
r = await act({ action: 'scene-pause', scene: null });
ok(r.paused === true, 'and a scene change does not lift it');
await act({ action: 'pause', on: false });

// ── Skip next: the oldest goes, a paid pull is refunded ──
const pay = async (user: string, id: string) => { // a paid pull waiting for the overlay, made the way queuePull makes one
  ok((await mixitup.reservePaidPull(mix, user, id, async () => new Response(JSON.stringify({ balance: 100000 }), { status: 200 }))).ok, `${user} reserves`);
  const draw = await issueDraw(id, user, true);
  ok(draw, 'a ticket is rolled');
  await enqueueEvent({ id, type: 'pull', username: user, queuedAt: Date.now() - 4000, draw: draw!, paid: true });
};
await pay('fay', 'fay-1');
ok(!(await mixitup.reservePaidPull(mix, 'fay', 'fay-2', async () => new Response(JSON.stringify({ balance: 100000 }), { status: 200 }))).ok, 'fay is at her limit of 1 with one waiting');
r = await act({ action: 'skip' }); // the queue holds dan, eve, fay; dan is next
ok(r.ok && r.message.includes('dan'), `skip takes the next pull: ${r.message}`);
ok((await peekQueue()).map(e => e.username).join() === 'eve,fay', 'the others keep their places');
r = await act({ action: 'skip' });
ok(r.ok && r.message.includes('eve'), 'skip again takes eve');
r = await act({ action: 'skip' });
ok(r.ok && r.message.includes('fay') && (await peekQueue()).length === 0, 'skip takes fay');
ok((await claimDraw('fay-1', 'fay')) === null, 'the skipped pull\'s ticket is dropped');
ok(await kv.get('mixitup:pay:fay-1') == null && Number((await kv.get('mixitup:pending:fay')) ?? 0) <= 0, 'its reservation is released');
ok((await mixitup.reservePaidPull(mix, 'fay', 'fay-3', async () => new Response(JSON.stringify({ balance: 100000 }), { status: 200 }))).ok, 'fay can pull again: the skip gave her allowance back');
await mixitup.releasePaidPull('fay-3');
r = await act({ action: 'skip' });
ok(!r.ok && r.message === 'The queue is empty.', 'skip on an empty queue says so');

// ── Clear: everything goes, every paid pull is refunded ──
await pay('gus', 'gus-1');
await enqueueEvent({ id: 'so-1', type: 'show-off', username: 'hal', queuedAt: Date.now() } as never);
r = await act({ action: 'clear-queue' });
ok(r.ok && r.message.includes('2') && (await peekQueue()).length === 0, `clear empties the queue: ${r.message}`);
ok((await claimDraw('gus-1', 'gus')) === null && await kv.get('mixitup:pay:gus-1') == null, 'a cleared paid pull is refunded');
ok((await act({ action: 'clear-queue' })).message === 'The queue was already empty.', 'clearing an empty queue says so');
await pay('ivy', 'ivy-1');
const { clearQueueAction } = await import('../app/admin/actions/users');
ok(typeof clearQueueAction === 'function', 'the dashboard action exists');
const { clearQueueRefunding } = await import('../lib/queue-control');
ok((await clearQueueRefunding()) === 1 && await kv.get('mixitup:pay:ivy-1') == null, 'the dashboard\'s Clear queue refunds too (it shares the core)');

// ── Refresh: queues an OBS refresh job for the bridge ──
const before = await kv.llen('bridge:jobs');
r = await act({ action: 'refresh' });
ok(r.ok && (await kv.llen('bridge:jobs')) === before + 1, 'refresh queues a job for the bridge');

// ── Buffs: by id, and the last one again ──
ok((await act({ action: 'last-buff' })).ok === false, 'last buff with nothing pressed yet says so');
const mk = (o: Record<string, unknown>) => { const x = core.cleanBuffDefInput({ type: 'extra-pulls', magnitude: 1, duration: { unit: 'streams', n: 1 }, stack: 'reject', scope: 'self', ...o }); if (!x.ok) throw new Error(x.message); return x.def; };
await buffs.saveBuffDefs([mk({ id: 'all', name: 'Everyone pulls', scope: 'community', streamDeck: true }), mk({ id: 'off', name: 'Switched off', scope: 'community' })]);
const st = await act({ action: 'status' });
ok(st.buffs?.length === 1 && st.buffs[0].id === 'all', 'status lists the buffs switched on for the Stream Deck');
ok(!(await act({ action: 'buff', id: 'nope' })).ok && !(await act({ action: 'buff', id: 'off' })).ok, 'an unknown buff or one switched off is refused');
r = await act({ action: 'buff', id: 'all' });
ok(r.ok && r.message.includes('Everyone'), `a buff by id: ${r.message}`);
ok((await kv.get('streamdeck:last')) !== null, 'the buff is remembered as the last one');
r = await act({ action: 'last-buff' }); // within the 10 s cooldown, or already active: refused in words either way
ok(r.ok === false && r.message.length > 0, `last buff again goes through the same rules: ${r.message}`);

// ── Queue cap (ROADMAP 55.4e): only a chat pull is refused, before anything is reserved ──
await clearQueueRefunding();
const capMix = normalizeMixItUp({ enabled: true, balanceUrl: 'https://hook.example/mix', cost: 10, limit: 1, cooldownSeconds: 30, queueCap: 2, secret: 's' });
ok(capMix.queueCap === 2 && normalizeMixItUp({ queueCap: 999 }).queueCap === 100 && normalizeMixItUp({}).queueCap === 0, 'the cap is whole, 0 = off by default, at most 100');
await mixitup.saveMixItUpSettings(capMix);
await queuePull('c1', { free: true }); await queuePull('c2', { free: true });
const full = await queuePull('cat', { chat: true });
ok(full.ignored === true && full.reason === 'queue_full' && /queue is full/.test(String(full.message)) && (await peekQueue()).length === 2, `a chat pull at the cap is refused: ${JSON.stringify(full)}`);
ok((await kv.get('mixitup:cd:cat')) == null && (await kv.get('mixitup:pending:cat')) == null, 'the refusal charged nothing, started no cooldown and counted toward no limit');
ok((await queuePull('sd', { free: true })).ok === true && (await peekQueue()).length === 3, 'a Stream Deck free pack still queues at the cap');
ok((await queuePull('tst', { test: true, free: true, trace: 'tr-2' })).ok === true && (await peekQueue()).length === 4, 'a test pull still queues at the cap');
await mixitup.saveMixItUpSettings(normalizeMixItUp({ ...capMix, enabled: false, queueCap: 0 }));
ok((await queuePull('off', { chat: true })).ok === true && (await peekQueue()).length === 5, '0 = off: a chat pull queues however many wait');
await mixitup.saveMixItUpSettings(normalizeMixItUp({}));
await clearQueueRefunding();

console.log('check-bridge-actions: ok');
