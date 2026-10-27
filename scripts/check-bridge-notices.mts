// TCG Bridge staff notices and shortcuts (ROADMAP 55.13): a notice reaches only a PC whose staff switch is on (and nothing is queued when none is),
// a stale notice is dropped, paid pull refusals notify at most once a minute per reason (and never "not enough Brie Bucks"), a build notifies once,
// and Back up now / Activity / Quick search are 403 without the switch, audited with it, and never run in a sandbox. Against the mock KV.
// Run: npx tsx scripts/check-bridge-notices.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

import { createRequire } from 'node:module';
(createRequire(import.meta.url)('next/cache') as { revalidatePath: () => void }).revalidatePath = () => {};

const kvLib = await import('../lib/kv');
const { kv, runInSandbox } = await import('../lib/db');
const b = await import('../lib/bridge');
const { hashToken } = await import('../lib/bridge-core');
const { noteDeploy, noteRefusal } = await import('../lib/bridge-notice');
const { logMixItUp } = await import('../lib/mixitup');
const route = await import('../app/api/bridge/staff/route');

b.tuning.longPollMs = 60; b.tuning.idlePollMs = 10;
await kvLib.seedSeason1();

const pair = async (name: string) => {
  const t = (await b.pairBridge((await b.createPairCode('josh')).code, name))!.token;
  return { token: t, hash: hashToken(t), id: (await b.listBridges()).find(p => p.name === name)!.id };
};
const staffPc = await pair('Stream PC');
const plainPc = await pair('Laptop');
const listOf = async (pc: { id: string }) => ((await kv.lrange<{ kind: string; notice?: { kind: string; title: string } }>(`bridge:notices:${pc.id}`, 0, -1)) ?? []);

// ── Gating: no staff PC, no job ──
ok((await b.sendNotice({ kind: 'attention', title: 'x', href: '/admin' })) === false, 'no staff PC: nothing is queued');
ok((await listOf(staffPc)).length === 0 && (await listOf(plainPc)).length === 0, 'no list was written');
await b.setBridgeStaff(staffPc.id, true);
ok(await b.sendNotice({ kind: 'attention', title: 'Backup failed', href: '/admin/settings' }), 'a staff PC gets a notice');
ok((await listOf(staffPc)).length === 1 && (await listOf(plainPc)).length === 0, 'only the staff PC has one waiting');
let jobs = (await b.pollJobs(plainPc.hash, undefined, undefined))!;
ok(!jobs.some(j => j.kind === 'notice'), 'the PC without staff tools is never handed a notice');
jobs = (await b.pollJobs(staffPc.hash, undefined, staffPc.id))!;
ok(jobs.length === 1 && jobs[0].kind === 'notice' && jobs[0].notice?.title === 'Backup failed', 'the staff PC polls it');
ok((await b.pollJobs(staffPc.hash, undefined, staffPc.id))!.length === 0, 'it is handed out once');
await kv.rpush(`bridge:notices:${staffPc.id}`, { id: 'old', kind: 'notice', at: Date.now() - 60_000, notice: { kind: 'attention', title: 'old', href: '/admin' } });
ok((await b.pollJobs(staffPc.hash, undefined, staffPc.id))!.length === 0, 'a notice that waited past the job age limit (the app was offline) is dropped');
ok((await runInSandbox('noticebox', () => b.sendNotice({ kind: 'attention', title: 'x', href: '/admin' }))) === false, 'a sandbox queues nothing');

// ── Refusals: at most one per reason per minute, never "not enough Brie Bucks" ──
const waiting = async () => (await listOf(staffPc)).length;
const base = await waiting();
ok((await noteRefusal('limit_reached', 'ann')) && (await waiting()) === base + 1, 'the first refusal for a reason notifies');
ok(!(await noteRefusal('limit_reached', 'bob')) && (await waiting()) === base + 1, 'a second one within the minute does not');
ok(await noteRefusal('bad_balance', 'ann'), 'another reason notifies');
ok(!(await noteRefusal('insufficient_balance', 'ann')), 'not enough Brie Bucks never does');
await logMixItUp({ username: 'ann', what: 'refused', ok: false, detail: 'insufficient_balance' });
await logMixItUp({ username: 'ann', what: 'refused', ok: false, detail: 'mixitup_unavailable: timeout' });
ok((await waiting()) === base + 3, 'the log hook sends the refusals that are not about money, and only those');

// ── Deploys: once per build ──
const w = await waiting();
ok(await noteDeploy({ version: '1.600', commitFull: 'aaaa111' }), 'a new build notifies');
ok(!(await noteDeploy({ version: '1.600', commitFull: 'aaaa111' })) && (await waiting()) === w + 1, 'the same build does not again');
ok(await noteDeploy({ version: '1.601', commitFull: 'bbbb222' }), 'the next build notifies');
ok(!(await noteDeploy({ version: '1.600', commitFull: 'aaaa111' })), 'an older build claimed already (another server) does not notify');

// ── Back up now, Activity, Quick search: 403 without the switch, audited with it ──
const call = async (tok: string, method: 'POST' | 'GET', input: Record<string, unknown> | string) => {
  const res = method === 'POST'
    ? await route.POST(new Request('http://localhost/api/bridge/staff', { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}` }, body: JSON.stringify(input) }))
    : await route.GET(new Request(`http://localhost/api/bridge/staff?${input as string}`, { headers: { authorization: `Bearer ${tok}` } }));
  return { status: res.status, ...(await res.json()) } as Record<string, any>;
};
const audits = async () => (await kv.lrange<{ action: string }>('audit:all', 0, 50)) ?? [];
ok((await call(plainPc.token, 'POST', { action: 'backup' })).status === 403, 'Back up now is 403 without the switch');
ok((await call(plainPc.token, 'GET', 'what=activity')).status === 403 && (await call(plainPc.token, 'GET', 'what=search&q=a')).status === 403, 'Activity and search are 403 without the switch');
ok((await audits()).length === 0, 'nothing was audited');
const r = await call(staffPc.token, 'POST', { action: 'backup' });
ok(r.status === 200 && r.ok === false && /production/.test(r.message), `Back up now says why it failed (not production here): ${JSON.stringify(r)}`);
ok((await audits()).some(e => e.action.includes('Backup failed') && e.action.includes('via TCG Bridge on Stream PC, paired by josh')), 'the backup is audited with the PC and the admin who paired it');
const act = await call(staffPc.token, 'GET', 'what=activity');
ok(act.status === 200 && Array.isArray(act.events), 'Activity reads');
const card = (await kvLib.getActiveSeasonWithPacks())!.packs[0].cards[0];
const found = await call(staffPc.token, 'GET', `what=search&q=${card.number}`);
ok(found.status === 200 && found.results.some((x: { href: string; hint: string }) => x.hint === `Card #${card.number}` && x.href.startsWith('/admin/packs/')), `Quick search finds a card and its admin page: ${JSON.stringify(found)}`);
ok((await call(staffPc.token, 'GET', 'what=search&q=')).results.length === 0, 'an empty search is empty');
const inBox = await runInSandbox('backupbox', () => call(staffPc.token, 'POST', { action: 'backup' }));
ok(inBox.status === 403 || inBox.status === 401, 'a sandbox refuses it');

console.log('check-bridge-notices: ok');
