// Bits, gifted subs and raids from Twitch (ROADMAP 58.4): each event rewarded through the same functions the Mix It Up requests use (packs per sub, bits per
// pack, the cap of 10, raid threshold, the raid shout-out), anonymous gifters and cheerers ignored, a repeated message id not rewarded twice, and the
// switch-over: the Mix It Up gifted-subs / bits / raid requests answer from_twitch only for the live channel with a fresh connected report and the
// matching subscription enabled; stale, disconnected, subscription missing or a test account leave Mix It Up working. Mock KV (node scripts/mock-kv.cjs)
// and a faked Twitch: no real Twitch. Run: npx tsx scripts/check-twitch-event-rewards.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
process.env.SESSION_SECRET = 'a-test-secret-that-is-long-enough-123';
process.env.TWITCH_CLIENT_ID = 'test-client'; process.env.TWITCH_CLIENT_SECRET = 'test-secret';
process.env.BACKUP_ENCRYPTION_KEY = 'a-backup-key-that-is-long-enough';
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const realFetch = globalThis.fetch;
let twitchUser = { id: '4242', login: 'SpareAccount' };
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const u = String(input instanceof Request ? input.url : input);
  if (u.startsWith(url)) return realFetch(input, init);
  if (u.endsWith('/oauth2/token')) return new Response(JSON.stringify({ access_token: 'ACCESS-1', refresh_token: 'REFRESH-1', expires_in: 14000, scope: ['channel:read:redemptions', 'bits:read', 'channel:read:subscriptions'] }), { status: 200 });
  if (u.endsWith('/oauth2/revoke')) return new Response('', { status: 200 });
  if (u.endsWith('/helix/users')) return new Response(JSON.stringify({ data: [twitchUser] }), { status: 200 });
  return new Response('{}', { status: 200 });
}) as typeof fetch;

const { NextRequest } = await import('next/server');
const kvLib = await import('../lib/kv');
const { kv } = await import('../lib/db');
const mix = await import('../lib/mixitup');
const { normalizeMixItUp } = await import('../lib/mixitup-core');
const ch = await import('../lib/twitch-channel');
const ev = await import('../lib/twitch-events');
const core = await import('../lib/twitch-events-core');
const { twitchHandlesEvent } = await import('../lib/twitch-eventsub');
const { getWebhookSettings } = await import('../lib/webhooks');
const { saveUserSettings } = await import('../lib/user-settings-store');
const { encodeEntry } = await import('../lib/variants');
const { CHANNEL_LOGIN } = await import('../lib/site');
const { POST: pullRoute } = await import('../app/api/webhooks/pull/route');

await kvLib.seedSeason1();
const season = (await kvLib.listSeasons())[0];
await kvLib.setActiveSeason(season.id);
const card = (await kvLib.getPackCards('pack1'))[0];
const entry = [encodeEntry(card.number, 'regular')];
await kvLib.saveCollection(season.collectionName, { rd_a: entry, rd_b: entry, rd_c: entry, rd_d: entry });
void saveUserSettings;

const secret = (await getWebhookSettings()).incomingSecret;
type Answer = { ok?: boolean; ignored?: boolean; reason?: string; message?: string };
const mixReq = async (event: string, username: string, amount: number): Promise<Answer> =>
  (await pullRoute(new NextRequest('http://localhost/api/webhooks/pull', { method: 'POST', body: JSON.stringify({ secret, event, username, amount }) }))).json();
const queue = () => kv.lrange<{ username: string; type: string }>('webhooks:queue', 0, -1);
const packs = async (who?: string) => (await queue()).filter(q => q.type !== 'card' && (!who || q.username === who)).length;
const shows = async () => (await queue()).filter(q => q.type === 'card').length;
const said = async () => (await kv.lrange<{ kind: string }>('bridge:jobs', 0, -1)).filter(j => j.kind === 'say').length;
const logHas = async (s: string) => (await mix.getMixItUpLog()).some(l => l.detail.includes(s));

const on = (extra: Record<string, unknown> = {}) => ({ on: true, reward: 'packs', ...extra });
const set = async (eventRewards: Record<string, unknown>) => mix.saveMixItUpSettings(normalizeMixItUp({ ...(await mix.getMixItUpSettings()), enabled: true, eventRewards }));
await set({ 'gifted-subs': on(), bits: on({ every: 100 }), raid: on({ every: 10 }), raidShoutout: { on: true, minViewers: 10 } });

