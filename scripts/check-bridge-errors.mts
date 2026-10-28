// TCG Bridge error reports (ROADMAP 57.9): a report is cleaned, the list keeps 50, the per-day count rises, the 24 hour count reads right, and a burst
// of 10 posts to Discord exactly once (a fake sender) while single errors never do. Against the mock KV. Run: npx tsx scripts/check-bridge-errors.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

import { createRequire } from 'node:module';
(createRequire(import.meta.url)('next/cache') as { revalidatePath: () => void }).revalidatePath = () => {};

const b = await import('../lib/bridge');
const { kv } = await import('../lib/db');
const { cleanError, errorsInLast24h } = await import('../lib/bridge-errors-core');
const { storeError, readErrors, errorsLast24h, errorDays } = await import('../lib/bridge-errors');
const reportRoute = await import('../app/api/bridge/report/route');

const posts: { title: string; text?: string }[] = [];
const fake = async (o: { title: string; text?: string }) => { posts.push(o); };

// ── Cleaning ──
ok(cleanError({ part: 'nope', message: 'x' }, 'PC', 1) === null, 'a part off the list is refused');
ok(cleanError({ part: 'job', message: '   ' }, 'PC', 1) === null && cleanError({ part: 'job' }, 'PC', 1) === null && cleanError(null, 'PC', 1) === null, 'no message is refused');
const c = cleanError({ part: 'obs', message: `a\n\n  b${'x'.repeat(500)}`, version: '0.21.0', commit: 'ABCDEF1234', extra: 'dropped' }, 'Stream PC', 5);
ok(c && c.message.length === 300 && !/\s{2}|\n/.test(c.message) && c.version === '0.21.0' && c.commit === 'abcdef1' && !('extra' in c) && c.at === 5, 'cleaned: one line, 300 chars, version, short commit, site clock');
const bad = cleanError({ part: 'job', message: 'm', version: '<script>', commit: 'zzz' }, 'PC', 1);
ok(bad && bad.version === '' && bad.commit === '', 'a wrong version or commit is blanked');

// ── Through the route: needs a token, stores, refuses a wrong shape ──
const token = (await b.pairBridge((await b.createPairCode('josh')).code, 'Stream PC'))!.token;
const send = (body: unknown, tok: string | null = token) => reportRoute.POST(new Request('http://localhost/api/bridge/report', { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}) }, body: JSON.stringify(body) }));
ok((await send({ type: 'error', part: 'job', message: 'x' }, null)).status === 401, 'the report needs a token');
ok((await send({ type: 'error', part: 'bogus', message: 'x' })).status === 400, 'a bad part is a 400');
ok((await send({ type: 'error', part: 'job', message: 'balance failed', version: '0.21.0', commit: 'abc1234' })).status === 200, 'a report is accepted');
let list = await readErrors();
ok(list.length === 1 && list[0].pc === 'Stream PC' && list[0].part === 'job' && list[0].commit === 'abc1234', 'stored with the PC name');
ok(await errorsLast24h() === 1, 'one in the last 24 hours');
ok((await errorDays(2))[0].count === 1, 'today counts one');
ok(posts.length === 0, 'the route sent nothing to Discord for a single error');

// ── Single errors never post; the list keeps 50; the 24 hour count ignores old ones ──
const T = Date.now();
for (let i = 0; i < 8; i++) await storeError({ part: 'obs', message: `e${i}` }, 'PC', T + i, fake); // 9 in the window so far (1 from the route)
ok(posts.length === 0, '9 errors in 10 minutes post nothing');

// ── The burst: the 10th posts, the 11th to 15th do not ──
for (let i = 8; i < 14; i++) await storeError({ part: 'reconnect', message: `e${i}` }, 'PC', T + i, fake);
ok(posts.length === 1, `exactly one post for the burst, got ${posts.length}`);
ok(/10 errors/.test(posts[0].text ?? '') && /System|Bridge/.test(posts[0].title), 'the post says how many');

// ── Concurrent callers past the threshold still post once (after the flag and window are cleared, a second burst) ──
await kv.del('bridge:errors:window'); await kv.del('bridge:errors:posted');
await Promise.all(Array.from({ length: 12 }, (_, i) => storeError({ part: 'mixitup', message: `p${i}` }, 'PC', T + 100 + i, fake)));
ok(posts.length === 2, `twelve at once post once more, got ${posts.length}`);

// ── 50 kept, newest first ──
for (let i = 0; i < 60; i++) await storeError({ part: 'job', message: `n${i}` }, 'PC', T + 1000 + i, fake);
list = await readErrors();
ok(list.length === 50 && list[0].message === 'n59' && list[49].message === 'n10', `50 kept, newest first (${list.length}, ${list[0]?.message})`);
const days = await errorDays(3, T);
ok(days[0].count === 1 + 8 + 6 + 12 + 60 && days[1].count === 0, `the day counter counts every report: ${days[0].count}`);
ok((await kv.ttl('bridge:errors:day:' + new Date(T).toISOString().slice(0, 10))) > 7 * 86_400, 'the day counter lives about 8 days');

// ── 24 hours ──
const old = { ...list[0], at: T - 25 * 3_600_000 };
ok(errorsInLast24h([old], T) === 0 && errorsInLast24h([old, list[1]], T + 1100) === 1, 'a report older than 24 hours is not counted');

console.log('bridge errors checks passed');
