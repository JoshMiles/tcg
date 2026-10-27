// Streamer tools (ROADMAP 55.11): the uptime history (written only on a change, the last 10 streams), the live pull feed's facts on the reveal
// (only while the app says its window is open) and the end-of-stream summary job. Against the mock KV. Run: npx tsx scripts/check-streamer-tools.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const { NextRequest } = await import('next/server');
const kvLib = await import('../lib/kv');
const { kv } = await import('../lib/db');
const draw = await import('../lib/draw');
const m = await import('../lib/mixitup');
const mc = await import('../lib/mixitup-core');
const b = await import('../lib/bridge');
const core = await import('../lib/bridge-core');
const up = await import('../lib/bridge-uptime-core');
const upKv = await import('../lib/bridge-uptime');
const live = await import('../lib/twitch-live');
const { getOverlayKey } = await import('../lib/overlay-key');
const { POST } = await import('../app/api/collection/route');
const { POST: heartbeat } = await import('../app/api/overlay/heartbeat/route');
const { POST: report } = await import('../app/api/bridge/report/route');

// ── The pure uptime record ──
let list: ReturnType<typeof up.openStream> = [];
ok(up.recordChange(list, 'obs', true, 5) === null, 'no stream open: nothing is kept');
for (let i = 0; i < 12; i++) list = up.openStream(list, 1000 * (i + 1));
ok(list.length === 10 && list[0].from === 3000 && list.slice(0, 9).every(s => s.to !== undefined) && list[9].to === undefined, 'only the last 10 streams are kept, older ones closed');
const c1 = up.recordChange(list, 'obs', true, 20_000);
ok(c1 && c1[9].changes.length === 1, 'a first sighting is a change');
ok(up.recordChange(c1!, 'obs', true, 21_000) === null, 'the same state again writes nothing');
const c2 = up.recordChange(c1!, 'obs', false, 30_000)!;
const seg = up.segments({ ...c2[9], to: 40_000 }, 'obs', 40_000);
ok(seg.map(s => s.state).join() === 'unknown,up,down' && Math.abs(seg.reduce((n, s) => n + s.pct, 0) - 100) < 1e-9, JSON.stringify(seg));
ok(up.closeStream(up.closeStream(c2, 50_000)!, 60_000) === null, 'a closed stream cannot be closed again');
ok(up.readUptimeList([{ from: 1, changes: [{ at: 1, part: 'x', up: true }, { at: 2, part: 'mix', up: false }] }, 'junk']).length === 1, 'junk is dropped');

// ── Over the routes ──
await kvLib.seedSeason1();
const { token } = (await b.pairBridge((await b.createPairCode('check')).code, 'Stream PC'))!;
const auth = { authorization: `Bearer ${token}` };
const post = (body: unknown) => report(new Request('http://localhost/api/bridge/report', { method: 'POST', body: JSON.stringify(body), headers: auth }));
const obsBody = { type: 'obs', connected: true, scene: 'Main', overlay: { found: true, inProgram: true, visible: true, sourceName: 'Overlay' } };
await m.saveMixItUpSettings({ ...mc.normalizeMixItUp(null), currencyId: 'cur1' });
await kv.del('bridge:uptime');

await post(obsBody);
ok((await upKv.readUptime()).length === 0, 'outside a stream nothing is kept');
await live.setLiveFromHint(true);
await post(obsBody); await post(obsBody); await post({ type: 'mix', found: true }); await post({ type: 'mix', found: true });
let hist = await upKv.readUptime();
ok(hist.length === 1 && hist[0].changes.filter(c => c.part === 'obs').length === 1 && hist[0].changes.filter(c => c.part === 'mix').length === 1, 'repeated reports write once: ' + JSON.stringify(hist));
await post({ type: 'obs', ...obsBody, connected: false });
hist = await upKv.readUptime();
ok(hist[0].changes.filter(c => c.part === 'obs').map(c => c.up).join() === 'true,false', 'OBS going down is a change');
ok(hist[0].changes.some(c => c.part === 'bridge' && !c.up), 'the stream start notes the bridge (down here: it never polled)');
ok((await post({ type: 'mix' })).status === 400, 'a report of a wrong shape is refused');

// ── The live pull feed ──
const reveal = async (user: string, ticket: string) => {
  await kv.del('bridge:jobs');
  await draw.issueDraw(ticket, user);
  const saved = await (await POST(new NextRequest('http://localhost/api/collection', { method: 'POST', body: JSON.stringify({ pull: { username: user, ticket }, revealInMs: 2500 }) }))).json() as { eventId: string };
  await heartbeat(new NextRequest('http://localhost/api/overlay/heartbeat', { method: 'POST', body: JSON.stringify({ id: 'overlay-client-1', reveal: saved.eventId }), headers: { 'x-overlay-key': await getOverlayKey() } }));
  return (await kv.lrange<core.BridgeJob>('bridge:jobs', 0, -1)).find(j => j.kind === 'pull-event' && j.phase === 'reveal');
};
ok(!(await reveal('ann', 'f1')), 'window not open: a pull queues nothing for the feed');
ok((await post({ type: 'feed', on: true })).status === 200, 'the app says its window is open');
const feedJob = await reveal('ann', 'f2');
ok(feedJob?.feed?.viewer === 'ann' && !!feedJob.feed.card && !!feedJob.feed.rarity && typeof feedJob.feed.stars === 'number' && !!feedJob.feed.variant, 'window open: the reveal carries the pull: ' + JSON.stringify(feedJob?.feed));
await post({ type: 'feed', on: false });
ok(!(await reveal('ann', 'f3')), 'window closed again: nothing is queued');

// ── The end-of-stream summary ──
b.tuning.waitMs = 40; b.tuning.pollMs = 10;
await b.callBridge({ currencyId: 'cur1' }, { action: 'deduct', username: 'ann', amount: 100 });
await b.callBridge({ currencyId: 'cur1' }, { action: 'add', username: 'ann', amount: 30 });
await kv.del('bridge:jobs'); await kv.del('twitch:recap:lock');
await live.setLiveFromHint(false);
const sum = (await kv.lrange<core.BridgeJob>('bridge:jobs', 0, -1)).find(j => j.kind === 'summary')?.summary;
ok(sum && sum.packs >= 1 && sum.topPullers[0]?.username === 'ann' && sum.bigPulls.length >= 1 && sum.taken === 100 && sum.refunded === 30, 'the summary job: ' + JSON.stringify(sum));
hist = await upKv.readUptime();
ok(hist[hist.length - 1].to !== undefined, 'the stream ending closes its uptime record');

await kv.del('bridge:jobs');
console.log('streamer tools checks passed');
