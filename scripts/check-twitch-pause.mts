// Pause channel point awards (ROADMAP 58.5): the control action (toggle, explicit, audited once per change, shown in `status`), a redemption while paused
// recorded with no award, the "awards paused" result and refund notice, awards running again after resuming, and the app's event feed lines (redemption,
// stream online / offline). Mock KV (node scripts/mock-kv.cjs) and a fake Twitch as fetch: no real Twitch.
// Run: npx tsx scripts/check-twitch-pause.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
process.env.SESSION_SECRET = 'a-test-secret-that-is-long-enough-123';
process.env.TWITCH_CLIENT_ID = 'test-client'; process.env.TWITCH_CLIENT_SECRET = 'test-secret';
process.env.BACKUP_ENCRYPTION_KEY = 'a-backup-key-that-is-long-enough';
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const realFetch = globalThis.fetch;
const fake = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const u = String(input instanceof Request ? input.url : input);
  if (u.startsWith(url)) return realFetch(input, init);
  if (u.endsWith('/oauth2/token')) return new Response(JSON.stringify({ access_token: 'ACCESS-1', refresh_token: 'REFRESH-1', expires_in: 14000, scope: ['channel:read:redemptions', 'bits:read', 'channel:read:subscriptions'] }), { status: 200 });
  if (u.endsWith('/helix/users')) return new Response(JSON.stringify({ data: [{ id: '4242', login: 'SpareAccount' }] }), { status: 200 });
  return new Response('{}', { status: 200 });
}) as typeof fetch;
globalThis.fetch = fake;

const kvLib = await import('../lib/kv');
const { kv } = await import('../lib/db');
const aw = await import('../lib/twitch-awards');
const ch = await import('../lib/twitch-channel');
const ev = await import('../lib/twitch-events');
const b = await import('../lib/bridge');
const mix = await import('../lib/mixitup');
const { runBridgeAction } = await import('../lib/bridge-actions');
const { getUserAudit } = await import('../lib/audit');
const { NextRequest } = await import('next/server');
const { POST: actionRoute } = await import('../app/api/bridge/action/route');

const PACK = '00000001-aaaa-bbbb-cccc-000000000000';
ok((await ch.connectChannel('code', 'josh', fake)).ok, 'a spare account is connected');
await kvLib.seedSeason1();
await kvLib.setActiveSeason((await kvLib.listSeasons())[0].id);
await aw.saveAwards({ [PACK]: { kind: 'pack' } });
const token = await b.mintToken('STREAM-PC', { userId: '1', login: 'josh', role: 'admin', by: 'josh', roleCheckedAt: Date.now() });
const pc = (await b.listBridges())[0];

const red = (id: string, login: string) => ({ messageId: id, type: 'channel.channel_points_custom_reward_redemption.add' as const, event: { broadcaster_user_id: '4242', user_login: login, user_name: login, reward: { id: PACK, title: 'Open a pack' } } });
const queued = async () => (await kv.lrange<{ type: string; username: string }>('webhooks:queue', 0, -1)).length;
const last = async () => (await ev.recentTwitchEvents())[0];
const notices = async () => kv.llen(`bridge:notices:${pc.id}`);
const audits = async () => (await getUserAudit('everyone', 50)).filter(a => /channel point awards (paused|resumed)/.test(a.action)).length;
const act = async (body: Record<string, unknown>) => runBridgeAction(body, (await b.listBridges())[0] as never);

// ── Not paused: the award runs ──
ok(!(await aw.awardsPaused()) && (await act({ action: 'status' })).awardsPaused === false, 'awards run by default and status says so');
await ev.recordTwitchEvent(red('msg-run-000001', 'cardfan'));
ok((await queued()) === 1 && (await last()).result?.ok === true, 'an award runs while not paused');

