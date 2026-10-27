// TCG Bridge checks: a fake Mix It Up Developer API and a fake TCG site, both local HTTP servers, driven through the real service.
// Run from bridge/: npm run check   (or from the repo root: npx tsx bridge/scripts/check.ts). No Electron needed.
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MixItUpClient } from '../src/mixitup';
import { cleanObsAddress, isOverlayUrl, ObsWatcher } from '../src/obs';
import { BridgeService } from '../src/service';
import { FileSettingsStore } from '../src/settings';
import { FakeObs, PW_123 } from './fake-obs';
import { cleanSite, pair, SiteClient, SiteError, type BridgeJob, type BridgeResult } from '../src/site';

const CUR = '11111111-2222-3333-4444-555555555555';
const ALICE = 'aaaaaaaa-0000-0000-0000-000000000001';
const TOKEN = 'tok-123';

type Handler = (req: IncomingMessage, res: ServerResponse, body: string) => void;
async function listen(handler: Handler): Promise<{ server: Server; url: string }> {
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => handler(req, res, body));
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const addr = server.address();
  return { server, url: `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}` };
}
const send = (res: ServerResponse, status: number, body: unknown, type = 'application/json') => {
  res.writeHead(status, { 'content-type': type });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
};
const waitFor = async (what: string, cond: () => boolean, ms = 4000) => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise(r => setTimeout(r, 10));
  }
};

// ── Fake Mix It Up: PascalCase JSON like the real Developer API; the adjust route knows users by ID only ──
interface FakeUser { ID: string; TwitchID: string; Username: string; amount: number }
function fakeMixItUp() {
  const users = new Map<string, FakeUser>([['alice', { ID: ALICE, TwitchID: '77', Username: 'alice', amount: 10 }]]);
  const calls: { method: string; url: string; body: unknown }[] = [];
  const chat: { Message: string; SendAsStreamer: boolean }[] = [];
  const asUser = (u: FakeUser) => ({ ID: u.ID, TwitchID: u.TwitchID, Username: u.Username, CurrencyAmounts: [{ ID: CUR, Name: 'Brie Bucks', Amount: u.amount }], InventoryAmounts: [] });
  const handler: Handler = (req, res, body) => {
    const url = req.url ?? '';
    const json = body ? JSON.parse(body) : undefined;
    calls.push({ method: req.method ?? '', url, body: json });
    if (url === '/api/status/version') return send(res, 200, '1.10.0.0', 'text/plain');
    if (url === '/api/currency') return send(res, 200, [{ ID: CUR, Name: 'Brie Bucks' }]);
    const t = /^\/api\/users\/twitch\/([^/]+)$/.exec(url);
    if (t && req.method === 'GET') {
      const u = users.get(decodeURIComponent(t[1]));
      return u ? send(res, 200, asUser(u)) : send(res, 404, { Message: `Unable to find user: ${t[1]}.` });
    }
    const a = /^\/api\/users\/([^/]+)\/currency\/([^/]+)\/adjust$/.exec(url);
    if (a && req.method === 'PUT') {
      const u = [...users.values()].find(x => x.ID === a[1]);
      if (!u) return send(res, 404, { Message: 'Unable to find user' });
      if (a[2] !== CUR) return send(res, 404, { Message: 'Unable to find currency' });
      const n = (json as { Amount: number }).Amount;
      if (n < 0 && u.amount < -n) return send(res, 403, { Message: 'User does not have enough currency to remove' });
      u.amount += n;
      return send(res, 200, asUser(u));
    }
    if (url === '/api/chat/users') return send(res, 200, [asUser(users.get('alice')!), { ID: 'x', TwitchID: '', YouTubeID: 'yt', Username: 'YouTuber', CurrencyAmounts: [] }, { ...asUser(users.get('alice')!), Username: 'Alice' }]);
    if (url === '/api/chat/message' && req.method === 'POST') { chat.push(json); return send(res, 200, ''); }
    send(res, 404, { Message: 'no route' });
  };
  return { users, calls, chat, handler };
}

