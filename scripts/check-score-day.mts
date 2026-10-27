// Checks the daily score snapshots behind the home page's Rising this week. Pure. Run: npx tsx scripts/check-score-day.mts
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const eq = (a: unknown, b: unknown, msg: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
process.env.KV_REST_API_URL ??= 'http://localhost:4111'; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
const s = await import('../lib/score-day');

const now = Date.parse('2026-10-27T12:00:00Z');
eq(s.scoresOf([{ username: 'a', score: 10.6 }, { username: 'b', score: 3 }]), { a: 11, b: 3 }, 'scores are rounded per player');

eq(s.daysToPrune(['2026-10-18', '2026-10-19', '2026-10-27'], now), ['2026-10-18'], 'older than 8 days go, the 8th day stays');

const rows = [{ username: 'a', score: 500 }, { username: 'b', score: 300 }, { username: 'c', score: 120 }, { username: 'new', score: 40 }, { username: 'flat', score: 70 }];
const none = s.risingGains(rows, {}, now);
eq([none.since, none.gains], [null, []], 'no snapshot: nothing to compare');

const days = { '2026-10-20': { a: 480, b: 100, c: 120, flat: 70 }, '2026-10-24': { a: 490, b: 290, c: 100 }, '2026-10-19': { a: 0, b: 0 } };
const r = s.risingGains(rows, days, now);
eq(r.since, '2026-10-20', 'the oldest snapshot at most 7 days old is the baseline (the 8-day-old one is ignored)');
eq(r.partial, false, 'a 7-day-old baseline is a full week');
eq(r.gains.map(g => [g.username, g.gain]), [['b', 200], ['a', 20], ['new', 40]].sort((x, y) => (y[1] as number) - (x[1] as number)), 'biggest gains first; a missing player counts from 0; no gain or loss is left out');

const young = s.risingGains(rows, { '2026-10-25': { a: 500 } }, now);
eq([young.since, young.partial], ['2026-10-25', true], 'a young baseline is flagged partial');
eq(s.risingGains([{ username: 'a', score: 5 }], { '2026-10-25': { a: 9 } }, now).gains, [], 'a drop is not a gain');
eq(s.risingGains(Array.from({ length: 9 }, (_, i) => ({ username: 'u' + i, score: 10 + i })), { '2026-10-26': {} }, now).gains.length, 5, 'at most five');

// KV: write, prune, delete a user (mock KV).
const season = { id: 's1', collectionName: 'scoreday_check' } as never;
const old = new Date(now - 9 * 86_400_000).toISOString().slice(0, 10);
const { kv } = await import('../lib/db');
await kv.del(s.scoreDayKey('scoreday_check'));
await kv.hset(s.scoreDayKey('scoreday_check'), { [old]: { a: 1 } });
eq(await s.writeScoreDay(season, rows, now), 1, 'the 9-day-old field was pruned');
const stored = await s.readScoreDays(season);
eq(Object.keys(stored), ['2026-10-27'], 'only today remains');
eq(stored['2026-10-27'].a, 500, 'the board was stored');
await s.removeUserFromScoreDays('scoreday_check', 'A');
eq((await s.readScoreDays(season))['2026-10-27'].a, undefined, 'a deleted viewer is taken out of the days');
await kv.del(s.scoreDayKey('scoreday_check'));
console.log('score-day checks passed');