let n = 0;
const twitch = async (type: string, event: Record<string, unknown>, id = `msg-${type.replace(/\W/g, '')}-${++n}-xxxx`) => {
  const clean = core.cleanTwitchEvent({ messageId: id, type, event: { broadcaster_user_id: '4242', to_broadcaster_user_id: '4242', ...event } });
  ok(clean, 'a good body');
  return ev.recordTwitchEvent(clean!);
};
const lastResult = async () => (await ev.recentTwitchEvents(1))[0]?.result;
const gift = (login: string, total: number, extra: Record<string, unknown> = {}) => twitch('channel.subscription.gift', { user_login: login, user_name: login, total, ...extra });
const cheer = (login: string, bits: number, extra: Record<string, unknown> = {}) => twitch('channel.cheer', { user_login: login, user_name: login, bits, ...extra });
const raid = (login: string, viewers: number, id?: string) => twitch('channel.raid', { from_broadcaster_user_login: login, from_broadcaster_user_name: login, viewers }, id);

// ── Pure rule ──
const fresh = { state: 'connected', reason: '', login: 'x', testing: false, since: 1, subs: Object.values(core.TWITCH_EVENT_OF).map(type => ({ type, status: 'enabled' })), pc: 'PC', at: 1_000_000 } as const;
const T = 'channel.cheer' as const;
ok(core.twitchHandles(T, { testing: false }, { ...fresh }, 1_000_000 + core.REPORT_STALE_MS), 'pure: live channel, fresh connected report, active subscription');
ok(!core.twitchHandles(T, { testing: false }, { ...fresh }, 1_000_001 + core.REPORT_STALE_MS), 'pure: a stale report is not enough');
ok(!core.twitchHandles(T, { testing: true }, { ...fresh }, 1_000_000), 'pure: a test account never switches over');
ok(!core.twitchHandles(T, null, { ...fresh }, 1_000_000) && !core.twitchHandles(T, { testing: false }, null, 1_000_000), 'pure: nothing connected, or no report');
ok(!core.twitchHandles(T, { testing: false }, { ...fresh, state: 'reconnecting' }, 1_000_000), 'pure: not connected');
ok(!core.twitchHandles(T, { testing: false }, { ...fresh, subs: [{ type: T, status: 'failed' }] }, 1_000_000) && !core.twitchHandles(T, { testing: false }, { ...fresh, subs: [] }, 1_000_000), 'pure: that subscription must be enabled');

// ── A test account: the rules run on Twitch events, Mix It Up is never switched off ──
ok((await ch.connectChannel('code', 'josh')).ok && (await ch.readChannelStatus())?.testing === true, 'a spare account is connected');
const report = { state: 'connected' as const, reason: '', login: 'SpareAccount', testing: true, since: Date.now(), subs: fresh.subs.map(s => ({ ...s })) };
await ev.storeEventSub(report, 'STREAM-PC');
ok(!(await twitchHandlesEvent('channel.cheer')), 'a test account with a fresh report does not switch Mix It Up off');

