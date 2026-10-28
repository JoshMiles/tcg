// Twitch EventSub events through TCG Bridge (ROADMAP 58.2), the site half: the event route (auth, the admin-PC rule, shape validation and caps, a repeated
// message id dropped, another channel's event ignored, nothing awarded), stream.online / stream.offline feeding the live state (not for a test
// account), the capped recent list, the app's connection report and the token answer's new fields. Mock KV (node scripts/mock-kv.cjs) and a faked
// Twitch: no real Twitch. Run: npx tsx scripts/check-twitch-events.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
process.env.SESSION_SECRET = 'a-test-secret-that-is-long-enough-123';
process.env.TWITCH_CLIENT_ID = 'test-client'; process.env.TWITCH_CLIENT_SECRET = 'test-secret';
process.env.BACKUP_ENCRYPTION_KEY = 'a-backup-key-that-is-long-enough';
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const realFetch = globalThis.fetch;
let twitchUser = { id: '4242', login: 'SpareAccount' };
const SCOPES = ['channel:read:redemptions', 'bits:read', 'channel:read:subscriptions', 'user:read:chat', 'user:write:chat', 'channel:bot']; // 58.6 sign-in asks for chat too
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const u = String(input instanceof Request ? input.url : input);
  if (u.startsWith(url)) return realFetch(input, init);
  if (u.endsWith('/oauth2/token')) return new Response(JSON.stringify({ access_token: 'ACCESS-1', refresh_token: 'REFRESH-1', expires_in: 14000, scope: SCOPES }), { status: 200 });
  if (u.endsWith('/oauth2/revoke')) return new Response('', { status: 200 });
  if (u.endsWith('/helix/users')) return new Response(JSON.stringify({ data: [twitchUser] }), { status: 200 });
  if (u.includes('/helix/streams')) return new Response(JSON.stringify({ data: [] }), { status: 200 });
  return new Response('{}', { status: 200 }); // Discord and the like: nothing real is called
}) as typeof fetch;

const core = await import('../lib/twitch-events-core');
const ch = await import('../lib/twitch-channel');
const ev = await import('../lib/twitch-events');
const b = await import('../lib/bridge');
const { kv } = await import('../lib/db');
const eventRoute = await import('../app/api/bridge/twitch-event/route');
const reportRoute = await import('../app/api/bridge/report/route');
const tokenRoute = await import('../app/api/bridge/twitch-token/route');

// ── Pure shapes ──
ok(core.cleanTwitchEvent({ messageId: 'abcdefgh-1', type: 'channel.cheer', event: { bits: 5 } })?.type === 'channel.cheer', 'a good body passes');
for (const bad of [null, 'x', {}, { messageId: 'short', type: 'channel.cheer', event: {} }, { messageId: 'abcdefgh-1', type: 'channel.follow', event: {} },
  { messageId: 'abcdefgh-1', type: 'channel.cheer', event: [] }, { messageId: 'abcdefgh-1', type: 'channel.cheer' }, { messageId: 'a b c d e f g h', type: 'channel.cheer', event: {} },
  { messageId: 'x'.repeat(101), type: 'channel.cheer', event: {} }]) ok(core.cleanTwitchEvent(bad) === null, `rejected: ${JSON.stringify(bad)?.slice(0, 60)}`);
ok(core.eventText('channel.cheer', { user_name: 'Alice', bits: 100 }) === 'Alice cheered 100 bits', 'a cheer line');
ok(core.eventText('channel.cheer', { is_anonymous: true, user_name: 'Alice', bits: 1 }) === 'Anonymous cheered 1 bit', 'an anonymous cheer hides the name');
ok(core.eventText('channel.channel_points_custom_reward_redemption.add', { user_name: 'Bob', reward: { title: 'Hydrate', cost: 100 }, user_input: 'secret text' }) === 'Bob redeemed Hydrate', 'a redemption line never holds the viewer\'s input');
ok(core.eventText('channel.subscription.gift', { user_name: 'Cy', total: 5 }) === 'Cy gifted 5 subs', 'a gift line');
ok(core.eventText('channel.raid', { from_broadcaster_user_name: 'Dee', viewers: 12 }) === 'Dee raided with 12 viewers', 'a raid line');
ok(core.eventText('channel.cheer', { user_name: 'x'.repeat(500), bits: 1e12 }).length < 80, 'long names and huge numbers are capped');
ok(core.eventChannelId('channel.raid', { to_broadcaster_user_id: '9', broadcaster_user_id: '1' }) === '9', 'a raid is about the channel it goes to');
ok(core.cleanEventSubReport({ state: 'bogus' }) === null && core.cleanEventSubReport({ state: 'connected', subs: [{ type: 'a', status: 'enabled' }, 5] })?.subs.length === 1, 'a report is checked and its subs filtered');

