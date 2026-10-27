// Clearer two-way messages (ROADMAP 55.3): the pull reply (message, left, balance), requestId replay on pull / grant-card / buff, the
// incoming lines on the Log tab (cap 50), the timeout wording and the one System post after 3 balance failures in a row while live.
// Run against the mock KV (node scripts/mock-kv.cjs): npx tsx scripts/check-two-way.mts
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';

const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const posts: string[] = [];
const server = createServer((req, res) => { let d = ''; req.on('data', c => (d += c)); req.on('end', () => { posts.push(d); res.statusCode = 204; res.end(); }); });
await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
const port = (server.address() as AddressInfo).port;

const { NextRequest } = await import('next/server');
const kvLib = await import('../lib/kv');
const { kv } = await import('../lib/db');
const m = await import('../lib/mixitup');
const c = await import('../lib/mixitup-core');
const d = await import('../lib/discord');
const { getWebhookSettings } = await import('../lib/webhooks');
const { setLiveFromHint } = await import('../lib/twitch-live');
const { filterLog } = await import('../lib/mixitup-page');
const pull = await import('../app/api/webhooks/pull/route');
const grant = await import('../app/api/webhooks/grant-card/route');
const buff = await import('../app/api/webhooks/buff/route');

await kvLib.seedSeason1();
const secret = (await getWebhookSettings()).incomingSecret;
const post = async (mod: { POST: (r: NextRequest) => Promise<Response> }, name: string, body: Record<string, unknown>) => {
  const res = await mod.POST(new NextRequest(`http://localhost/api/webhooks/${name}`, { method: 'POST', body: JSON.stringify({ secret, ...body }) }));
  return { status: res.status, ...(await res.json()) } as Record<string, unknown> & { status: number };
};
const queued = async () => (await kv.llen('webhooks:queue')) as number;

// ── The pull reply: a message, plus paid-pull facts when Mix It Up answered ──
await kv.del('webhooks:queue');
let r = await post(pull, 'pull', { username: 'ann_1' });
ok(r.ok === true && r.message === 'Opening a pack for ann_1' && r.left === undefined && r.balance === undefined, 'a free pull says it is opening and has no left/balance');
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) =>
  String(input).startsWith('https://8.8.8.8/') ? new Response(JSON.stringify({ balance: 750 }), { status: 200 }) : realFetch(input, init)) as typeof fetch;
await m.saveMixItUpSettings(c.normalizeMixItUp({ enabled: true, connection: 'addresses', balanceUrl: 'https://8.8.8.8/mix', cost: 100, limit: 3, secret: 's' }));
r = await post(pull, 'pull', { username: 'bob_1' });
ok(r.ok === true && r.message === 'Opening a pack for bob_1' && r.balance === 750 && r.left === 2, `a paid pull carries balance and left (got ${JSON.stringify(r)})`);
r = await post(pull, 'pull', { username: 'bob_1' });
ok(r.left === 1, 'left counts down');

// ── requestId: a repeat answers the first result and queues nothing ──
const before = await queued();
const a = await post(pull, 'pull', { username: 'cat_1', requestId: 'run-1' });
const b = await post(pull, 'pull', { username: 'cat_1', requestId: 'run-1' });
ok(a.message === 'Opening a pack for cat_1' && JSON.stringify(a) === JSON.stringify(b), 'a repeated requestId answers the first result');
ok((await queued()) === before + 1, 'a repeated requestId queued only one pack');
const used = await post(pull, 'pull', { username: 'cat_1', requestId: 'run-2' });
ok(used.left === 1, 'a new requestId runs again (cat used 2 of 3)');
const [p1, p2] = await Promise.all([post(pull, 'pull', { username: 'dan_1', requestId: 'run-3' }), post(pull, 'pull', { username: 'dan_1', requestId: 'run-3' })]);
ok((await queued()) === before + 3 && (p1.message === p2.message), 'two at once still queue one pack');

const g1 = await post(grant, 'grant-card', { username: 'eve_1', cardNumber: 1, requestId: 'g-1' });
const g2 = await post(grant, 'grant-card', { username: 'eve_1', cardNumber: 1, requestId: 'g-1' });
ok(g1.ok === true && typeof g1.message === 'string' && JSON.stringify(g1) === JSON.stringify(g2), 'grant-card replays the first answer');
const owned = (await kvLib.getCollection((await kvLib.getActiveSeason())!.collectionName))['eve_1'] ?? [];
ok(owned.length === 1, `grant-card granted once (got ${owned.length})`);
const bad = await post(grant, 'grant-card', { username: 'eve_1', cardNumber: 0 });
ok(bad.status === 400 && typeof bad.message === 'string', 'a grant-card error carries a message too');

