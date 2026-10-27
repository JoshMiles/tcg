// TCG Bridge staff tools (ROADMAP 55.12): POST/GET /api/bridge/staff are 403 until an admin switches "Staff tools on this PC" on (and again after
// revoking), every action writes an audit line naming the PC and who paired it, a block refuses paid pulls, !pack and gifts (for this stream or until
// lifted), and nothing runs in a sandbox. Against the mock KV. Run: npx tsx scripts/check-bridge-staff.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

// revalidatePath needs a Next request store; outside the server it throws, so it does nothing here.
import { createRequire } from 'node:module';
(createRequire(import.meta.url)('next/cache') as { revalidatePath: () => void }).revalidatePath = () => {};

const kvLib = await import('../lib/kv');
const { kv, runInSandbox } = await import('../lib/db');
const b = await import('../lib/bridge');
const mixitup = await import('../lib/mixitup');
const { normalizeMixItUp } = await import('../lib/mixitup-core');
const { queuePull } = await import('../lib/pull-queue');
const { peekQueue } = await import('../lib/webhooks');
const { getStreamBuff } = await import('../lib/pull-limit');
const { getTradeSettings } = await import('../lib/trades');
const { listPullBlocks } = await import('../lib/pull-block');
const route = await import('../app/api/bridge/staff/route');
const actionRoute = await import('../app/api/bridge/action/route');

await kvLib.seedSeason1();
const code = await b.createPairCode('josh');
const token = (await b.pairBridge(code.code, 'Stream PC'))!.token;

const post = async (body: Record<string, unknown>, tok: string | null = token) => {
  const res = await route.POST(new Request('http://localhost/api/bridge/staff', { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}) }, body: JSON.stringify(body) }));
  return { status: res.status, ...(await res.json()) } as { status: number; ok: boolean; message: string; needsForce?: boolean };
};
const get = async (q: string, tok: string | null = token) => {
  const res = await route.GET(new Request(`http://localhost/api/bridge/staff?${q}`, { headers: tok ? { authorization: `Bearer ${tok}` } : {} }));
  return { status: res.status, ...(await res.json()) } as Record<string, any>;
};
const audits = async () => (await kv.lrange<{ action: string; username: string }>('audit:all', 0, 50)) ?? [];

// ── The switch: off by default, 403 on every staff route ──
const actions = [{ action: 'gift', username: 'ann', force: true }, { action: 'show-collection', username: 'ann', force: true }, { action: 'show-card', username: 'ann', card: '1' },
  { action: 'grant', username: 'ann', cardNumber: 1, variant: 'regular' }, { action: 'stream-extra', amount: 2 }, { action: 'trading', on: false },
  { action: 'block', username: 'ann', mode: 'stream' }, { action: 'unblock', username: 'ann' }, { action: 'scene', name: 'Main' }];
for (const a of actions) ok((await post(a)).status === 403, `${a.action} is 403 while staff tools are off`);
for (const w of ['state', 'users', 'cards&q=a', 'viewer&q=ann']) ok((await get(`what=${w}`)).status === 403, `GET ${w} is 403 while staff tools are off`);
ok((await post({ action: 'gift' }, null)).status === 401 && (await post({ action: 'gift' }, 'nope')).status === 401, 'no token or a wrong token is 401');
ok((await audits()).length === 0, 'a refused call wrote no audit line');
const status = async () => (await (await actionRoute.POST(new Request('http://localhost/api/bridge/action', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ action: 'status' }) }))).json()) as { staff?: boolean };
ok((await status()).staff === false, 'status tells the app this PC has no staff tools');

// ── Switch on ──
const id = (await b.listBridges())[0].id;
ok((await b.setBridgeStaff(id, true)) === 'Stream PC', 'the switch names the PC');
ok((await b.listBridges())[0].by === 'josh' && (await status()).staff === true, 'the PC remembers who paired it, and status says staff');

// ── Reads ──
const state = await get('what=state');
ok(state.status === 200 && state.tradingPaused === false && Array.isArray(state.blocks), 'state reads');
ok((await get('what=cards&q=zzzz-nothing')).cards.length === 0, 'a card search with no match is empty');
ok(Array.isArray((await get('what=users')).users), 'users reads');
ok((await get('what=viewer&q=bad name!')).error, 'a bad viewer name is refused in words');

