// TCG Bridge, the site side (ROADMAP 55.0): the settings default, pairing, token auth on the routes, jobs claimed once, stale jobs,
// and a fake bridge answering real jobs so balance, charge, refund and the timeout run end to end. Against the mock KV (node
// scripts/mock-kv.cjs). Run: npx tsx scripts/check-bridge.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const c = await import('../lib/mixitup-core');
const m = await import('../lib/mixitup');
const b = await import('../lib/bridge');
const core = await import('../lib/bridge-core');
import type { BridgeJob, ObsSnapshot } from '../lib/bridge-core';
const h = await import('../lib/mixitup-health');
const { kv, runInSandbox } = await import('../lib/db');
const pairRoute = await import('../app/api/bridge/pair/route');
const pollRoute = await import('../app/api/bridge/poll/route');
const resultRoute = await import('../app/api/bridge/result/route');
const helloRoute = await import('../app/api/bridge/hello/route');
const reportRoute = await import('../app/api/bridge/report/route');

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
Object.assign(b.tuning, { pollMs: 20, waitMs: 3000, longPollMs: 300, idlePollMs: 40 });
const post = (route: { POST: (r: Request) => Promise<Response> }, path: string, token: string | null, body: unknown) =>
  route.POST(new Request(`http://localhost/api/bridge/${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }));

// ── Settings: a new setup starts on the bridge, an existing one keeps its addresses ──
ok(c.normalizeMixItUp(null).connection === 'bridge' && c.DEFAULT_MIXITUP.connection === 'bridge', 'nothing stored starts on the bridge');
ok(c.normalizeMixItUp({ enabled: true, balanceUrl: 'https://hook.example/a' }).connection === 'addresses', 'settings with a balance address saved before the bridge stay on addresses');
ok(c.normalizeMixItUp({ viewersUrl: 'https://hook.example/v' }).connection === 'addresses' && c.normalizeMixItUp({ addUrl: 'https://hook.example/x' }).connection === 'addresses', 'any one of the four addresses counts');
ok(c.normalizeMixItUp({ balanceUrl: '  ', cost: 5 }).connection === 'bridge', 'empty addresses do not count');
ok(c.normalizeMixItUp({ connection: 'bridge', balanceUrl: 'https://hook.example/a' }).connection === 'bridge' && c.normalizeMixItUp({ connection: 'addresses' }).connection === 'addresses', 'a saved choice wins');
ok(c.normalizeMixItUp({ connection: 'carrier pigeon' }).connection === 'bridge' && c.normalizeMixItUp({ currencyId: ' abc ' }).currencyId === 'abc', 'junk falls back, the currency id is trimmed');
ok(!c.cleanMixItUpInput({ enabled: 'on', connection: 'bridge' }).ok && c.cleanMixItUpInput({ enabled: 'on', connection: 'bridge', currencyId: 'cur-1' }).ok, 'switching on in bridge mode needs a currency, not an address');
ok(!c.cleanMixItUpInput({ enabled: 'on', connection: 'addresses' }).ok, 'switching on in addresses mode still needs the balance address');
ok(c.hasAddRoute({ connection: 'bridge', currencyId: 'x', addUrl: '' }) && !c.hasAddRoute({ connection: 'bridge', currencyId: '', addUrl: 'https://h.example/a' }) && c.hasViewersRoute({ connection: 'bridge', viewersUrl: '' }) && !c.hasViewersRoute({ connection: 'addresses', viewersUrl: '' }), 'the bridge stands in for the add and viewers addresses');

// ── Pure: shapes ──
ok(core.cleanResult({ id: 'a', ok: true, balance: 12.9 })?.balance === 12 && core.cleanResult({ id: 'a b', ok: true }) === null && core.cleanResult({ id: 'a', ok: 'yes' }) === null && core.cleanResult({ id: 'a', ok: true, balance: -1 }) === null && core.cleanResult({ id: 'a', ok: true, users: [1] }) === null && core.cleanResult({ id: 'a', ok: true, users: ['x', 'y'] })?.users?.length === 2, 'results are validated');
ok(core.cleanHello({ version: '1.0', currencies: [{ id: 'g', name: 'Bucks' }, { id: '', name: 'x' }, 5] })?.currencies.length === 1 && core.cleanHello({ version: '1' }) === null, 'hello keeps only complete currencies');
ok(core.cleanHello({ version: '1', currencies: [], commit: ' ABC1234 ' })?.commit === 'abc1234' && core.cleanHello({ version: '1', currencies: [] })?.commit === undefined, 'hello keeps a commit (trimmed, lowercase hex) and accepts an older app without one');
ok(['xyz', '', 12, 'a'.repeat(41), 'abc 123'].every(c => core.cleanHello({ version: '1', currencies: [], commit: c })?.commit === undefined) && core.cleanHello({ version: '1', currencies: [], commit: 'a'.repeat(40) })?.commit?.length === 40, 'a commit that is not hex or is over 40 characters is dropped');
ok(core.normalizeCode('abcd-efgh') === 'ABCDEFGH' && core.normalizeCode('ABC') === '' && core.normalizeCode('0000-1111') === '' && core.newPairCode().length === 8, 'codes are normalised and an ambiguous character is refused');

// ── Pairing: a code works once, expires, and a wrong one is refused ──
const made = await b.createPairCode('josh');
ok(await kv.get(`bridge:pair:${made.code}`), 'a code is stored');
ok((await b.pairBridge('ZZZZ-ZZZZ', 'x')) === null && (await b.pairBridge(undefined, 'x')) === null, 'a wrong code is refused');
const viaRoute = await post(pairRoute, 'pair', null, { code: core.showCode(made.code).toLowerCase(), name: 'Stream PC' });
const paired = (await viaRoute.json()) as { token: string };
ok(viaRoute.status === 200 && typeof paired.token === 'string' && paired.token.length >= 43, 'the right code, typed any way, returns a token');
ok((await post(pairRoute, 'pair', null, { code: made.code, name: 'Again' })).status === 401, 'the same code cannot be used twice');
const stored = await kv.hgetall<Record<string, unknown>>('bridge:tokens');
ok(stored && Object.keys(stored).length === 1 && Object.keys(stored)[0] === core.hashToken(paired.token) && !JSON.stringify(stored).includes(paired.token), 'only the hash of the token is kept');
const second = await b.createPairCode('josh');
await kv.del(`bridge:pair:${second.code}`); // what the 10 minute expiry does
ok((await b.pairBridge(second.code, 'Late')) === null, 'an expired code is refused');
const tokenA = paired.token;
const other = await b.createPairCode('josh');
const tokenB = (await b.pairBridge(other.code, 'Laptop'))!.token;
ok(tokenB && tokenB !== tokenA && (await b.listBridges()).length === 2 && !JSON.stringify(await b.listBridges()).includes(tokenA), 'a second bridge pairs; the list never holds a token');

// ── Auth on the routes ──
for (const [path, route] of [['poll', pollRoute], ['result', resultRoute], ['hello', helloRoute], ['report', reportRoute]] as const) {
  ok((await post(route, path, null, {})).status === 401, `${path}: no token is refused`);
  ok((await post(route, path, 'not-a-token', {})).status === 401, `${path}: an unknown token is refused`);
}
const idleStarted = Date.now();
const idle = await post(pollRoute, 'poll', tokenA, {});
ok(idle.status === 200 && (await idle.json()).jobs.length === 0 && Date.now() - idleStarted >= b.tuning.longPollMs - 100, 'a poll with a token waits, then answers an empty list');
ok((await b.readBridge()).at !== null && (await b.listBridges())[0].lastSeen > 0, 'a poll notes the bridge was seen');
const helloRes = await post(helloRoute, 'hello', tokenA, { version: '0.1.0', currencies: [{ id: 'cur-1', name: 'Brie Bucks' }] });
const helloBody = await helloRes.json();
ok(helloRes.status === 200 && helloBody.ok === true, 'hello is accepted');
ok(helloBody.channel === 'Cheesygidds' && typeof helloBody.currencyId === 'string', 'hello answers with the channel name and the chosen currency id');
const state = await b.readBridge();
ok(state.version === '0.1.0' && state.currencies[0].id === 'cur-1', 'hello fills the currency list');
ok(state.commit === '', 'an older app without a commit stores none');
await post(helloRoute, 'hello', tokenA, { version: '0.1.0', currencies: [{ id: 'cur-1', name: 'Bucks' }], commit: 'ABCDEF1' });
ok((await b.readBridge()).commit === 'abcdef1', 'hello stores the commit beside the version');
ok((await post(helloRoute, 'hello', tokenA, { version: 1 })).status === 400 && (await post(resultRoute, 'result', tokenA, { id: 'x' })).status === 400, 'a wrong shape is a 400');
ok((await post(resultRoute, 'result', tokenA, { id: 'r1', ok: true, balance: 7 })).status === 200 && (await kv.get('bridge:result:r1')), 'a result is stored');

// ── What the bridge sees in OBS (55.6b): /api/bridge/report ──
const snap = { type: 'obs', connected: true, scene: 'Gameplay', overlay: { found: true, inProgram: true, visible: true, sourceName: 'TCG Overlay' } };
ok((await b.readObs()) === null, 'no snapshot until a bridge reports one');
for (const bad of [null, {}, { type: 'nope' }, { type: 'stream', live: 'yes' }, { type: 'stream' }, { type: 'obs' }, { ...snap, connected: 'yes' }, { ...snap, scene: 5 }, { ...snap, overlay: null }, { ...snap, overlay: { ...snap.overlay, visible: 1 } }]) {
  ok((await post(reportRoute, 'report', tokenA, bad)).status === 400, `report: ${JSON.stringify(bad)} is a 400`);
}
ok((await b.readObs()) === null, 'a bad shape stores nothing');
const longName = 'x'.repeat(500);
const sent = await post(reportRoute, 'report', tokenA, { ...snap, scene: longName, overlay: { ...snap.overlay, sourceName: longName }, url: 'https://cheesytcg.app/overlay.html?key=SECRETKEY' });
const obsNow = await b.readObs();
ok(sent.status === 200 && obsNow && obsNow.connected && obsNow.scene.length === 100 && obsNow.overlay.sourceName.length === 100 && Date.now() - obsNow.at < 5000, 'an OBS snapshot is stored with its time and capped strings');
ok(!JSON.stringify(await kv.get('bridge:obs')).includes('SECRETKEY'), 'only the known fields are stored');
await post(reportRoute, 'report', tokenA, { ...snap, connected: false, scene: '', overlay: { found: false, inProgram: false, visible: false, sourceName: '' } });
ok((await b.readObs())!.connected === false, 'the latest snapshot wins');

// The stream hint moves only when OBS says something new
const liveRes = async (live: boolean) => (await (await post(reportRoute, 'report', tokenA, { type: 'stream', live })).json()) as { ok: boolean; live: boolean; changed: boolean };
const hintAt = async () => (await kv.get<{ live: boolean; at: number }>('twitch:live:hint'))!;
const first = await liveRes(true);
const hint1 = await hintAt();
ok(first.ok && first.changed && hint1.live === true && (await kv.get<{ live: boolean }>('twitch:live'))?.live === true, 'OBS streaming sets the live hint and the live status');
await sleep(15);
const again = await liveRes(true);
ok(!again.changed && (await hintAt()).at === hint1.at, 'the same news again leaves the hint alone');
const off = await liveRes(false);
ok(off.changed && (await hintAt()).live === false && (await kv.get<{ live: boolean }>('twitch:live'))?.live === false, 'OBS stopping sets the hint to offline');
await kv.del('twitch:live:hint', 'twitch:live');

const gone = (await b.listBridges()).find(x => x.name === 'Laptop')!;
ok((await b.revokeBridge(gone.id)) === 'Laptop' && (await b.revokeBridge(gone.id)) === null, 'a bridge is revoked once');
ok((await post(pollRoute, 'poll', tokenB, {})).status === 401 && (await post(resultRoute, 'result', tokenB, { id: 'r2', ok: true })).status === 401, 'a revoked token is refused');
ok((await post(pollRoute, 'poll', tokenA, {})).status === 200, 'the other bridge still works');

// ── Jobs: claimed once, stale ones dropped ──
const job = (extra: Record<string, unknown> = {}) => ({ id: crypto.randomUUID(), kind: 'balance', username: 'ann', at: Date.now(), ...extra });
const hashA = core.hashToken(tokenA);
await kv.rpush('bridge:jobs', job());
const both = await Promise.all([b.pollJobs(hashA), b.pollJobs(hashA)]);
ok(both[0]!.length + both[1]!.length === 1, 'a job goes to one poller only');
await kv.rpush('bridge:jobs', job({ at: Date.now() - 20_000 }), { nonsense: true }, job({ kind: 'launch-missiles' }));
ok((await b.pollJobs(hashA))!.length === 0 && (await kv.llen('bridge:jobs')) === 0, 'stale, malformed and unknown jobs are dropped');

// ── A sandbox never creates a job ──
const inBox = await runInSandbox('bridgebox', () => m.fetchBalance(c.normalizeMixItUp({ enabled: true, connection: 'bridge', currencyId: 'cur-1' }), 'ann'));
await runInSandbox('bridgebox', () => b.bridgeSay('hello'));
ok(inBox.balance === null && /sandbox/i.test(inBox.error ?? '') && (await kv.llen('bridge:jobs')) === 0, 'a sandbox gets no answer and queues nothing');

// ── No bridge answering: the same as Mix It Up not answering today ──
Object.assign(b.tuning, { waitMs: 300 });
const bridgeMix = c.normalizeMixItUp({ enabled: true, connection: 'bridge', currencyId: 'cur-1', currency: 'Brie Bucks', cost: 100, limit: 1 });
const slow = await m.fetchBalance(bridgeMix, 'cat');
ok(slow.balance === null && slow.error === 'TCG Bridge did not answer', 'no result in time is a failed call');
const noAnswer = await m.reservePaidPull(bridgeMix, 'cat', 'o1');
ok(!noAnswer.ok && noAnswer.reason === 'mixitup_unavailable', 'a reservation is refused when the bridge does not answer');
const cl = { payId: 'o2', username: 'cat', amount: 100, stream: 's1' };
const unpaid = await m.chargePaidPull(bridgeMix, cl, { cardName: 'X', variant: 'Regular', stars: 1, packName: 'B', cardNumber: 1 });
ok(!unpaid.applied && unpaid.error === 'TCG Bridge did not answer', 'a charge is not applied when the bridge does not answer');
ok(!(await m.grantCurrency(bridgeMix, 'cat', 5)).applied && (await m.fetchChatViewers(bridgeMix)).users.length === 0, 'grants and viewers fail the same way');
const out = (await h.readMixItUpHealth()).out;
ok(out.balance && !out.balance.ok && out.deduct && !out.deduct.ok, 'the failure is noted in the health record');
// A result that arrives after the waiter gave up is refused (the app undoes a deduct or add on the 409)
const missed = await b.claimJobs();
ok(missed.length > 0 && (await kv.get<{ late?: boolean }>(`bridge:result:${missed[0].id}`))?.late === true, 'giving up leaves a marker for the job');
ok((await b.storeResult({ id: missed[0].id, ok: true })) === 'late', 'a result after the waiter gave up is late');
const lateRes = await post(resultRoute, 'result', tokenA, { id: missed[0].id, ok: true });
ok(lateRes.status === 409 && (await lateRes.json()).late === true, 'the result route answers 409 late');
ok((await b.storeResult({ id: 'r1', ok: true, balance: 7 })) === 'stored', 'a repeated real result is not late');
// A result that wins the race against the marker is used: waitMs 0 skips the wait loop, so the marker write is the next step
const raceId = crypto.randomUUID();
const realUuid = crypto.randomUUID.bind(crypto);
(crypto as { randomUUID: () => string }).randomUUID = () => raceId;
await b.storeResult({ id: raceId, ok: true, balance: 9 });
Object.assign(b.tuning, { waitMs: 0 });
const raced = await m.fetchBalance(bridgeMix, 'cat');
(crypto as { randomUUID: () => string }).randomUUID = realUuid;
ok(raced.balance === 9, 'a result that landed before the marker is used');
Object.assign(b.tuning, { waitMs: 300 });
await b.claimJobs(); // drain what nobody picked up

// ── A fake bridge answering real jobs ──
const ledger: Record<string, number> = { ann: 250, bob: 50, cat: 1000 };
const seen: BridgeJob[] = [];
let running = true;
const loop = (async () => {
  while (running) {
    for (const j of await b.claimJobs()) {
      seen.push(j);
      const u = String(j.username);
      if (j.kind === 'balance') await b.storeResult({ id: j.id, ok: true, balance: ledger[u] ?? 0 });
      else if (j.kind === 'deduct') { ledger[u] -= j.amount ?? 0; await b.storeResult({ id: j.id, ok: true }); }
      else if (j.kind === 'add') { ledger[u] += j.amount ?? 0; await b.storeResult({ id: j.id, ok: true }); }
      else if (j.kind === 'viewers') await b.storeResult({ id: j.id, ok: true, users: ['@Ann', 'bob', 'ann'] });
      else await b.storeResult({ id: j.id, ok: true });
    }
    await sleep(15);
  }
})();
Object.assign(b.tuning, { waitMs: 3000 });

ok((await m.fetchBalance(bridgeMix, 'ann')).balance === 250 && seen[0].kind === 'balance' && seen[0].username === 'ann' && seen[0].currencyId === 'cur-1', 'a balance goes through the bridge, with the currency id');
ok((await m.fetchChatViewers(bridgeMix)).users.join() === 'ann,bob', 'viewers come back cleaned up');

const bobRes = await m.reservePaidPull(bridgeMix, 'bob', 'b1');
ok(!bobRes.ok && bobRes.reason === 'insufficient_balance' && bobRes.balance === 50, 'a viewer who cannot pay is refused with their balance');
const catRes = await m.reservePaidPull(bridgeMix, 'cat', 'c1');
ok(catRes.ok && !(await m.reservePaidPull(bridgeMix, 'cat', 'c2')).ok, 'the allowance given back after the outage is available again');
await m.releasePaidPull('c1');

const annRes = await m.reservePaidPull(bridgeMix, 'ann', 'p1');
ok(annRes.ok, 'a paid pull is reserved through the bridge');
const claimed = (await m.claimPaidPull('p1', 'ann'))!;
const charged = await m.chargePaidPull({ ...bridgeMix, message: '{username} got {cardName} for {amount} {currency}' }, claimed, { cardName: 'Gouda Goat', variant: 'Regular', stars: 2, packName: 'Base', cardNumber: 7, serial: 3 });
const deductJob = seen.find(j => j.kind === 'deduct')!;
ok(charged.applied && ledger.ann === 150 && deductJob.username === 'ann' && deductJob.amount === 100 && deductJob.text === 'ann got Gouda Goat for 100 Brie Bucks', 'the charge is applied with the amount and the message');
await m.refundPaidPull(bridgeMix, claimed, 'Gouda Goat');
ok(ledger.ann === 250 && seen.some(j => j.kind === 'add'), 'a refund adds the currency back through the bridge');
ok((await m.grantCurrency(bridgeMix, 'bob', 25)).applied && ledger.bob === 75, 'a currency grant goes through the bridge');
const test = await m.sendTest(bridgeMix);
ok(test.ok && seen.some(j => j.kind === 'say' && j.text?.includes('tcg-test')), 'the test message is a say job');
await b.bridgeSay('hi chat');
await sleep(60);
ok(seen.some(j => j.kind === 'say' && j.text === 'hi chat'), 'bridgeSay queues a say job without waiting');

// The overlay refresh in OBS is a job of its own kind and waits for the answer
const refreshed = await b.refreshOverlayInObs();
ok(refreshed.ok && seen.some(j => j.kind === 'obs-refresh'), 'refreshOverlayInObs queues an obs-refresh job and reads the answer');
const inBox2 = await runInSandbox('bridgebox', () => b.refreshOverlayInObs());
ok(!inBox2.ok && /sandbox/i.test(inBox2.error ?? ''), 'a sandbox never refreshes OBS');

// ── A bridge that says no ──
running = false; await loop;
Object.assign(b.tuning, { waitMs: 400 });
const pending = b.refreshOverlayInObs();
await sleep(80);
const [refreshJob] = await b.claimJobs();
await b.storeResult({ id: refreshJob.id, ok: false, error: 'The overlay browser source was not found in OBS' });
const refusedRefresh = await pending;
ok(refreshJob.kind === 'obs-refresh' && !refusedRefresh.ok && refusedRefresh.error === 'The overlay browser source was not found in OBS', 'the reason OBS could not refresh comes back in words');
const unanswered = await b.refreshOverlayInObs();
ok(!unanswered.ok && unanswered.error === 'TCG Bridge did not answer', 'no answer is said plainly');
await b.claimJobs();
const failed = core.replyFromResult('deduct', core.cleanResult({ id: 'bad2', ok: false, error: 'No such viewer' }));
ok(!failed.ok && failed.error === 'No such viewer' && !c.replyApplied(failed.status, failed.body), 'a failed result is not applied and keeps its reason');

// ── The health chip ──
const now = Date.now();
const ago = (at: number, n: number) => `${Math.round((n - at) / 1000)}s ago`;
const urls = { balance: '', deduct: '', add: '', viewers: '' };
const nobody = { seen: {}, out: {} };
const live = h.healthChips(nobody, urls, now, ago, { at: now - 4000 });
ok(live.length === 2 && live[1].tone === 'ok' && live[1].text === 'TCG Bridge connected (4s ago)', 'a bridge seen a moment ago is connected, and the address chips are gone');
const stale = h.healthChips(nobody, urls, now, ago, { at: now - 120_000 });
ok(stale[1].tone === 'bad' && /not connected \(last seen 120s ago\)/.test(stale[1].text), 'a bridge not seen for a minute is not connected');
ok(h.healthChips(nobody, urls, now, ago, { at: null })[1].text === 'TCG Bridge not connected' && h.healthChips(nobody, urls, now, ago).length === 5, 'never seen is not connected; without bridge mode the four address chips stay');

// The OBS chip: nothing when no bridge ever reported OBS, then one chip by what the snapshot says
const obsAt = (o: Partial<ObsSnapshot>): ObsSnapshot => ({ at: now - 5000, connected: true, scene: 'Gameplay', overlay: { found: true, inProgram: true, visible: true, sourceName: 'TCG Overlay' }, ...o });
const withObs = (o: ObsSnapshot | null) => h.healthChips(nobody, urls, now, ago, { at: now - 4000, obs: o });
ok(withObs(null).length === 2 && h.healthChips(nobody, urls, now, ago, { at: now - 4000 }).length === 2, 'no OBS report, no OBS chip');
ok(withObs(obsAt({}))[2].text === 'OBS: overlay visible in Gameplay' && withObs(obsAt({}))[2].tone === 'ok', 'overlay visible');
ok(withObs(obsAt({ scene: 'Just Chatting', overlay: { found: true, inProgram: false, visible: false, sourceName: 'TCG Overlay' } }))[2].text === 'OBS: overlay not in the current scene (Just Chatting)', 'overlay not in the current scene');
ok(withObs(obsAt({ overlay: { found: false, inProgram: false, visible: false, sourceName: '' } }))[2].text === 'OBS: overlay source not found', 'overlay source not found');
ok(withObs(obsAt({ overlay: { found: true, inProgram: true, visible: false, sourceName: 'TCG Overlay' } }))[2].text === 'OBS: overlay hidden in Gameplay', 'overlay hidden');
ok(withObs(obsAt({ connected: false }))[2].text === 'OBS not connected' && withObs(obsAt({ at: now - 61_000 }))[2].text === 'OBS not connected' && withObs(obsAt({ at: now - 59_000 }))[2].tone === 'ok', 'a disconnected or minute-old snapshot is not connected');
ok(h.obsChip(null, now) === null && h.healthChips(nobody, urls, now, ago, undefined).length === 5, 'the address mode never shows OBS');

console.log('bridge checks passed');
