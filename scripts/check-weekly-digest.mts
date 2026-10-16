// Checks the weekly digest (ROADMAP 6.3): the pure builder (counters, top 3, first-run movers, hidden collectors, the "at least" rule,
// the skip rule), the Weekly digest category (off for existing channels) and the once-a-week cron step with a local fake webhook.
// Needs the mock KV (node scripts/mock-kv.cjs); refuses anything non-local.  Run: npx tsx scripts/check-weekly-digest.mts
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const eq = (a: unknown, b: unknown, msg: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);

const hits: { embeds: { title?: string; description?: string; fields?: { name: string; value: string }[] }[] }[] = [];
const server = createServer((req, res) => {
  let data = '';
  req.on('data', d => (data += d));
  req.on('end', () => { hits.push(JSON.parse(data)); res.statusCode = 204; res.end(); });
});
await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
const hook = `http://localhost:${(server.address() as AddressInfo).port}/api/webhooks/1/token`;

const W = await import('../lib/weekly-digest');
const dc = await import('../lib/discord-config');
const d = await import('../lib/discord');
const H = 3_600_000, DAY = 24 * H;
const now = Date.UTC(2026, 9, 18, 20);                  // a Sunday evening
const hk = (t: number) => { const x = new Date(t); const p = (n: number) => String(n).padStart(2, '0'); return `${x.getUTCFullYear()}${p(x.getUTCMonth() + 1)}${p(x.getUTCDate())}${p(x.getUTCHours())}`; };

// ── pure builder ──
const board = [{ username: 'ann', score: 900 }, { username: 'bob', score: 800 }, { username: 'cat', score: 700 }, { username: 'dan', score: 600 }];
const input = (over: Partial<import('../lib/weekly-digest').DigestInput> = {}): import('../lib/weekly-digest').DigestInput => ({
  now, weekKey: '2026-W42', seasonId: 's1', seasonName: 'Season 1',
  hours: {
    [`${hk(now - 2 * DAY)}|pull`]: 10, [`${hk(now - 3 * DAY)}|pull`]: 5, [`${hk(now - 8 * DAY)}|pull`]: 99, // the last is a week too old
    [`${hk(now - DAY)}|newViewer`]: 2, [`${hk(now - DAY)}|upgrade`]: 1, [`${hk(now - DAY)}|trade`]: 3, [`${hk(now - DAY)}|p:Base`]: 7,
  },
  board, prevRanks: null,
  trades: [], historyCap: 400, watchers: {}, cardNames: { 1: 'Cat', 2: 'Dog', 3: 'Fish' }, print: null, ...over,
});
{
  const g = W.buildWeeklyDigest(input());
  eq([g.pulls, g.newCollectors, g.upgrades, g.trades], [15, 2, 1, 3], 'counters cover the last 7 days only and ignore per-pack fields');
  eq(g.top.map(t => [t.username, t.rank, t.points]), [['ann', 1, 900], ['bob', 2, 800], ['cat', 3, 700]], 'the top 3');
  ok(g.movers === null, 'the first run has no movers');
  ok(W.digestWorthPosting(g), 'a week with pulls is worth posting');
}
{
  const prev = { ann: [1, 880], bob: [4, 300], cat: [2, 690], dan: [3, 600], gone: [5, 10] } as import('../lib/weekly-digest').RankSnapshot;
  const g = W.buildWeeklyDigest(input({ prevRanks: prev }));
  eq(g.movers?.map(m => [m.username, m.climbed, m.gained]), [['bob', 2, 500], ['ann', 0, 20], ['cat', -1, 10]], 'biggest climb first, then points gained, unchanged collectors left out');
}
{
  const prev = { ann: [1, 900], bob: [2, 800], cat: [3, 700], dan: [4, 600] } as import('../lib/weekly-digest').RankSnapshot;
  eq(W.buildWeeklyDigest(input({ prevRanks: prev })).movers, [], 'nobody moved: an empty list, not "first run"');
}
{
  // Hidden or private collectors never reach `board`, so the snapshot built from it leaves them out as well.
  const snap = W.snapshotRanks(board);
  eq(snap.bob, [2, 800], 'the snapshot keeps rank and points');
  ok(!('hid' in snap), 'a collector left off the board is not in the snapshot');
}
{
  const done = (cardNumber: number, count: number, at: number) => ({ status: 'accepted', createdAt: at - H, resolvedAt: at, give: [{ cardNumber, count }], get: [{ cardNumber: 2, count: 1 }] });
  const trades = [done(1, 2, now - DAY), done(3, 1, now - 2 * DAY), done(1, 1, now - 9 * DAY), { ...done(3, 5, now - DAY), status: 'declined' }];
  const g = W.buildWeeklyDigest(input({ trades }));
  eq(g.mostTraded.map(c => [c.name, c.count]), [['Cat', 2], ['Dog', 2], ['Fish', 1]], 'most traded counts both sides of accepted trades from this week');
  ok(!g.tradedAtLeast, 'a short history that is not at its cap is complete');
  const full = Array.from({ length: 400 }, (_, i) => done(1, 1, now - 20 * 60_000 * (i + 1)));
  ok(W.buildWeeklyDigest(input({ trades: full })).tradedAtLeast, 'a full history that stops inside the week says "at least"');
  const old = [...full.slice(0, 399), done(1, 1, now - 9 * DAY)];
  ok(!W.buildWeeklyDigest(input({ trades: old })).tradedAtLeast, 'a full history that reaches back past the week is complete');
}
{
  const g = W.buildWeeklyDigest(input({ watchers: { 1: 2, 3: 5, 2: 5 } }));
  eq(g.mostWanted, { cardNumber: 2, name: 'Dog', watchers: 5 }, 'most wanted: highest count, lowest number on a tie');
  eq(W.buildWeeklyDigest(input()).mostWanted, null, 'nobody wants anything');
}
{
  const quiet = W.buildWeeklyDigest(input({ hours: { [`${hk(now - 8 * DAY)}|pull`]: 4 } }));
  ok(!W.digestWorthPosting(quiet), 'no pulls and no trades this week: skip');
  ok(W.digestWorthPosting(W.buildWeeklyDigest(input({ hours: { [`${hk(now - DAY)}|trade`]: 1 } }))), 'trades alone are enough');
}
// ── the Discord message and category ──
{
  const msg = d.buildDigestMessage(W.sampleDigest(now), { footer: 'Test digest' });
  const names = msg.embeds[0].fields?.map(f => f.name) ?? [];
  for (const n of ['Packs opened', 'Top 3 right now', 'Movers', 'Print of the week', 'Leaderboard']) ok(names.includes(n), `the embed has ${n}`);
  ok(!/—/.test(JSON.stringify(msg)), 'no em dash');
  const first = d.buildDigestMessage({ ...W.sampleDigest(now), movers: null });
  ok(first.embeds[0].fields?.some(f => f.value === 'Movers start next week.'), 'the first run says movers start next week');
  ok(dc.DEFAULT_CATEGORIES.digest === false, 'digest is off by default');
  ok(dc.presetChannel('digest').categories.digest === true && dc.presetChannel('digest').categories.pulls === false, 'the Weekly digest preset ticks only digest');
}