// ── Actions, each with an audit line naming the PC and the admin who paired it ──
const has = async (needle: string) => (await audits()).some(e => e.action.includes(needle) && e.action.includes('via TCG Bridge on Stream PC, paired by josh'));
ok((await post({ action: 'gift', username: 'ann', count: 2 })).needsForce === true, 'a gift with no overlay asks to be forced');
let r = await post({ action: 'gift', username: 'ann', count: 2, force: true });
ok(r.ok && (await peekQueue()).length === 2 && (await has('Gifted 2 packs')), `gift queued and audited: ${JSON.stringify(r)}`);
ok(!(await post({ action: 'gift', username: 'not a name!!' })).ok, 'a bad name is refused');
r = await post({ action: 'show-collection', username: 'ann', force: true });
ok(r.ok && (await has('Showed collection')), 'show collection audited');
r = await post({ action: 'grant', username: 'ann', cardNumber: 1, variant: 'regular' });
ok(r.ok && (await has('Card granted')), `grant audited: ${JSON.stringify(r)}`);
ok(!(await post({ action: 'grant', username: 'ann', cardNumber: 99999, variant: 'regular' })).ok, 'granting a card that does not exist is refused');
r = await post({ action: 'show-card', username: 'ann', card: '#1' });
ok(r.ok && (await has('Showed a card')), `show card audited: ${JSON.stringify(r)}`);
r = await post({ action: 'stream-extra', amount: 3 });
ok(r.ok && (await getStreamBuff()) !== null && (await has('Stream pull bonus set')), 'extra pulls set and audited');
ok((await post({ action: 'stream-extra', amount: 'lots' })).ok === false, 'a bad amount is refused');
r = await post({ action: 'stream-extra', amount: 0 });
ok(r.ok && (await has('Stream pull bonus cleared')), 'extra pulls cleared and audited');
r = await post({ action: 'trading', on: false });
ok(r.ok && !(await getTradeSettings()).enabled && (await has('Trading paused')) && (await get('what=state')).tradingPaused === true, 'trading paused and audited');
r = await post({ action: 'trading', on: true });
ok(r.ok && (await getTradeSettings()).enabled && (await has('Trading resumed')), 'trading resumed and audited');
ok((await post({ action: 'scene', name: 'Be Right Back' })).ok && (await has('OBS scene switched')), 'a scene switch is audited');

// ── Block: stream-scoped ──
const before = (await peekQueue()).length;
r = await post({ action: 'block', username: 'Ann', mode: 'stream' });
ok(r.ok && (await has('Blocked from pulls')) && (await listPullBlocks()).some(x => x.username === 'ann' && x.streamKey), 'block for this stream is stored and audited');
const pack = await queuePull('ann');
ok(pack.ignored === true && pack.reason === 'blocked' && /switched off/.test(String(pack.message)) && (await peekQueue()).length === before, `!pack is refused with a plain message: ${JSON.stringify(pack)}`);
await mixitup.saveMixItUpSettings(normalizeMixItUp({ enabled: true, balanceUrl: 'https://hook.example/mix', cost: 10, limit: 1, secret: 's' }));
ok((await queuePull('ann')).reason === 'blocked', 'a paid pull is refused before Mix It Up is asked');
await mixitup.saveMixItUpSettings(normalizeMixItUp({}));
r = await post({ action: 'gift', username: 'ann', force: true });
ok(!r.ok && /blocked/.test(r.message) && (await peekQueue()).length === before, 'a gift is refused');
ok((await queuePull('ann', { free: true })).ok === true, 'a free pack the streamer gave still goes through');
ok((await queuePull('bob')).ok === true && !(await queuePull('bob')).reason, 'other viewers are not affected');
ok((await get('what=viewer&q=ann')).blocked === true && ((await get('what=viewer&q=ann')).refusals as unknown[]).length >= 1, 'the look-up shows the block and the refusal');
// the stream ends: the block is gone
await kv.hset('pulls:blocked', { ann: { by: 'josh', at: Date.now(), streamKey: 'an-older-stream' } });
ok((await listPullBlocks()).length === 0 && (await queuePull('ann')).reason !== 'blocked', 'a stream block ends with the stream');

// ── Block until lifted, then lift ──
r = await post({ action: 'block', username: 'ann', mode: 'until-lifted' });
ok(r.ok && (await listPullBlocks()).some(x => x.username === 'ann' && !x.streamKey), 'block until lifted is stored');
ok((await queuePull('ann')).reason === 'blocked', 'it holds');
ok((await post({ action: 'unblock', username: 'zed' })).ok === false, 'lifting a block that is not there says so');
r = await post({ action: 'unblock', username: 'ann' });
ok(r.ok && (await has('Pull block lifted')) && (await queuePull('ann')).reason !== 'blocked', 'lift audited, pulls work again');

// ── Sandbox: nothing runs ──
const inBox = await runInSandbox('staffbox', () => post({ action: 'trading', on: false }));
ok((inBox.status === 403 || inBox.status === 401) &&(await getTradeSettings()).enabled, 'a sandbox refuses staff routes and changes nothing');

// ── Revoking the PC ends it; so does switching off ──
ok((await b.setBridgeStaff(id, false)) === 'Stream PC' && (await post({ action: 'trading', on: false })).status === 403, 'switched off, 403 again');
await b.setBridgeStaff(id, true);
await b.revokeBridge(id);
ok((await post({ action: 'trading', on: false })).status === 401, 'revoked, the token is no good');

console.log('check-bridge-staff: ok');