const s1 = await post(buff, 'buff', { action: 'stream-pulls', amount: 2, requestId: 'b-1' });
await kv.del('streamdeck:cd:stream-pulls:everyone'); // the button cooldown would refuse a real second press anyway; the replay must answer without it
const s2 = await post(buff, 'buff', { action: 'stream-pulls', amount: 2, requestId: 'b-1' });
ok(s1.ok === true && JSON.stringify(s1) === JSON.stringify(s2), 'buff replays the first answer');

// ── The Log tab: incoming lines, newest first, capped at 50, in the Incoming filter ──
const log = await m.getMixItUpLog();
ok(log.some(e => e.what === 'pull' && e.username === 'cat_1' && /repeat/.test(e.detail)), 'a repeat is logged as one');
ok(log.some(e => e.what === 'grant' && e.username === 'eve_1') && log.some(e => e.what === 'buff'), 'grant and buff are logged');
await m.saveMixItUpSettings(c.normalizeMixItUp({ enabled: true, connection: 'addresses', balanceUrl: 'https://8.8.8.8/mix', cost: 100, limit: 1, secret: 's' }));
await kv.del('pulls:stream-buff'); // the buff press above gave everyone extra pulls
await post(pull, 'pull', { username: 'fay_1' });
await post(pull, 'pull', { username: 'fay_1' });
const refused = (await m.getMixItUpLog()).find(e => e.what === 'pull' && !e.ok);
ok(refused && /limit_reached/.test(refused.detail), 'a refused pull is logged with its reason');
ok(filterLog(await m.getMixItUpLog(), 'in').every(e => e.what === 'pull' || e.what === 'grant' || e.what === 'buff') && filterLog(await m.getMixItUpLog(), 'refused').some(e => e.what === 'pull'), 'the Incoming and Refusals filters include them');
for (let i = 0; i < 60; i++) await m.logMixItUp({ username: 'z', what: 'pull', ok: true, detail: String(i) });
ok((await m.getMixItUpLog()).length === 50, 'the log keeps 50');
globalThis.fetch = realFetch;

// ── Timeout wording ──
const slow: typeof fetch = async () => { throw new DOMException('The operation was aborted due to timeout', 'TimeoutError'); };
const t = await m.callMixItUp('https://8.8.8.8/mix', { action: 'balance' }, slow);
ok(!t.ok && t.error === 'Mix It Up did not answer in 5 seconds', `a timeout says so in words (got ${t.error})`);

// ── 3 balance failures in a row while live: one System post ──
await d.saveDiscordSettings({ enabled: true, channels: [{ id: 's', name: 'Sys', url: `http://localhost:${port}/api/webhooks/1/tok`, enabled: true, categories: { pulls: false, cards: false, upgrades: false, trades: false, listings: false, stream: false, resets: false, admin: false, system: true }, minStars: 1, newOnly: false }] });
const sys = c.normalizeMixItUp({ enabled: true, connection: 'addresses', balanceUrl: 'https://8.8.8.8/mix', secret: 's' });
await kv.del('mixitup:balance-fails'); await kv.del('mixitup:balance-fails-posted');
const down: typeof fetch = async () => new Response('{}', { status: 500 });
const up: typeof fetch = async () => new Response('{"balance":5}', { status: 200 });
const settle = () => new Promise(res => setTimeout(res, 400));
await m.fetchBalance(sys, 'a', down); await m.fetchBalance(sys, 'a', down); await m.fetchBalance(sys, 'a', down); await settle();
ok(posts.length === 0, 'not live: three failures post nothing');
process.env.TWITCH_CLIENT_ID = 'x'; process.env.TWITCH_CLIENT_SECRET = 'x'; // so the live status set here is read back
await setLiveFromHint(true); await settle();
posts.length = 0;
await m.fetchBalance(sys, 'a', down); await settle();
ok(posts.length === 1 && /not answering/.test(posts[0]), `the 4th failure while live posts once (got ${posts.length})`);
await m.fetchBalance(sys, 'a', down); await m.fetchBalance(sys, 'a', down); await settle();
ok(posts.length === 1, 'the same streak never posts twice');
await m.fetchBalance(sys, 'a', up);
await m.fetchBalance(sys, 'a', down); await m.fetchBalance(sys, 'a', down); await settle();
ok(posts.length === 1, 'a success starts the count again');
await m.fetchBalance(sys, 'a', down); await settle();
ok(posts.length === 2, 'a new streak posts once more');

server.close();
console.log('two-way checks passed');
process.exit(0);