// ── the weekly step, mock KV ──
const { kv } = await import('../lib/db');
const kvLib = await import('../lib/kv');
const ser = await import('../lib/serials');
const stats = await import('../lib/stats');
const store = await import('../lib/weekly-digest-store');
const sbx = await import('../lib/sandbox');
const db = await import('../lib/db');
const { encodeEntry } = await import('../lib/variants');
const E = (n: number, v: 'regular' | 'reverse' | 'full' | 'shiny' = 'regular') => encodeEntry(n, v);

await kvLib.seedSeason1();
const season = (await kvLib.getActiveSeason())!;
const c = season.collectionName;
await kvLib.saveCollection(c, { alice: [E(1), E(2), E(3, 'shiny')], bob: [E(1)], carol: [E(4)], hid: [E(1), E(2), E(3), E(4), E(5), E(6)] });
await ser.backfillSerials(c, await kvLib.getCollection(c));
await kv.sadd('users:hidden:self', 'hid');
await kv.set('discord:settings', {
  enabled: true,
  channels: [
    { id: 'dig', name: 'Digest', url: hook, enabled: true, categories: { ...dc.presetChannel('digest').categories }, minStars: 1, newOnly: false },
    { id: 'old', name: 'Existing', url: hook, enabled: true, categories: { pulls: true, cards: true }, minStars: 1, newOnly: false },
  ],
});
eq((await d.getDiscordSettings()).channels.find(x => x.id === 'old')?.categories.digest, false, 'an existing channel has the digest off');