// ── Fake site: the bridge API from app/api/bridge/* ──
function fakeSite() {
  const s = {
    jobs: [] as BridgeJob[],
    hellos: [] as { version: string; currencies: { id: string; name: string }[] }[],
    results: [] as BridgeResult[],
    reports: [] as Record<string, unknown>[],
    resultAttempts: 0,
    polls: 0,
    pollMode: 'ok' as 'ok' | '401' | '500',
    resultMode: (_r: BridgeResult, _attempt: number): 'ok' | 'late' | '500' | 'drop' => 'ok',
  };
  const handler: Handler = (req, res, body) => {
    const json = body ? JSON.parse(body) : {};
    if (req.url === '/api/bridge/pair') return json.code === 'ABCD-EFGH' ? send(res, 200, { token: TOKEN }) : send(res, 401, { error: 'That code is wrong or has expired.' });
    if (req.headers.authorization !== `Bearer ${TOKEN}`) return send(res, 401, { error: 'Unknown token' });
    if (req.url === '/api/bridge/hello') { s.hellos.push(json); return send(res, 200, { ok: true }); }
    if (req.url === '/api/bridge/report') { s.reports.push(json); return send(res, 200, { ok: true }); }
    if (req.url === '/api/bridge/poll') {
      s.polls++;
      if (s.pollMode === '401') return send(res, 401, { error: 'Unknown token' });
      if (s.pollMode === '500') return send(res, 500, { error: 'boom' });
      const jobs = s.jobs.splice(0);
      return jobs.length ? send(res, 200, { jobs }) : void setTimeout(() => send(res, 200, { jobs: [] }), 20); // a short "long-poll"
    }
    if (req.url === '/api/bridge/result') {
      const attempt = ++s.resultAttempts;
      const mode = s.resultMode(json, attempt);
      if (mode === 'drop') return void req.socket.destroy();
      if (mode === '500') return send(res, 500, { error: 'boom' });
      if (mode === 'late') return send(res, 409, { error: 'Too late', late: true });
      s.results.push(json);
      return send(res, 200, { ok: true });
    }
    send(res, 404, {});
  };
  return { s, handler };
}

const job = (kind: string, extra: Partial<BridgeJob> = {}): BridgeJob => ({ id: `j-${Math.random().toString(36).slice(2)}`, kind, currencyId: CUR, at: Date.now(), ...extra });