// ── The route ──
const admin = await b.mintToken('STREAM-PC', { userId: '1', login: 'josh', role: 'admin', by: 'josh', roleCheckedAt: Date.now() });
const mod = await b.mintToken('Mod PC', { userId: '2', login: 'modder', role: 'mod', by: 'modder', roleCheckedAt: Date.now() });
const oldOff = await b.mintToken('Old PC', { by: 'josh' });
const post = (path: string, route: { POST: (r: Request) => Promise<Response> }, token: string | undefined, body: unknown) =>
  route.POST(new Request('http://localhost' + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: typeof body === 'string' ? body : JSON.stringify(body) }));
const sendEvent = (token: string | undefined, body: unknown) => post('/api/bridge/twitch-event', eventRoute, token, body);
const mk = (id: string, type: string, event: Record<string, unknown>) => ({ messageId: id, type, event });
const mine = (extra: Record<string, unknown> = {}) => ({ broadcaster_user_id: '4242', ...extra });

ok((await sendEvent(undefined, mk('abcdefgh-0', 'channel.cheer', mine()))).status === 401, 'no token is refused');
ok((await sendEvent(mod, mk('abcdefgh-0', 'channel.cheer', mine()))).status === 403, 'a mod-linked PC is refused');
ok((await sendEvent(oldOff, mk('abcdefgh-0', 'channel.cheer', mine()))).status === 403, 'an old paired PC with the staff switch off is refused');

// nothing connected: quiet, recorded nowhere
const none = await sendEvent(admin, mk('abcdefgh-1', 'channel.cheer', mine({ user_name: 'Alice', bits: 100 })));
ok(none.status === 200 && (await none.json()).reason === 'not_connected' && (await ev.recentTwitchEvents()).length === 0, 'with no channel connected an event is ignored');

// connect a test account
const c = await ch.connectChannel('code', 'josh');
ok(c.ok && (await ch.readChannelStatus())?.testing === true, 'a spare account is connected');

const bad = await sendEvent(admin, { messageId: 'abcdefgh-2', type: 'channel.follow', event: {} });
ok(bad.status === 400, 'a type the site does not take is a 400');
ok((await sendEvent(admin, 'not json')).status === 400, 'broken JSON is a 400');
ok((await sendEvent(admin, JSON.stringify({ ...mk('abcdefgh-2', 'channel.cheer', mine()), pad: 'x'.repeat(core.EVENT_BODY_MAX) }))).status === 400, 'a body over 16 KB is a 400');

// recorded, then dropped when repeated
const r1 = await sendEvent(admin, mk('msg-cheer-0001', 'channel.cheer', mine({ user_name: 'Alice', bits: 100, message: 'private words' })));
const j1 = await r1.json();
ok(r1.status === 200 && j1.status === 'recorded', 'a cheer is recorded');
const r2 = await sendEvent(admin, mk('msg-cheer-0001', 'channel.cheer', mine({ user_name: 'Alice', bits: 100 })));
ok((await r2.json()).status === 'duplicate', 'a repeated message id is dropped');
ok((await kv.ttl('twitch:event:msg-cheer-0001')) > 0 && (await kv.ttl('twitch:event:msg-cheer-0001')) <= core.SEEN_TTL_S, 'the id is remembered for at most 10 minutes (SET NX EX 600)');
let list = await ev.recentTwitchEvents();
ok(list.length === 1 && list[0].text === 'Alice cheered 100 bits', 'the list holds one line for it');
ok(!JSON.stringify(await kv.lrange('twitch:events', 0, -1)).includes('private words'), 'the cheer\'s message text is not kept');

// another channel's event is ignored
const other = await sendEvent(admin, mk('msg-cheer-0002', 'channel.cheer', { broadcaster_user_id: '999', user_name: 'Eve', bits: 1 }));
ok((await other.json()).reason === 'other_channel' && (await ev.recentTwitchEvents()).length === 1, 'an event for another channel is ignored');
const raidOut = await sendEvent(admin, mk('msg-raid-0001', 'channel.raid', { from_broadcaster_user_id: '4242', from_broadcaster_user_name: 'Spare', to_broadcaster_user_id: '5', viewers: 3 }));
ok((await raidOut.json()).reason === 'other_channel', 'a raid we send out is ignored (only raids to the channel count)');

// nothing is awarded: the other kinds are only recorded
for (const [id, type, event] of [
  ['msg-redeem-001', 'channel.channel_points_custom_reward_redemption.add', mine({ user_name: 'Bob', reward: { title: 'Open a pack' } })],
  ['msg-gift-00001', 'channel.subscription.gift', mine({ user_name: 'Cy', total: 5 })],
  ['msg-raid-0002', 'channel.raid', { from_broadcaster_user_name: 'Dee', to_broadcaster_user_id: '4242', viewers: 12 }],
] as const) ok((await (await sendEvent(admin, mk(id, type, event))).json()).status === 'recorded', `${type} is recorded`);
list = await ev.recentTwitchEvents();
ok(list.length === 4 && list[0].text === 'Dee raided with 12 viewers', 'newest first');
ok((await kv.get('twitch:live')) === null, 'none of those touched the live state');

