// Live stats for TCG Bridge's OBS text sources (ROADMAP 57.4): the `stats` action answers only what was asked, counts the stream's packs,
// names the last big pull and the top puller, never counts a test pull, and reads the queue length. Against the mock KV.
// Run: node scripts/run-checks.mjs bridge-stats
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const b = await import('../lib/bridge');
const { recordActivity } = await import('../lib/activity');
const { enqueueEvent } = await import('../lib/webhooks');
const { streamStart, cleanWanted, statsFromEvents, lastPull, BIG_PULL_STARS } = await import('../lib/bridge-stats');
const actionRoute = await import('../app/api/bridge/action/route');

// ── The window and the list of stats asked for ──
ok(streamStart('s1700000000000') === 1_700_000_000_000, 'a stream key is its start');
ok(streamStart('d2026-10-28') === Date.UTC(2026, 9, 28), 'a day key is the UTC midnight');
ok(streamStart('x') === 0, 'a key it cannot read is the beginning of time');
ok(cleanWanted(['queue', 'nope', 'packs', 'queue']).join() === 'packs,queue', 'only known stats, once each, in a fixed order');
ok(cleanWanted(undefined).length === 0 && cleanWanted('packs').length === 0, 'anything but a list asks for nothing');

// ── The pure part: newest first, a pull before the window is not counted, a 3 star pull is not big ──
const T = 1_000_000_000_000;
const ev = (seq: number, username: string, at: number, stars: number, cardName = 'Cat') => ({ type: 'pull', seq, at, username, cardNumber: seq, cardName, stars, packName: 'Base', isNew: false, copies: 1, uniqueOwned: 1 }) as never;
const s = statsFromEvents([ev(5, 'bob', T + 5000, 3), ev(4, 'ann', T + 4000, BIG_PULL_STARS, 'Bird'), ev(3, 'bob', T + 3000, 5, 'Fish'), ev(2, 'bob', T + 2000, 1), ev(1, 'old', T - 5000, 5, 'Early')], T, T + 10_000);
ok(s.packs === 4, `four packs in the window: ${s.packs}`);
ok(s.lastBig?.username === 'ann' && s.lastBig.cardName === 'Bird', `the last big pull is the newest at the star limit: ${JSON.stringify(s.lastBig)}`);
ok(s.topPuller?.username === 'bob' && s.topPuller.packs === 3, `bob pulled most: ${JSON.stringify(s.topPuller)}`);
const none = statsFromEvents([ev(1, 'old', T - 5000, 5)], T, T + 10_000);
ok(none.packs === 0 && none.lastBig === null && none.topPuller === null, 'a quiet stream has no big pull or top puller');
// Show last pull keys: the newest pull in the window, or the newest big one; a test pull never counts.
const evs = [{ ...(ev(6, 'tess', T + 6000, 5) as object), test: true } as never, ev(5, 'bob', T + 5000, 3), ev(4, 'ann', T + 4000, BIG_PULL_STARS, 'Bird')];
ok(lastPull(evs, T, false, T + 10_000)?.username === 'bob', 'the last pull is the newest real one');
ok(lastPull(evs, T, true, T + 10_000)?.cardName === 'Bird', 'the last big pull skips a 3 star pull');
ok(lastPull([ev(1, 'old', T - 5000, 5)], T, false, T + 10_000) === null, 'nothing this stream: null');

// ── The action ──
const token = (await b.pairBridge((await b.createPairCode('josh')).code, 'Stream PC'))!.token;
const act = async (body: Record<string, unknown>, tok: string | null = token) => {
  const res = await actionRoute.POST(new Request('http://localhost/api/bridge/action', { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}) }, body: JSON.stringify(body) }));
  return { status: res.status, ...(await res.json()) } as { status: number; ok: boolean; stats?: Record<string, unknown>; happyHour?: unknown };
};
ok((await act({ action: 'stats', stats: ['queue'] }, null)).status === 401, 'no token, no stats');

let r = await act({ action: 'stats', stats: ['packs', 'lastBig', 'topPuller', 'queue'] });
ok(r.ok && r.stats?.packs === 0 && r.stats.lastBig === null && r.stats.topPuller === null && r.stats.queue === 0 && r.happyHour === null, `an empty stream: ${JSON.stringify(r)}`);

const pull = (username: string, stars: number, cardName: string, test?: true) => recordActivity({ type: 'pull', username, cardNumber: 1, cardName, stars, packName: 'Base', isNew: false, copies: 1, uniqueOwned: 1, ...(test ? { test } : {}) });
await pull('ann', 2, 'Cat');
await pull('ann', 4, 'Bird');
await pull('bob', 2, 'Cat');
await pull('zed', 5, 'Dragon', true); // a test pull is not part of the stream
await enqueueEvent({ id: 'q1', type: 'show-off', username: 'cat', queuedAt: Date.now() } as never);
r = await act({ action: 'stats', stats: ['packs', 'lastBig', 'topPuller', 'queue'] });
ok(r.stats?.packs === 3, `three real packs: ${JSON.stringify(r.stats)}`);
ok(JSON.stringify(r.stats?.lastBig) === JSON.stringify({ username: 'ann', cardName: 'Bird' }), `the test pull is not the last big pull: ${JSON.stringify(r.stats?.lastBig)}`);
ok(JSON.stringify(r.stats?.topPuller) === JSON.stringify({ username: 'ann', packs: 2 }), `ann is top: ${JSON.stringify(r.stats?.topPuller)}`);
ok(r.stats?.queue === 1, 'the queue length');

r = await act({ action: 'stats', stats: ['queue'] });
ok(Object.keys(r.stats ?? {}).join() === 'queue', `only what was asked: ${JSON.stringify(r.stats)}`);
r = await act({ action: 'stats' });
ok(r.ok && Object.keys(r.stats ?? {}).length === 0, 'asking for nothing answers nothing');
console.log('bridge stats ok');