async function main() {
  const mi = fakeMixItUp();
  const miSrv = await listen(mi.handler);
  const si = fakeSite();
  const siSrv = await listen(si.handler);
  const mix = new MixItUpClient(miSrv.url, 1000);
  let changes = 0;
  const client = new SiteClient(siSrv.url, TOKEN, '0.0.0');
  const obsOff = { enabled: false, address: 'ws://127.0.0.1:4455', password: '' };
  const obs = new ObsWatcher({ site: siSrv.url, report: b => client.report(b), backoffMs: { min: 10, max: 40 }, debounceMs: 30, reportMs: 20, heartbeatMs: 200 }, obsOff);
  const svc = new BridgeService({
    client, mix, obs, onChange: () => { changes++; },
    mixCheckMs: 50, backoffMs: { min: 10, max: 40 }, retryMs: 5,
  });
  type ObsReport = { connected: boolean; scene: string; overlay: { found: boolean; inProgram: boolean; visible: boolean; sourceName: string } };
  const obsReports = () => si.s.reports.filter(r => r.type === 'obs') as unknown as ObsReport[];
  const lastObs = () => obsReports().at(-1);
  const streamReports = () => si.s.reports.filter(r => r.type === 'stream').map(r => r.live);
  const resultOf = async (j: BridgeJob): Promise<BridgeResult> => {
    si.s.jobs.push(j);
    await waitFor(`result of ${j.kind}`, () => si.s.results.some(r => r.id === j.id));
    return si.s.results.find(r => r.id === j.id)!;
  };

  // ── OBS: a fake obs-websocket v5 server, driven through the real service ──
  async function obsChecks() {
    const fake = new FakeObs();
    fake.auth = PW_123.auth;
    const overlay = { inputName: 'TCG Overlay', inputKind: 'browser_source', url: `${siSrv.url}/overlay.html?key=SECRETKEY` };
    const other = { inputName: 'Other', inputKind: 'browser_source', url: 'https://example.com/overlay.html' };
    const cam = { sceneItemId: 1, sourceName: 'Cam', sceneItemEnabled: true, isGroup: false };
    const ov = { sceneItemId: 2, sourceName: 'TCG Overlay', sceneItemEnabled: true, isGroup: false };
    fake.inputs = [other, overlay];
    fake.scenes = { Gameplay: [cam, ov], 'Just Chatting': [cam] };
    await fake.listen();
    const address = `ws://127.0.0.1:${fake.port}`;
    const checks = () => fake.requests.filter(r => r === 'GetCurrentProgramScene').length;
    assert.equal(cleanObsAddress(' ws://localhost:4455/ '), 'ws://localhost:4455');
    for (const bad of ['ws://example.com:4455', 'ws://127.0.0.1', 'wss://127.0.0.1:4455', 'ws://127.0.0.1:0', 'ws://127.0.0.1:99999', 'ws://127.0.0.1.evil.com:4455']) assert.equal(cleanObsAddress(bad), null, bad);
    assert.ok(isOverlayUrl('https://www.cheesytcg.app/overlay.html?key=abc', 'https://cheesytcg.app'));
    assert.ok(!isOverlayUrl('https://cheesytcg.app/admin', 'https://cheesytcg.app'));
    assert.ok(!isOverlayUrl('https://evil.example/overlay.html', 'https://cheesytcg.app'));

    // the wrong password is named, the tray says "partly", and the site hears OBS is switched on but unreachable
    await svc.reconfigureObs({ enabled: true, address, password: 'nope' });
    await waitFor('wrong password', () => svc.state.obs.error === 'Wrong OBS WebSocket password');
    assert.equal(svc.state.tray, 'partly');
    await waitFor('site told OBS is unreachable', () => lastObs()?.connected === false);

    // the right password: connected, stream and overlay reported, and neither the key nor the password leaves the PC
    await svc.reconfigureObs({ enabled: true, address, password: 'pw-123' });
    await waitFor('connected', () => svc.state.obs.connected && svc.state.obs.overlay.found);
    await waitFor('first snapshot', () => lastObs()?.connected === true);
    assert.deepEqual(lastObs(), { type: 'obs', connected: true, scene: 'Gameplay', overlay: { found: true, inProgram: true, visible: true, sourceName: 'TCG Overlay' } });
    assert.deepEqual(streamReports(), [false], 'the stream state is reported once on connect');
    assert.equal(svc.state.tray, 'connected');
    assert.equal(fake.subscriptions.at(-1), 4 | 8 | 64 | 128, 'scenes, inputs, outputs and scene items only');
    const wire = JSON.stringify(si.s.reports);
    assert.ok(!wire.includes('SECRETKEY') && !wire.includes('pw-123') && !wire.includes('127.0.0.1:'), 'no key, password or address is sent');

    // stream start and stop
    fake.streaming = true;
    fake.emit('StreamStateChanged', { outputActive: true, outputState: 'OBS_WEBSOCKET_OUTPUT_STARTING' });
    fake.emit('StreamStateChanged', { outputActive: true, outputState: 'OBS_WEBSOCKET_OUTPUT_STARTED' });
    await waitFor('stream live', () => streamReports().at(-1) === true);
    fake.emit('StreamStateChanged', { outputActive: false, outputState: 'OBS_WEBSOCKET_OUTPUT_STOPPING' });
    fake.emit('StreamStateChanged', { outputActive: false, outputState: 'OBS_WEBSOCKET_OUTPUT_STOPPED' });
    await waitFor('stream ended', () => streamReports().at(-1) === false);
    assert.deepEqual(streamReports(), [false, true, false], 'only started and stopped count');

    // a burst of events is one check; a quiet OBS is still reported now and then (the heartbeat)
    const checksBefore = checks();
    for (let i = 0; i < 5; i++) fake.emit('SceneItemEnableStateChanged', { sceneName: 'Gameplay', sceneItemId: 2, sceneItemEnabled: true });
    await waitFor('burst checked', () => checks() > checksBefore);
    await new Promise(r => setTimeout(r, 120));
    assert.equal(checks(), checksBefore + 1, 'debounced to one check');
    const beats = obsReports().length;
    await waitFor('heartbeat', () => obsReports().length > beats);

    // a scene change is reported: the overlay exists but is not in the current scene
    fake.scene = 'Just Chatting';
    fake.emit('CurrentProgramSceneChanged', { sceneName: 'Just Chatting' });
    await waitFor('scene change', () => lastObs()?.scene === 'Just Chatting');
    assert.deepEqual(lastObs()!.overlay, { found: true, inProgram: false, visible: false, sourceName: 'TCG Overlay' });
    fake.scene = 'Gameplay';
    fake.emit('CurrentProgramSceneChanged', { sceneName: 'Gameplay' });
    await waitFor('back on Gameplay', () => lastObs()?.scene === 'Gameplay' && lastObs()?.overlay.visible === true);

    // in the scene but hidden
    ov.sceneItemEnabled = false;
    fake.emit('SceneItemEnableStateChanged', { sceneName: 'Gameplay', sceneItemId: 2, sceneItemEnabled: false });
    await waitFor('hidden', () => lastObs()?.overlay.inProgram === true && lastObs()?.overlay.visible === false);
    ov.sceneItemEnabled = true;

    // inside a group (one level): visible only when the group and the source are both enabled
    const group = { sceneItemId: 3, sourceName: 'Group', sceneItemEnabled: true, isGroup: true };
    fake.scenes.Gameplay = [cam, group];
    fake.groups = { Group: [{ sceneItemId: 1, sourceName: 'TCG Overlay', sceneItemEnabled: true, isGroup: false }] };
    fake.emit('SceneItemEnableStateChanged', { sceneName: 'Gameplay', sceneItemId: 3, sceneItemEnabled: true });
    await waitFor('group', () => lastObs()?.overlay.inProgram === true && lastObs()?.overlay.visible === true);
    group.sceneItemEnabled = false;
    fake.emit('SceneItemEnableStateChanged', { sceneName: 'Gameplay', sceneItemId: 3, sceneItemEnabled: false });
    await waitFor('group hidden', () => lastObs()?.overlay.inProgram === true && lastObs()?.overlay.visible === false);
    fake.scenes.Gameplay = [cam, ov];
    fake.groups = {};
    fake.emit('SceneItemEnableStateChanged', { sceneName: 'Gameplay', sceneItemId: 2, sceneItemEnabled: true });
    await waitFor('plain again', () => lastObs()?.overlay.visible === true);

    // obs-refresh presses "Refresh cache of current page" on the overlay source, and only on it
    const refreshed = await resultOf(job('obs-refresh'));
    assert.equal(refreshed.ok, true);
    assert.deepEqual(fake.pressed, [{ inputName: 'TCG Overlay', propertyName: 'refreshnocache' }]);

    // the overlay source is missing: reported, and the refresh says so
    fake.inputs = [other];
    fake.emit('InputRemoved', { inputName: 'TCG Overlay' });
    await waitFor('overlay missing', () => lastObs()?.overlay.found === false);
    assert.equal(lastObs()!.overlay.sourceName, '');
    const missing = await resultOf(job('obs-refresh'));
    assert.deepEqual([missing.ok, missing.error], [false, 'The overlay browser source was not found in OBS']);
    assert.equal(fake.pressed.length, 1);
    fake.inputs = [other, overlay];
    fake.emit('InputCreated', { inputName: 'TCG Overlay' });
    await waitFor('overlay back', () => lastObs()?.overlay.found === true);

    // OBS closes and comes back: the site hears it, a refresh is answered at once, and the watcher reconnects by itself
    const identified = fake.identified;
    await fake.close();
    await waitFor('OBS lost', () => !svc.state.obs.connected && svc.state.tray === 'partly');
    await waitFor('site told OBS is gone', () => lastObs()?.connected === false);
    const goneT0 = Date.now();
    const gone = await resultOf(job('obs-refresh'));
    assert.deepEqual([gone.ok, gone.error], [false, 'TCG Bridge is not connected to OBS']);
    assert.ok(Date.now() - goneT0 < 1000);
    await fake.listen();
    await waitFor('reconnected to OBS', () => svc.state.obs.connected && fake.identified > identified);
    await waitFor('back in the site', () => lastObs()?.connected === true && lastObs()?.overlay.visible === true);
    assert.equal(svc.state.tray, 'connected');

    // switching OBS off in the app: the site hears it, and the tray stops caring
    await svc.reconfigureObs({ enabled: false, address, password: '' });
    assert.equal(svc.state.obs.enabled, false);
    await waitFor('site told OBS is off', () => lastObs()?.connected === false);
    assert.equal(svc.state.tray, 'connected');
    const off = await resultOf(job('obs-refresh'));
    assert.deepEqual([off.ok, off.error], [false, 'OBS is switched off in TCG Bridge']);
    await fake.close();
  }

  // pairing and the site address
  assert.equal(await pair(siSrv.url, 'ABCD-EFGH', 'STREAM-PC'), TOKEN);
  await assert.rejects(() => pair(siSrv.url, 'WRONG', 'x'), (e: unknown) => e instanceof SiteError && e.status === 401 && /wrong or has expired/.test(e.message));
  assert.equal(cleanSite('https://cheesytcg.app/admin'), 'https://cheesytcg.app');
  assert.equal(cleanSite('http://cheesytcg.app'), null);
  assert.equal(cleanSite('http://localhost:3000'), 'http://localhost:3000');
  assert.equal(cleanSite('not a url'), null);

  svc.start();
  await waitFor('hello', () => si.s.hellos.length > 0);
  assert.deepEqual(si.s.hellos[0], { version: '1.10.0.0', currencies: [{ id: CUR, name: 'Brie Bucks' }] }); // the version stays a string
  await waitFor('connected', () => svc.state.site === 'connected' && svc.state.mix.found);
  assert.equal(svc.state.tray, 'connected');

  // each job kind
  assert.deepEqual(await resultOf(job('balance', { username: 'alice' })), { id: si.s.results.at(-1)!.id, ok: true, balance: 10 });
  assert.equal((await resultOf(job('balance', { username: 'nobody' }))).balance, 0, 'a viewer Mix It Up does not know has 0');
  const add = await resultOf(job('add', { username: 'Alice', amount: 5 }));
  assert.equal(add.ok, true);
  assert.equal(mi.users.get('alice')!.amount, 15);
  const adj = mi.calls.filter(c => c.method === 'PUT').at(-1)!;
  assert.equal(adj.url, `/api/users/${ALICE}/currency/${CUR}/adjust`, 'the adjust route is addressed by user ID');
  assert.deepEqual(adj.body, { Amount: 5 }, 'PascalCase body');
  const ded = await resultOf(job('deduct', { username: 'alice', amount: 3, text: 'alice opened a pack' }));
  assert.equal(ded.ok, true);
  assert.equal(mi.users.get('alice')!.amount, 12);
  assert.deepEqual(mi.calls.filter(c => c.method === 'PUT').at(-1)!.body, { Amount: -3 });
  await waitFor('deduct chat message', () => mi.chat.length === 1);
  assert.deepEqual(mi.chat[0], { Message: 'alice opened a pack', SendAsStreamer: false });
  const viewers = await resultOf(job('viewers'));
  assert.deepEqual(viewers.users, ['alice'], 'Twitch viewers only, lowercased, no duplicates');
  const say = await resultOf(job('say', { text: 'hello chat' }));
  assert.equal(say.ok, true);
  assert.deepEqual(mi.chat[1], { Message: 'hello chat', SendAsStreamer: false });

  // OBS is off by default: the refresh job is answered at once and the tray ignores OBS
  const offT0 = Date.now();
  const offRefresh = await resultOf(job('obs-refresh'));
  assert.deepEqual([offRefresh.ok, offRefresh.error], [false, 'OBS is switched off in TCG Bridge']);
  assert.ok(Date.now() - offT0 < 1000);
  assert.equal(svc.state.tray, 'connected');
  assert.equal(svc.state.obs.enabled, false);

  // deduct refused when short: never negative, no adjust sent
  const puts = () => mi.calls.filter(c => c.method === 'PUT').length;
  const before = puts();
  const short = await resultOf(job('deduct', { username: 'alice', amount: 999 }));
  assert.deepEqual([short.ok, short.error], [false, 'Not enough Brie Bucks']);
  const stranger = await resultOf(job('deduct', { username: 'nobody', amount: 1 }));
  assert.deepEqual([stranger.ok, stranger.error], [false, 'Not enough Brie Bucks']);
  assert.equal(puts(), before, 'a short deduct never reaches the adjust route');
  assert.equal(mi.users.get('alice')!.amount, 12);

  // bad jobs are refused, unknown kinds are ignored
  assert.equal((await resultOf(job('add', { username: 'a/../b', amount: 1 }))).ok, false);
  assert.equal((await resultOf(job('add', { username: 'alice', amount: -4 }))).ok, false);
  assert.equal((await resultOf(job('add', { username: 'alice', amount: 1, currencyId: 'not-a-guid' }))).ok, false);
  const weird = job('format-disk', { username: 'alice' });
  si.s.jobs.push(weird);
  await resultOf(job('balance', { username: 'alice' }));
  assert.ok(!si.s.results.some(r => r.id === weird.id), 'an unknown kind gets no result');
  assert.ok(!mi.calls.some(c => c.url.includes('format')), 'and touches nothing');

  // the result is retried (500 twice, then a dropped connection) and arrives once
  const retried = job('balance', { username: 'alice' });
  si.s.resultAttempts = 0;
  si.s.resultMode = (r, attempt) => (r.id === retried.id ? (attempt === 1 || attempt === 2 ? '500' : attempt === 3 ? 'drop' : 'ok') : 'ok');
  assert.equal((await resultOf(retried)).balance, 12);
  assert.equal(si.s.resultAttempts, 4, '3 retries after the first try');
  si.s.resultMode = () => 'ok';

  // a late result: deduct is given back, add is taken back, balance needs nothing
  const lateDeduct = job('deduct', { username: 'alice', amount: 4 });
  si.s.resultMode = r => (r.id === lateDeduct.id ? 'late' : 'ok');
  si.s.jobs.push(lateDeduct);
  await waitFor('deduct undone', () => svc.state.jobs.some(j => /deduct was given back/.test(j.detail)));
  assert.equal(mi.users.get('alice')!.amount, 12, 'deduct then add back');
  assert.equal(mi.chat.length, 2, 'no chat message for a deduct the site refused');
  const lateAdd = job('add', { username: 'alice', amount: 6 });
  si.s.resultMode = r => (r.id === lateAdd.id ? 'late' : 'ok');
  si.s.jobs.push(lateAdd);
  await waitFor('add undone', () => svc.state.jobs.some(j => /add was taken back/.test(j.detail)));
  assert.equal(mi.users.get('alice')!.amount, 12, 'add then take back');
  const lateBalance = job('balance', { username: 'alice' });
  si.s.resultMode = r => (r.id === lateBalance.id ? 'late' : 'ok');
  const putsBefore = puts();
  si.s.jobs.push(lateBalance);
  await waitFor('late balance seen', () => svc.state.jobs.some(j => j.kind === 'balance' && /^Late/.test(j.detail)));
  assert.equal(puts(), putsBefore, 'a late balance changes nothing');
  si.s.resultMode = () => 'ok';
  assert.ok(svc.state.jobs.length <= 50);
  assert.equal(svc.state.currency, 'Brie Bucks');

  // the site goes away and comes back: the loop backs off and reconnects
  si.s.pollMode = '500';
  await waitFor('offline', () => svc.state.site === 'offline' && svc.state.tray === 'partly');
  si.s.pollMode = 'ok';
  await waitFor('reconnected', () => svc.state.site === 'connected');

  // Mix It Up goes away: the job is answered at once, and it says hello again when it returns
  await new Promise<void>(r => miSrv.server.close(() => r()));
  const t0 = Date.now();
  const down = await resultOf(job('balance', { username: 'alice' }));
  assert.deepEqual([down.ok, down.error], [false, 'Mix It Up is not running']);
  assert.ok(Date.now() - t0 < 1000, 'answered at once, not after a timeout');
  await waitFor('mix lost', () => !svc.state.mix.found && svc.state.tray === 'partly');
  const hellosBefore = si.s.hellos.length;
  await new Promise<void>(r => miSrv.server.listen(Number(new URL(miSrv.url).port), '127.0.0.1', r));
  await waitFor('hello after Mix It Up returns', () => si.s.hellos.length > hellosBefore);

  await obsChecks();

  // a revoked token: the loop stops and says "Pair again"
  si.s.pollMode = '401';
  await waitFor('revoked', () => svc.state.site === 'revoked');
  assert.equal(svc.state.siteError, 'Pair again');
  await svc.stop();
  const polls = si.s.polls;
  await new Promise(r => setTimeout(r, 150));
  assert.equal(si.s.polls, polls, 'no polling after a 401');
  assert.ok(changes > 0);

  // settings: the token and the OBS password are never written in plain text
  const dir = mkdtempSync(join(tmpdir(), 'tcg-bridge-'));
  const cipher = { encrypt: async (s: string) => Buffer.from(s.split('').reverse().join('')), decrypt: async (b: Buffer) => b.toString().split('').reverse().join('') };
  const store = new FileSettingsStore(dir, cipher);
  assert.equal((await store.load()).site, 'https://cheesytcg.app');
  assert.equal((await store.load()).startWithWindows, true);
  const full = { site: 'https://example.test', token: 'secret-token', pairedAs: 'PC', startWithWindows: false, obsEnabled: true, obsAddress: 'ws://localhost:4456', obsPassword: 'obs-secret' };
  await store.save(full);
  const saved = readFileSync(join(dir, 'settings.json'), 'utf8');
  assert.ok(!saved.includes('secret-token') && !saved.includes('obs-secret'));
  assert.deepEqual(await store.load(), full);
  rmSync(dir, { recursive: true, force: true });

  miSrv.server.close();
  siSrv.server.close();
  console.log('TCG Bridge checks passed');
}

main().then(() => process.exit(0), e => { console.error(e); process.exit(1); });
