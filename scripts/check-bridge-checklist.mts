// TCG Bridge's pre-stream checklist (ROADMAP 57.1): the facts endpoint needs a paired token and changes nothing, the app's result is stored
// cleaned and read back, a wrong shape is refused, and "ran N minutes ago" reads right. Against the mock KV. Run: npx tsx scripts/check-bridge-checklist.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

import { createRequire } from 'node:module';
(createRequire(import.meta.url)('next/cache') as { revalidatePath: () => void }).revalidatePath = () => {};

const kvLib = await import('../lib/kv');
const b = await import('../lib/bridge');
const { setPullsPaused } = await import('../lib/pull-pause');
const { startHappyHour } = await import('../lib/happyhour');
const { kv } = await import('../lib/db');
const { cleanChecklist, ranAgo } = await import('../lib/bridge-checklist-core');
const { readChecklist } = await import('../lib/bridge-checklist');
const factsRoute = await import('../app/api/bridge/checklist/route');
const reportRoute = await import('../app/api/bridge/report/route');

await kvLib.seedSeason1();
const token = (await b.pairBridge((await b.createPairCode('josh')).code, 'Stream PC'))!.token;
const get = (tok: string | null) => factsRoute.GET(new Request('http://localhost/api/bridge/checklist', { headers: tok ? { authorization: `Bearer ${tok}` } : {} }));
const report = async (body: unknown, tok: string | null = token) => reportRoute.POST(new Request('http://localhost/api/bridge/report', { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}) }, body: JSON.stringify(body) }));

// ── Facts: token needed, read only ──
ok((await get(null)).status === 401 && (await get('nope')).status === 401, 'the facts route needs a paired token');
let f = await (await get(token)).json();
ok(f.season?.name && f.openablePacks > 0 && f.queueLength === 0 && f.paused === false && f.happyHour === null, `a seeded site: ${JSON.stringify(f)}`);
await setPullsPaused(true);
await startHappyHour({ minutes: 30, kind: 'free' }, 'josh');
await kv.rpush('webhooks:queue', { id: 'a' });
f = await (await get(token)).json();
ok(f.queueLength === 1, 'the queue is counted');
ok(f.paused === true && f.happyHour?.what === 'free packs' && f.happyHour.endsAt > Date.now(), 'pause and happy hour are shown');
const again = await (await get(token)).json();
ok(JSON.stringify(again) === JSON.stringify(f), 'reading twice changes nothing');

// ── The app's result: stored cleaned, read back ──
ok((await readChecklist()) === null, 'nothing stored before the first run');
ok((await report({ type: 'checklist', lines: [] })).status === 400 && (await report({ type: 'checklist' })).status === 400, 'no lines is refused');
ok((await report({ type: 'checklist', lines: [{ label: 'Site', tone: 'purple', text: 'x' }] })).status === 400, 'an unknown tone is refused');
ok((await report({ type: 'checklist', lines: [{ label: 'Site', tone: 'ok', text: 'x' }] }, null)).status === 401, 'the report needs a token');
const lines = [{ label: 'Site', tone: 'ok', text: 'Paired and the site answers.' }, { label: 'OBS', tone: 'muted', text: 'Not used.' }, { label: 'Pulls', tone: 'bad', text: 'x'.repeat(500), extra: 'dropped' }];
ok((await report({ type: 'checklist', lines })).status === 200, 'a result is accepted');
const got = await readChecklist();
ok(got && got.ready === false && got.lines.length === 3 && got.lines[2].text.length === 300 && !('extra' in got.lines[2]) && Math.abs(got.at - Date.now()) < 5000, 'stored cleaned, with the site clock, red means not ready');
ok(cleanChecklist({ lines: lines.slice(0, 2) }, 1)?.ready === true, 'no red line is ready');
ok(cleanChecklist({ lines: Array.from({ length: 30 }, () => lines[0]) }, 1)?.lines.length === 12, 'at most 12 lines');

// ── "ran N minutes ago" ──
const T = 10_000_000;
ok(ranAgo(T, T + 20_000) === 'ran just now' && ranAgo(T, T + 60_000) === 'ran 1 minute ago' && ranAgo(T, T + 5 * 60_000) === 'ran 5 minutes ago' && ranAgo(T, T + 3 * 3_600_000) === 'ran 3 hours ago' && ranAgo(T, T + 72 * 3_600_000) === 'ran 3 days ago', 'ago wording');

console.log('bridge checklist checks passed');