// ── The control action: through the route, with the bridge token only ──
const post = (body: unknown, auth?: string) => actionRoute(new NextRequest('http://localhost/api/bridge/action', { method: 'POST', body: JSON.stringify(body), headers: auth ? { authorization: `Bearer ${auth}` } : {} }));
ok((await post({ action: 'pause-awards', on: true })).status === 401 && !(await aw.awardsPaused()), 'no token: refused, nothing changes');
ok((await post({ action: 'pause-awards', on: true }, 'not-a-token')).status === 401 && !(await aw.awardsPaused()), 'an unknown token: refused');
let r = await (await post({ action: 'pause-awards', on: true }, token)).json();
ok(r.ok && r.awardsPaused === true && (await aw.awardsPaused()), 'a paired PC pauses the awards');
ok((await audits()) === 1, 'the change is audited');
await act({ action: 'pause-awards', on: true });
ok((await audits()) === 1, 'pausing again changes nothing and adds no audit line');
ok((await act({ action: 'status' })).awardsPaused === true, 'status reports the pause');
ok((await act({ action: 'pause', on: false })).awardsPaused === undefined && (await aw.awardsPaused()), 'the pulls pause is a separate switch');

// ── Paused: recorded, no award, "awards paused" everywhere ──
const n0 = await queued();
const n = await notices();
const out = await ev.recordTwitchEvent(red('msg-held-000001', 'cardfan'));
ok(out.status === 'recorded', 'the redemption is still recorded');
ok((await queued()) === n0, 'no award ran (nothing queued)');
const l = await last();
ok(l.result?.ok === false && /awards paused/.test(l.result.text), `the event result says awards paused: ${l.result?.text}`);
ok((await notices()) === n + 1, 'the failed-award notice was sent');
const note = await kv.lrange<{ notice: { title: string; text?: string } }>(`bridge:notices:${pc.id}`, 0, -1);
ok(note.some(x => x.notice.title === "Refund cardfan's Open a pack by hand" && x.notice.text === 'awards paused'), 'the notice text says awards paused');
await ev.recordTwitchEvent(red('msg-held-000002', 'cardfan'));
ok((await notices()) === n + 1, 'the notice is still rate limited to one a minute');
const feed = await mix.getEventFeed();
ok(feed.some(e => e.event === 'redeem' && e.username === 'cardfan' && !e.ok && /awards paused/.test(e.detail)), 'the app feed has the redemption as a refused line');
ok(feed.some(e => e.event === 'redeem' && e.ok && /redeemed Open a pack/.test(e.detail)), 'and the earlier award as a good one');

// ── Twitch events without an award still reach the feed: stream online / offline ──
await ev.recordTwitchEvent({ messageId: 'msg-online-0001', type: 'stream.online', event: { broadcaster_user_id: '4242' } });
await ev.recordTwitchEvent({ messageId: 'msg-offline-001', type: 'stream.offline', event: { broadcaster_user_id: '4242' } });
const feed2 = await mix.getEventFeed();
ok(feed2.some(e => e.event === 'stream-online' && e.ok) && feed2.some(e => e.event === 'stream-offline' && e.ok), 'stream online and offline are in the feed');
ok(!(await mix.getMixItUpLog()).some(x => /went (on|off)line/.test(x.detail)), 'but not in the Mix It Up request log');

// ── Resume ──
r = await act({ action: 'pause-awards' }); // no `on`: toggles
ok(r.awardsPaused === false && !(await aw.awardsPaused()) && (await audits()) === 2, 'a toggle resumes the awards and is audited');
await ev.recordTwitchEvent(red('msg-run-000002', 'cardfan'));
ok((await queued()) === n0 + 1 && (await last()).result?.ok === true, 'awards run again after resuming');
r = await act({ action: 'pause-awards', on: 'yes' });
ok(r.awardsPaused === true, 'a body that is not a boolean toggles instead of being trusted');
ok(!(await act({ action: 'pause-awardz' })).ok, 'an unknown action is refused');

console.log('check-twitch-pause: ok');
