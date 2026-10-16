// The end-of-stream recap: the pure builder (counts, rarest, top puller, new collectors, first ever, trades, the window), the Recap
// category (off for existing channels), and the once-only rule: two instances ending the same stream post one recap, a missed
// transition or a stream with no pulls posts none. Uses a local fake webhook and the mock KV (node scripts/mock-kv.cjs).
// Run: node scripts/run-checks.mjs stream-recap
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const hits: { embeds: { title?: string; fields?: { name: string; value: string }[]; description?: string }[] }[] = [];
const server = createServer((req, res) => {
  let data = '';
  req.on('data', d => (data += d));
  req.on('end', () => { hits.push(JSON.parse(data)); res.statusCode = 204; res.end(); });
});
await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
const hook = `http://localhost:${(server.address() as AddressInfo).port}/api/webhooks/1/token`;

const { buildStreamRecap, recapWorthPosting } = await import('../lib/stream-recap');
const live = await import('../lib/twitch-live');
const d = await import('../lib/discord');
const dc = await import('../lib/discord-config');
const { kv } = await import('../lib/db');
type Ev = Parameters<typeof buildStreamRecap>[0][number];

let seq = 0;
const pull = (username: string, at: number, over: Record<string, unknown> = {}) => ({
  type: 'pull', seq: ++seq, at, username, cardNumber: 1, cardName: 'Cat', stars: 2, packName: 'Base', isNew: false, copies: 2, uniqueOwned: 5, ...over,
}) as unknown as Ev;
const trade = (action: string, at: number) => ({ type: 'trade', action, seq: ++seq, at, username: 'ann', kind: 'direct', give: [], get: [], givePts: 0, getPts: 0 }) as unknown as Ev;
const T0 = 1_000_000_000_000, H = 3_600_000;
const events: Ev[] = [
  pull('early', T0 - H, { stars: 5 }),                                                             // before the stream
  pull('ann', T0 + 1000, { isNew: true, uniqueOwned: 1, cardNumber: 3, serial: 1, stars: 3 }),     // a new collector, first ever
  pull('ann', T0 + 2000, { cardNumber: 4 }),
  pull('bob', T0 + 3000, { stars: 4, variant: 'shiny', cardName: 'Bird', cardNumber: 5, serial: 7, uid: 42 }),
  pull('cy', T0 + 4000, { stars: 4, variant: 'regular', cardNumber: 6 }),
  pull('cy', T0 + 5000, { isNew: true, uniqueOwned: 3, cardNumber: 7 }),                           // new card, not a new collector
  trade('accepted', T0 + 6000),
  trade('offered', T0 + 6500),
  pull('late', T0 + 3 * H, {}),                                                                    // after the stream
];
const r = buildStreamRecap(events, T0, T0 + 2 * H);
// A card granted by webhook (a reward) counts as a pack opened, a puller, a new collector, and can be the rarest.
const wgrant = (username: string, at: number, over: Record<string, unknown> = {}) => ({ type: 'grant', source: 'webhook', seq: ++seq, at, username, cardNumber: 9, ...over }) as unknown as Ev;
const rg = buildStreamRecap([...events, wgrant('dee', T0 + 7000, { stars: 5, cardName: 'Dragon', packName: 'Base', isNew: true, copies: 1, uniqueOwned: 1, serial: 1, variant: 'shiny' }), wgrant('ann', T0 + 8000), { type: 'grant', source: 'admin', seq: ++seq, at: T0 + 9000, username: 'zed', cardNumber: 2 } as unknown as Ev], T0, T0 + 2 * H);
ok(rg.packs === 7 && rg.pullers === 4, 'webhook grants count as packs and pullers; an admin grant does not');
ok(rg.rarest?.cardName === 'Dragon' && rg.rarest.variant === 'shiny', 'a rare webhook grant can be the rarest pull');
ok(rg.newCollectors.includes('dee') && rg.firstEver.some(p => p.username === 'dee'), 'and a first-ever new collector');
ok(rg.topPuller?.username === 'ann' && rg.topPuller.packs === 3, 'and counts towards the top puller (ann: 2 pulls and a grant)');
ok(r.packs === 5 && r.pullers === 3, 'counts only the pulls inside the window');
ok(r.distinctCards === 5, 'counts different cards');
ok(JSON.stringify(r.newCollectors) === '["ann"]', 'a new collector is a first-ever card, not just a new card');
ok(r.firstEver.length === 1 && r.firstEver[0].username === 'ann', 'first-ever pulls are edition 1 pulls');
ok(r.rarest?.username === 'bob' && r.rarest.variant === 'shiny', 'the rarest pull is the best star count, then the best version');
ok(r.rarest?.href === '/c/42', 'the rarest pull links to its print');
ok(r.topPuller?.username === 'ann' && r.topPuller.packs === 2, 'the top puller has the most packs (ties go to the name that sorts first)');
ok(r.tradesCompleted === 1, 'only accepted trades count');
ok(!r.partial, 'a log that reaches back is not partial');
ok(buildStreamRecap(events, T0, T0 + 2 * H, { logIsFull: true }).partial === false, 'a full log that still has older events is complete');
ok(buildStreamRecap(events.filter(e => e.at >= T0), T0 - H / 2, T0 + 2 * H, { logIsFull: true }).partial, 'a full log that starts after the stream did is partial');
ok(!recapWorthPosting(buildStreamRecap(events, T0 + 4 * H, T0 + 5 * H)), 'no pulls means no recap');