let before = await packs();
ok((await gift('gift_a', 3)).status === 'recorded' && (await packs('gift_a')) === 3 && (await packs()) === before + 3, 'gifted subs: one pack per sub');
ok((await lastResult())?.ok === true && /gift_a got 3 packs for 3 gifted subs/.test((await lastResult())!.text), `the result is recorded with the event: ${(await lastResult())?.text}`);
ok(await logHas('from Twitch, gift_a got 3 packs'), 'and the Mix It Up log has a line');
ok((await mix.getEventFeed()).some(e => e.event === 'gifted-subs' && e.amount === 3 && e.username === 'gift_a' && e.ok), 'and the event feed (57.7) too');
await gift('gift_cap', 15);
ok((await packs('gift_cap')) === 10, 'gifted subs: the cap of 10');
before = await packs();
await cheer('bits_a', 250);
ok((await packs('bits_a')) === 2 && (await lastResult())?.text.includes('2 packs for 250 bits'), 'bits: floor(bits / 100) packs');
await cheer('bits_b', 50);
ok((await packs('bits_b')) === 0 && (await lastResult())?.ok === true && /no pack/.test((await lastResult())!.text), 'bits under the amount per pack: no pack, said so');
await cheer('bits_cap', 5000);
ok((await packs('bits_cap')) === 10, 'bits: the cap of 10');
before = await packs();
await gift('anon_g', 5, { is_anonymous: true });
ok((await lastResult()) === undefined, 'an anonymous gifter has no result');
await cheer('anon_c', 5000, { is_anonymous: true });
ok((await packs()) === before && (await lastResult()) === undefined && !(await logHas('anon')), 'anonymous gifters and cheerers get nothing');
await gift('gift_bad', 0);
await cheer('x', 300);
ok((await packs()) === before, 'no usable amount or name: nothing');
// duplicates
before = await packs();
await gift('gift_dup', 2, {});
const dupId = 'msg-dup-0001-xxxx';
await cheer('bits_dup', 100, {}); // different id: counts
const first = await twitch('channel.cheer', { user_login: 'bits_d2', bits: 100 }, dupId);
const again = await twitch('channel.cheer', { user_login: 'bits_d2', bits: 100 }, dupId);
ok(first.status === 'recorded' && again.status === 'duplicate' && (await packs('bits_d2')) === 1, 'a repeated message id is not rewarded twice');
// an event switched off earns and shows nothing
await set({ 'gifted-subs': { on: false, reward: 'packs' }, bits: on({ every: 100 }), raid: on({ every: 10 }), raidShoutout: { on: true, minViewers: 10 } });
before = await packs();
await gift('gift_off', 4);
ok((await packs()) === before && (await lastResult()) === undefined && !(await logHas('gift_off')), 'a switched-off event is silent');
await set({ 'gifted-subs': on(), bits: on({ every: 100 }), raid: on({ every: 10 }), raidShoutout: { on: true, minViewers: 10 } });

// raid: reward and shout-out (a test account shows the shout-out on the live overlay, by design)
before = await packs();
await raid('rd_a', 12);
ok((await packs('rd_a')) === 1 && (await shows()) === 1 && (await said()) === 1, 'raid: a pack and the shout-out once');
ok(/raid shout-out shown/.test((await lastResult())?.text ?? ''), `the raid result mentions the shout-out: ${(await lastResult())?.text}`);
await raid('rd_a', 40);
ok((await packs('rd_a')) === 2 && (await shows()) === 1 && (await said()) === 1, 'raid: the same raider again earns a pack but no second shout-out');
await raid('rd_c', 3);
ok((await packs('rd_c')) === 0 && (await shows()) === 1, 'raid under the threshold: no pack, no shout-out');
await raid('rd_nobody', 12);
ok((await shows()) === 1, 'raid: a raider with no cards shows nothing');
await set({ raid: { on: false, reward: 'packs' }, raidShoutout: { on: true, minViewers: 10 } });
await raid('rd_d', 12);
ok((await packs('rd_d')) === 0 && (await shows()) === 2, 'raid reward off: the shout-out still runs, as on the Mix It Up path');
await set({ 'gifted-subs': on(), bits: on({ every: 100 }), raid: on({ every: 10 }), raidShoutout: { on: true, minViewers: 10 } });

// the Mix It Up path is unchanged with a test account connected
before = await packs();
let r = await mixReq('bits', 'mixer_t', 300);
ok(r.ok && !r.ignored && (await packs('mixer_t')) === 3 && r.message === 'mixer_t got 3 packs for 300 bits!', `test account: Mix It Up bits work as before: ${r.message}`);
r = await mixReq('gifted-subs', 'mixer_t', 2);
ok(r.ok && !r.ignored && (await packs('mixer_t')) === 5, 'test account: Mix It Up gifted subs work as before');