// A quiet week first: nothing is posted, but the ranks are kept.
const start = Date.now() - 14 * DAY;
{
  const out = await store.digestOncePerWeek(start);
  eq(out.status, 'skipped', 'an off-season week is skipped');
  eq(hits.length, 0, 'and nothing is posted');
  ok(!!(await kv.get(`digest:ranks:${season.id}`)), 'the ranks are saved even on a skipped week');
  ok((await store.getLatestDigest()) === null, 'no latest digest after a skipped week');
  eq((await store.digestOncePerWeek(start)).status, 'already', 'a skipped week is still locked');
}
// Week two: some activity, a trade, a wanted card.
const w2 = start + 7 * DAY;
for (const [u, at] of [['alice', w2 - 2 * DAY], ['bob', w2 - DAY], ['bob', w2 - DAY]] as const) await stats.recordStats({ type: 'pull', username: u, collectionName: c, isNew: true, copies: 1, uniqueOwned: 1, packName: 'Base' }, at);
await stats.recordStats({ type: 'trade', action: 'accepted', username: 'alice', collectionName: c }, w2 - DAY);
await kv.set('trades:history', [{ id: 't1', seasonId: season.id, kind: 'direct', from: 'alice', to: 'bob', give: [{ cardNumber: 1, variant: 'regular', count: 1 }], get: [{ cardNumber: 2, variant: 'regular', count: 1 }], escrowed: false, status: 'accepted', createdAt: w2 - DAY - H, expiresAt: w2, resolvedAt: w2 - DAY }]);
await kv.sadd('watch:idx:3', 'alice', 'bob');
// Make bob climb: give him a shiny.
await kvLib.saveCollection(c, { ...(await kvLib.getCollection(c)), bob: [E(1), E(5, 'shiny'), E(6, 'shiny')] });
{
  const out = await store.digestOncePerWeek(w2);
  eq(out.status, 'posted', 'a week with pulls is posted');
  eq(hits.length, 1, 'exactly one message reaches the channel with the digest ticked');
  const f = hits[0].embeds[0].fields ?? [];
  const field = (n: string) => f.find(x => x.name === n)?.value ?? '';
  eq(field('Packs opened'), '3', 'pulls from the counters');
  eq(field('Trades completed'), '1', 'trades from the counters');
  ok(!/hid/.test(JSON.stringify(hits[0])), 'a private collector never appears');
  ok(/Movers/.test(f.map(x => x.name).join()) && field('Movers') !== 'Movers start next week.', 'week two has movers');
  ok(/bob/.test(field('Movers')), `bob climbed: ${field('Movers')}`);
  ok(/×/.test(field('Most traded cards')), 'the traded cards are listed: ' + JSON.stringify(f));
  ok(/\(at least\)/.test(f.map(x => x.name).join()) === false, 'a short history is not "at least"');
  ok(field('Most wanted card') !== '', 'the most wanted card is shown');
  eq((await store.getLatestDigest())?.weekKey, (await import('../lib/print-of-week')).isoWeekKey(w2), 'the latest digest is kept for the dashboard');
  eq((await store.digestOncePerWeek(w2)).status, 'already', 'the second call the same week does nothing');
  eq(hits.length, 1, 'and posts nothing');
}
// The cron route: closed without the secret, nothing outside production, nothing in a sandbox, one digest per week.
const route = await import('../app/api/cron/weekly/route');
const { NextRequest } = await import('next/server');
const call = (secret?: string) => route.GET(new NextRequest('http://localhost/api/cron/weekly', { headers: secret ? { authorization: `Bearer ${secret}` } : {} }));
const SECRET = 'a-long-enough-secret-123';
process.env.CRON_SECRET = SECRET;
ok((await call()).status === 401, 'no secret: refused');
{
  const body = await (await call(SECRET)).json();
  ok(body.skipped, 'outside production it does nothing');
}
process.env.VERCEL_ENV = 'production';
{
  const before = hits.length;
  await stats.recordStats({ type: 'pull', username: 'carol', collectionName: c, isNew: true, copies: 1, uniqueOwned: 1, packName: 'Base' }, Date.now() - H);
  const one = await (await call(SECRET)).json();
  eq(one.steps.digest.status, 'posted', 'the route posts this week\'s digest');
  const two = await (await call(SECRET)).json();
  eq(two.steps.digest.status, 'already', 'the second call posts nothing');
  eq(hits.length, before + 1, 'exactly one digest from two calls');
  const box = await sbx.createSandbox({ name: 'Digest check', source: 'config' });
  await db.runInSandbox(box.id, async () => { ok((await (await call(SECRET)).json()).skipped, 'inside a sandbox it does nothing'); });
  eq(hits.length, before + 1, 'and nothing was sent from it');
}
// Webhook grants feed the same counters as pulls (the digest's pulls and new collectors), admin grants do not.
{
  const stats = await import('../lib/stats');
  const coll = 'GrantCountCheck';
  const at = Date.now();
  await stats.recordStats({ type: 'grant', source: 'webhook', username: 'wg', collectionName: coll, isNew: true, copies: 1, uniqueOwned: 1, variant: 'shiny', packName: 'Base' }, at);
  await stats.recordStats({ type: 'grant', source: 'admin', username: 'wg2', collectionName: coll }, at);
  await stats.recordStats({ type: 'pull', username: 'wg3', collectionName: coll, isNew: false, copies: 2, uniqueOwned: 4, packName: 'Base' }, at);
  const series = await stats.getSeries(coll, [at - (at % 3_600_000)], 'hour');
  eq(series.data.pull[0], 2, 'a webhook grant counts as a pull in the stats (with a real pull: 2), an admin grant does not');
  eq(series.data.newViewer[0], 1, 'a first card by webhook counts as a new viewer');
  eq(series.data['v:shiny'][0], 1, 'and its version is counted');
  eq(series.data.grant[0], 1, 'an admin grant is still counted as a grant');
}
server.close();
console.log('weekly digest checks passed');