// Category: existing channels do not start posting it.
const old = d.normalize({ url: hook, enabled: true, categories: { pulls: true } } as never).channels[0];
ok(old.categories.recap === false, 'an existing channel has Recap off');
ok(dc.DISCORD_CATEGORIES.some(c => c.key === 'recap') && dc.presetChannel('recap').categories.recap, 'the Recap category and preset exist');
const msg = d.buildRecapMessage(r);
const fields = Object.fromEntries((msg.embeds[0].fields ?? []).map(f => [f.name, f.value]));
ok(fields['Packs opened'] === '5' && fields['Rarest pull'].includes('/c/42') && fields['Top puller'].includes('ann'), 'the embed carries the numbers, the print link and the top puller');
ok(JSON.stringify(msg.allowed_mentions) === '{"parse":[]}', 'the recap pings nobody');

// Once only.
const reset = async () => { hits.length = 0; for (const k of ['twitch:live:since', 'twitch:recap:lock', 'stream:recap:latest', 'activity:log', 'activity:seq']) await kv.del(k); };
const recapChannel = { id: 'r', name: 'Recap', url: hook, enabled: true, categories: { ...dc.DEFAULT_CATEGORIES, pulls: false, cards: false, upgrades: false, trades: false, resets: false, recap: true }, minStars: 1, newOnly: false };
await kv.set('discord:settings', { enabled: true, channels: [recapChannel] });
const { recordActivity } = await import('../lib/activity');

await reset();
await kv.set('twitch:live:since', Date.now() - H);
await recordActivity({ type: 'pull', username: 'ann', cardNumber: 1, cardName: 'Cat', stars: 3, packName: 'Base', isNew: true, copies: 1, uniqueOwned: 1 });
await sleep(200);
ok(hits.length === 0, 'a Recap-only channel does not receive the pull itself');
const [a, b] = await Promise.all([live.finishStream(), live.finishStream()]);
await sleep(300);
ok(!!(a ?? b) && !(a && b), 'two instances ending the same stream: exactly one builds the recap');
ok(hits.length === 1 && hits[0].embeds[0].title?.includes('Stream recap'), 'exactly one recap reaches Discord');
ok((await live.getLatestRecap())?.packs === 1, 'the latest recap is stored for the dashboard');
await kv.del('twitch:recap:lock');
await live.finishStream(); await sleep(200);
ok(hits.length === 1, 'the same stream is never recapped twice, even once the lock has expired');

await reset();
await live.finishStream(); await sleep(200);
ok(hits.length === 0, 'no start marker (the transition was missed) posts nothing');

await reset();
await kv.set('twitch:live:since', Date.now() - H);
await live.finishStream(); await sleep(200);
ok(hits.length === 0 && !(await live.getLatestRecap()), 'a stream with no pulls posts nothing');

server.close();
console.log('stream recap ok');
process.exit(0);