// ── The live channel ──
twitchUser = { id: '4242', login: CHANNEL_LOGIN };
ok((await ch.connectChannel('code', 'josh')).ok && (await ch.readChannelStatus())?.testing === false, 'the live channel is connected');
const live = { ...report, login: CHANNEL_LOGIN, testing: false };
const store = (over: Record<string, unknown> = {}, ageMs = 0) => kv.set('twitch:eventsub', { ...live, pc: 'STREAM-PC', at: Date.now() - ageMs, ...over });
const works = async (label: string) => {
  let b = await packs();
  r = await mixReq('gifted-subs', 'mx_gift', 2);
  ok(r.ok && !r.ignored && (await packs()) === b + 2, `${label}: Mix It Up gifted subs work`);
  b = await packs(); r = await mixReq('bits', 'mx_bits', 200);
  ok(r.ok && !r.ignored && (await packs()) === b + 2, `${label}: Mix It Up bits work`);
  b = await packs(); r = await mixReq('raid', 'mx_raid', 2);
  ok(r.ok && !r.ignored && (await packs()) === b + 0 && r.reason !== 'from_twitch', `${label}: Mix It Up raid works`);
};
const ignoredAll = async (label: string) => {
  const b = await packs(); const s = await shows(); const sy = await said();
  for (const [event, amount] of [['gifted-subs', 2], ['bits', 500], ['raid', 50]] as const) {
    r = await mixReq(event, 'rd_b', amount);
    ok(r.ok === true && r.ignored === true && r.reason === 'from_twitch' && r.message === '', `${label}: ${event} answers from_twitch, silently`);
  }
  ok((await packs()) === b && (await shows()) === s && (await said()) === sy, `${label}: nothing queued and no shout-out from Mix It Up`);
  ok(await logHas('from_twitch'), `${label}: and it is in the Mix It Up log`);
};

await kv.del('twitch:eventsub');
await works('live channel, no report');
await store({}, core.REPORT_STALE_MS + 5000);
await works('stale report');
await store({ state: 'reconnecting' });
await works('disconnected (reconnecting)');
await store({ state: 'off' });
await works('app off');
await store({ testing: true });
await works('report says testing');
await store({ subs: live.subs.filter(s => s.type !== 'channel.raid') });
ok(await twitchHandlesEvent('channel.cheer') && !(await twitchHandlesEvent('channel.raid')), 'a missing subscription only releases its own event');
r = await mixReq('raid', 'mx_raid2', 20);
ok(r.ok && !r.ignored && r.reason !== 'from_twitch', 'subscription missing: Mix It Up raid works');
r = await mixReq('bits', 'rd_b', 200);
ok(r.ignored === true && r.reason === 'from_twitch', 'while that same report ignores the bits request');
await store({ subs: live.subs.map(s => (s.type === 'channel.raid' ? { ...s, status: 'failed' } : s)) });
r = await mixReq('raid', 'mx_raid3', 20);
ok(r.ok && !r.ignored, 'subscription failed: Mix It Up raid works');

// switch-over on
await store();
ok(await twitchHandlesEvent('channel.subscription.gift') && await twitchHandlesEvent('channel.cheer') && await twitchHandlesEvent('channel.raid'), 'live channel, fresh connected report, active subscriptions: Twitch handles all three');
await ignoredAll('connected');
r = await mixReq('redeem', 'mx_red', 1);
ok(r.reason !== 'from_twitch', 'the redeem event is not part of this switch-over');
// a Twitch event still rewards while connected, and the shout-out runs once overall
await set({ 'gifted-subs': on(), bits: on({ every: 100 }), raid: on({ every: 10 }), raidShoutout: { on: true, minViewers: 10 } });
const s0 = await shows(); const c0 = await said(); const p0 = await packs('rd_b');
await raid('rd_b', 25);
ok((await packs('rd_b')) === p0 + 1 && (await shows()) === s0 + 1 && (await said()) === c0 + 1, 'connected: the Twitch raid gives the pack and the shout-out');
r = await mixReq('raid', 'rd_b', 25);
ok(r.reason === 'from_twitch' && (await shows()) === s0 + 1 && (await said()) === c0 + 1 && (await packs('rd_b')) === p0 + 1, 'and the Mix It Up raid for the same raid does nothing more (no double shout-out)');
await gift('gift_live', 2);
ok((await packs('gift_live')) === 2, 'connected: a Twitch gift rewards');

// back to down: Mix It Up runs the shout-out and reward again
await store({}, core.REPORT_STALE_MS + 5000);
await set({ raid: on({ every: 10 }), raidShoutout: { on: true, minViewers: 10 } });
const p1 = await packs('rd_c'); const s1 = await shows();
r = await mixReq('raid', 'rd_c', 25);
ok(r.ok && !r.ignored && (await packs('rd_c')) === p1 + 1 && (await shows()) === s1 + 1, 'down again: the Mix It Up raid rewards and shows the shout-out');

// disconnected channel
await set({ 'gifted-subs': on(), bits: on({ every: 100 }), raid: on({ every: 10 }), raidShoutout: { on: true, minViewers: 10 } });
await ch.disconnectChannel();
await store();
await works('no channel connected');

console.log('check-twitch-event-rewards: ok');
