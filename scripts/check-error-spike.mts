// Checks the error spike alert (ROADMAP 51.13): the pure rule, the hourly counter and the once-per-hour cron step posting to a local
// fake webhook with the admin log ticked. Needs the mock KV (node scripts/mock-kv.cjs); refuses anything non-local.
// Run: npx tsx scripts/check-error-spike.mts
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const hits: { embeds: { title?: string; description?: string }[] }[] = [];
const server = createServer((req, res) => {
  let data = '';
  req.on('data', d => (data += d));
  req.on('end', () => { hits.push(JSON.parse(data)); res.statusCode = 204; res.end(); });
});
await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
const hook = `http://localhost:${(server.address() as AddressInfo).port}/api/webhooks/1/token`;

const E = await import('../lib/error-spike');
const { hourKey } = await import('../lib/stats');
const { kv } = await import('../lib/db');
const HOUR = 3_600_000;

// ── the rule ──
ok(!E.isSpike(9, 0), 'under the floor is never a spike');
ok(E.isSpike(10, 0), 'the floor itself, on a quiet day');
ok(!E.isSpike(20, 10), '20 against an average of 10 is under 3x');
ok(E.isSpike(30, 10), '3x the average is a spike');

// ── the counter (through the real serverError helper) ──
const now = Date.UTC(2026, 9, 27, 14, 30);
await kv.del('stats:h:errors');
E.recordServerError(now); E.recordServerError(now);
const { serverError } = await import('../lib/trade-api');
const res = serverError(new Error('boom'), 'check', 'Try again.');
ok(res.status === 503, 'serverError still answers 503');
await sleep(200);
const counts = await kv.hgetall<Record<string, number | string>>('stats:h:errors') ?? {};
ok(Number(counts[hourKey(now)]) === 2, `two counted at the fixed hour: ${JSON.stringify(counts)}`);
ok(Object.values(counts).reduce<number>((a, v) => a + Number(v), 0) === 3, 'serverError counted one more (at the real hour)');

// ── the cron step ──
await kv.set('discord:settings', { enabled: true, channels: [
  { id: 'adm', name: 'Admin', url: hook, enabled: true, categories: { admin: true }, minStars: 1, newOnly: false },
  { id: 'pub', name: 'Public', url: hook, enabled: true, categories: { pulls: true }, minStars: 1, newOnly: false },
] });
const seed = async (last: number, usual: number) => {
  await kv.del('stats:h:errors');
  const f: Record<string, number> = { [hourKey(now - HOUR)]: last, [hourKey(now - 50 * HOUR)]: 99 };
  for (let i = 2; i <= 25; i++) f[hourKey(now - i * HOUR)] = usual;
  await kv.hset('stats:h:errors', f);
  await kv.del(`errors:alerted:${hourKey(now - HOUR)}`);
};

await seed(12, 1); // average 1, 12 >= max(10, 3)
const first = await E.errorSpikeOncePerHour(now);
ok(first.status === 'alerted' && first.count === 12 && first.average === 1, `alerted: ${JSON.stringify(first)}`);
await sleep(300);
ok(hits.length === 1, `one message arrived: ${hits.length}`);
const text = hits[0].embeds[0].description ?? '';
ok(hits[0].embeds[0].title?.includes('Error spike') && text.includes('12 server errors') && text.includes('1.0 an hour'), `message: ${JSON.stringify(hits[0])}`);
ok((await E.errorSpikeOncePerHour(now + 60_000)).status === 'already', 'a second run in the same hour is already');
await sleep(200);
ok(hits.length === 1, 'nothing sent twice');
ok(!(await kv.hexists('stats:h:errors', hourKey(now - 50 * HOUR))), 'fields older than 48 hours are pruned');

await seed(12, 5); // average 5, 12 < 15
ok((await E.errorSpikeOncePerHour(now)).status === 'quiet', 'under 3x the average stays quiet');
await seed(9, 0);
ok((await E.errorSpikeOncePerHour(now)).status === 'quiet', 'under the floor stays quiet');
await sleep(200);
ok(hits.length === 1, 'quiet hours send nothing');

// ── no webhook configured: nothing is posted, nothing throws ──
await kv.del('discord:settings');
await seed(50, 0);
const none = await E.errorSpikeOncePerHour(now);
await sleep(200);
ok(none.status === 'alerted' && hits.length === 1, 'without a webhook the step finishes and posts nothing');

server.close();
console.log('error spike checks passed');