// the list is capped
for (let i = 0; i < core.EVENTS_KEPT + 5; i++) await sendEvent(admin, mk(`msg-fill-${String(i).padStart(4, '0')}`, 'channel.cheer', mine({ user_name: 'F', bits: i + 1 })));
ok((await ev.recentTwitchEvents(100)).length <= core.EVENTS_KEPT, 'the list is capped');

// stream online / offline: a test account does not flip the real channel's live state
const testOnline = await (await sendEvent(admin, mk('msg-online-001', 'stream.online', mine({ type: 'live' })))).json();
ok(testOnline.status === 'recorded' && testOnline.live === undefined && (await kv.get('twitch:live')) === null && (await kv.get('twitch:live:hint')) === null, 'a test account going live is recorded but does not change the live state');

// the live channel: online / offline feed the live state like the OBS report
twitchUser = { id: '4242', login: 'Cheesygidds' };
await ch.connectChannel('code', 'josh');
ok((await ch.readChannelStatus())?.testing === false, 'now the live channel is connected');
const on = await (await sendEvent(admin, mk('msg-online-002', 'stream.online', mine({ type: 'live' })))).json();
ok(on.status === 'recorded' && on.live === true, 'stream.online is recorded and feeds the live state');
ok(((await kv.get('twitch:live')) as { live: boolean } | null)?.live === true && ((await kv.get('twitch:live:hint')) as { live: boolean } | null)?.live === true, 'the site is live, with a hint like the OBS report');
const hintAt = ((await kv.get('twitch:live:hint')) as { at: number }).at;
await sendEvent(admin, mk('msg-online-003', 'stream.online', mine({ type: 'live' })));
ok(((await kv.get('twitch:live:hint')) as { at: number }).at === hintAt, 'a second online does not refresh the 5 minute override (setLiveFromBridge)');
await sendEvent(admin, mk('msg-offline-01', 'stream.offline', mine()));
ok(((await kv.get('twitch:live')) as { live: boolean } | null)?.live === false, 'stream.offline ends it');
ok((await ev.recentTwitchEvents(3)).some(e => e.text === 'The stream went offline'), 'and is on the list');

// rate limit
let last = 200;
for (let i = 0; i < 130 && last !== 429; i++) last = (await sendEvent(admin, mk(`msg-rate-${String(i).padStart(5, '0')}`, 'channel.cheer', mine({ bits: 1 })))).status;
ok(last === 429, 'the route rate limits one PC');

// ── The app's connection report ──
const report = (token: string | undefined, body: unknown) => post('/api/bridge/report', reportRoute, token, body);
const good = { type: 'twitch', state: 'connected', reason: '', login: 'cheesygidds', testing: false, since: Date.now() - 3600_000, subs: [{ type: 'stream.online', status: 'enabled' }] };
ok((await report(mod, good)).status === 403 && (await report(oldOff, good)).status === 403, 'a mod PC or an old PC without the switch cannot report the connection');
ok((await report(admin, { ...good, state: 'bogus' })).status === 400, 'a bad report is a 400');
ok((await ev.readEventSub()) === null, 'nothing stored yet');
ok((await report(admin, good)).status === 200, 'an admin PC reports');
const st = await ev.readEventSub();
ok(st?.pc === 'STREAM-PC' && st.state === 'connected' && st.subs.length === 1, 'the report is stored with the PC\'s name');
const line = core.listeningLine(st, (await ev.recentTwitchEvents(1))[0] ?? null, Date.now(), () => 'T');
ok(line === 'TCG Bridge listening on STREAM-PC since T, last event T', `the card line: ${line}`);
ok(core.listeningLine({ ...st!, state: 'reconnecting' }, null, Date.now(), () => 'T') === null, 'reconnecting is not listening');
ok(core.listeningLine(st, null, Date.now() + core.REPORT_STALE_MS + 1, () => 'T') === null, 'a stale report is not listening');
ok(core.listeningLine(st, null, Date.now(), () => 'T')?.endsWith('no event yet'), 'no event yet is said');

// ── The token answer carries what the app needs ──
await kv.del('rl:bridge-twitch-token:' + (await import('../lib/bridge-core')).hashToken(admin));
const tr = await post('/api/bridge/twitch-token', tokenRoute, admin, {});
const tj = await tr.json();
ok(tr.status === 200 && tj.clientId === 'test-client' && tj.testing === false && tj.userId === '4242', 'the token answer holds the client id and the testing flag');
ok(!JSON.stringify(tj).includes('REFRESH'), 'and still no refresh token');

globalThis.fetch = realFetch;
console.log('check-twitch-events: ok');
process.exit(0);
