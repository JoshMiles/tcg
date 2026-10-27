// TCG Bridge checks: a fake Mix It Up Developer API and a fake TCG site, both local HTTP servers, driven through the real service.
// Run from bridge/: npm run check   (or from the repo root: npx tsx bridge/scripts/check.ts). No Electron needed.
import assert from 'node:assert/strict';
import { createServer, request as httpRequest, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Alerts, snapshotOf, type Snapshot } from '../src/alerts';
import { buttonUrl, ControlServer, Hotkeys, newControlKey, noHotkeys, parseButton, type ControlAction } from '../src/control';
import { commandWait } from '../src/jobs';
import { diagnosticsText } from '../src/diagnostics';
import { defaultMixItUpPath, isMixItUpExe, startMixItUp } from '../src/launch';
import { Logger, redact } from '../src/log';
import { MixItUpClient } from '../src/mixitup';
import { cleanObsAddress, isOverlayUrl, ObsWatcher } from '../src/obs';
import { checkObs, sendTestChat, testMixItUp, TEST_CHAT_MESSAGE } from '../src/selftest';
import { BridgeService } from '../src/service';
import { defaults, FileSettingsStore } from '../src/settings';
import { CHECK_NOTE, DOWNLOAD_NOTE, Startup } from '../src/startup';
import { checkText, releaseUrl, updatedTo, updateText } from '../src/update';
import { FakeObs, PW_123 } from './fake-obs';
import { cleanSite, pair, SiteClient, SiteError, type BridgeJob, type BridgeResult } from '../src/site';

const CUR = '11111111-2222-3333-4444-555555555555';
const ALICE = 'aaaaaaaa-0000-0000-0000-000000000001';
const CMD_SOUND = 'cccccccc-0000-0000-0000-000000000001';
const CMD_OFF = 'cccccccc-0000-0000-0000-000000000002';
const CMD_LIGHTS = 'cccccccc-0000-0000-0000-000000000003';
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
  // Mix It Up's commands (CommandV1Controller): a disabled one and one with no name are not offered to the site
  const commands = [
    { ID: CMD_SOUND, Name: 'Big pull sound', IsEnabled: true },
    { ID: CMD_OFF, Name: 'Switched off', IsEnabled: false },
    { ID: 'cccccccc-0000-0000-0000-000000000009', Name: '  ', IsEnabled: true },
  ];
  const ran: { id: string; args: unknown }[] = [];
  const asUser = (u: FakeUser) => ({ ID: u.ID, TwitchID: u.TwitchID, Username: u.Username, CurrencyAmounts: [{ ID: CUR, Name: 'Brie Bucks', Amount: u.amount }], InventoryAmounts: [] });
  const handler: Handler = (req, res, body) => {
    const url = req.url ?? '';
    const json = body ? JSON.parse(body) : undefined;
    calls.push({ method: req.method ?? '', url, body: json });
    if (url === '/api/status/version') return send(res, 200, '1.10.0.0', 'text/plain');
    if (url === '/api/currency') return send(res, 200, [{ ID: CUR, Name: 'Brie Bucks' }]);
    if (url === '/api/commands' && req.method === 'GET') return send(res, 200, commands.map(c => ({ ID: c.ID, Name: c.Name, IsEnabled: c.IsEnabled, Category: 'Chat', GroupName: '' })));
    const rc = /^\/api\/commands\/([^/]+)$/.exec(url);
    if (rc && req.method === 'POST') {
      const c = commands.find(x => x.ID === rc[1]);
      if (!c) return send(res, 404, { Message: `Unable to find command: ${rc[1]}.` });
      ran.push({ id: c.ID, args: json });
      return send(res, 200, { ID: c.ID, Name: c.Name, IsEnabled: c.IsEnabled });
    }
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
  return { users, calls, chat, commands, ran, handler };
}

// ── Fake site: the bridge API from app/api/bridge/* ──
function fakeSite() {
  const s = {
    jobs: [] as BridgeJob[],
    hellos: [] as { version: string; currencies: { id: string; name: string }[]; commands?: { id: string; name: string }[] }[],
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
    if (req.url === '/api/bridge/hello') { s.hellos.push(json); return send(res, 200, { ok: true, channel: 'Cheesygidds', currencyId: CUR }); }
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
  const logDir = mkdtempSync(join(tmpdir(), 'tcg-bridge-log-'));
  const logger = new Logger(logDir);
  for (const secret of [TOKEN, 'pw-123']) logger.addSecret(secret);
  const client = new SiteClient(siSrv.url, TOKEN, '0.0.0');
  const obsOff = { enabled: false, address: 'ws://127.0.0.1:4455', password: '' };
  const obs = new ObsWatcher({ site: siSrv.url, report: b => client.report(b), backoffMs: { min: 10, max: 40 }, debounceMs: 30, reportMs: 20, heartbeatMs: 200, clipAfterMs: 30 }, obsOff);
  const svc = new BridgeService({
    client, mix, obs, onChange: () => { changes++; }, log: logger.log,
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
    assert.deepEqual(lastObs(), { type: 'obs', connected: true, scene: 'Gameplay', overlay: { found: true, inProgram: true, visible: true, sourceName: 'TCG Overlay' }, scenes: ['Gameplay', 'Just Chatting'], sources: ['Cam'] });
    assert.deepEqual(streamReports(), [false], 'the stream state is reported once on connect');
    assert.equal(svc.state.tray, 'connected');
    assert.deepEqual(snapshotOf(svc.state), { site: true, mix: true, obs: true, streaming: false }, 'what the alerts are fed');
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

    // "Check OBS" runs the check now and says what it sees
    const seen = await checkObs(svc.obs);
    assert.equal(seen.ok, true);
    assert.match(seen.text, /Scene Gameplay, not streaming\. TCG Overlay is visible in Gameplay\./);

    // pull-event (55.8): save a clip, switch scene and back, show a source and hide it again; names must be ones OBS reported
    const pull = (extra: Partial<BridgeJob>) => resultOf(job('pull-event', extra));
    const noBuffer = await pull({ phase: 'reveal', clip: true });
    assert.deepEqual([noBuffer.ok, noBuffer.error], [false, 'The OBS replay buffer is off, so no clip was saved']);
    fake.replayBuffer = true;
    assert.equal((await pull({ phase: 'reveal', clip: true })).ok, true);
    await waitFor('clip saved after the delay', () => fake.saved === 1);
    const badScene = await pull({ phase: 'reveal', scene: 'Nope', secs: 1 });
    assert.deepEqual([badScene.ok, badScene.error], [false, 'OBS has no scene called Nope']);
    assert.equal(fake.scene, 'Gameplay');
    assert.equal((await pull({ phase: 'reveal', scene: 'Just Chatting', secs: 1 })).ok, true);
    assert.equal(fake.scene, 'Just Chatting');
    await waitFor('back to the first scene', () => fake.scene === 'Gameplay');
    cam.sceneItemEnabled = false;
    const badSource = await pull({ phase: 'start', source: 'Nope', holdMs: 50 });
    assert.deepEqual([badSource.ok, badSource.error], [false, 'OBS has no source called Nope in the current scene']);
    assert.equal(cam.sceneItemEnabled, false);
    assert.equal((await pull({ phase: 'start', source: 'Cam', holdMs: 100 })).ok, true);
    assert.equal(cam.sceneItemEnabled, true);
    await waitFor('source hidden again', () => cam.sceneItemEnabled === false);
    cam.sceneItemEnabled = true;

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
    const lostCheck = await checkObs(svc.obs);
    assert.deepEqual([lostCheck.ok, /not connected to OBS/.test(lostCheck.text)], [false, true]);
    const goneT0 = Date.now();
    const gone = await resultOf(job('obs-refresh'));
    assert.deepEqual([gone.ok, gone.error], [false, 'TCG Bridge is not connected to OBS']);
    assert.ok(Date.now() - goneT0 < 1000);
    await fake.listen();
    await waitFor('reconnected to OBS', () => svc.state.obs.connected && fake.identified > identified);
    await waitFor('back in the site', () => lastObs()?.connected === true && lastObs()?.overlay.visible === true);
    assert.equal(svc.state.tray, 'connected');

    // "Start the replay buffer when the stream starts": off by default, on starts it when the stream goes live
    fake.replayBuffer = false;
    fake.emit('StreamStateChanged', { outputActive: true, outputState: 'OBS_WEBSOCKET_OUTPUT_STARTED' });
    await new Promise(r => setTimeout(r, 100));
    assert.equal(fake.replayBuffer, false, 'the switch is off');
    await svc.reconfigureObs({ enabled: true, address, password: 'pw-123', startReplay: true });
    await waitFor('reconnected with the switch', () => svc.state.obs.connected);
    fake.emit('StreamStateChanged', { outputActive: true, outputState: 'OBS_WEBSOCKET_OUTPUT_STARTED' });
    await waitFor('replay buffer started', () => fake.replayBuffer);

    // switching OBS off in the app: the site hears it, and the tray stops caring
    await svc.reconfigureObs({ enabled: false, address, password: '' });
    assert.equal(svc.state.obs.enabled, false);
    await waitFor('site told OBS is off', () => lastObs()?.connected === false);
    assert.equal(svc.state.tray, 'connected');
    const off = await resultOf(job('obs-refresh'));
    assert.deepEqual([off.ok, off.error], [false, 'OBS is switched off in TCG Bridge']);
    assert.deepEqual(await checkObs(svc.obs), { ok: false, text: 'OBS is switched off in TCG Bridge' });
    assert.equal(snapshotOf(svc.state).obs, null, 'OBS off is not tracked');
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
  assert.deepEqual(si.s.hellos[0], { version: '1.10.0.0', currencies: [{ id: CUR, name: 'Brie Bucks' }], commands: [{ id: CMD_SOUND, name: 'Big pull sound' }] }); // the version stays a string; hello carries the enabled, named commands
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

  // run-command (ROADMAP 55.6d): only an id the app itself reported is run, with the args as a JSON array of strings
  const ranOk = await resultOf(job('run-command', { commandId: CMD_SOUND, args: ['alice', 'Gouda Goat', 'Epic', 'Full Art Holo'] }));
  assert.equal(ranOk.ok, true);
  assert.deepEqual(mi.ran, [{ id: CMD_SOUND, args: ['alice', 'Gouda Goat', 'Epic', 'Full Art Holo'] }], 'POST /api/commands/{id} with the four arguments');
  assert.equal((await resultOf(job('run-command', { commandId: CMD_SOUND.toUpperCase(), args: ['bob'] }))).ok, true, 'ids compare without case');
  assert.equal((await resultOf(job('run-command', { commandId: CMD_SOUND, args: ['x', 5, null, 'y'] as unknown as string[] }))).ok, true);
  assert.deepEqual(mi.ran.at(-1)!.args, ['x', 'y'], 'non-string args are dropped');
  const ranBefore = mi.ran.length;
  for (const bad of [CMD_OFF, CMD_LIGHTS, 'not-a-guid', '', '../status/version']) {
    const refused = await resultOf(job('run-command', { commandId: bad, args: ['alice'] }));
    assert.deepEqual([refused.ok, refused.error], [false, 'That Mix It Up command is not in the list this app reported'], `refused: ${bad}`);
  }
  assert.equal((await resultOf(job('run-command', { args: ['alice'] }))).ok, false, 'no command id');
  assert.equal(mi.ran.length, ranBefore, 'an unreported id never reaches Mix It Up');
  assert.ok(!mi.calls.some(c => c.url.includes('..')));

  // delayMs: a run-command waits for the card reveal (counted from when the site queued it, at most 15 s) and holds nothing else up
  const T = 1_000_000;
  const rc = (o: Partial<BridgeJob>): BridgeJob => ({ id: 'x', kind: 'run-command', at: T, ...o });
  assert.equal(commandWait(rc({ delayMs: 3000 }), T), 3000, 'the full delay when it has just been queued');
  assert.equal(commandWait(rc({ delayMs: 3000 }), T + 1000), 2000, 'less the time already spent in transit');
  assert.equal(commandWait(rc({ delayMs: 3000 }), T + 9000), 0, 'never negative');
  assert.equal(commandWait(rc({ delayMs: 99_000 }), T), 15_000, 'capped at 15 s');
  assert.equal(commandWait(rc({}), T), 0, 'no delay from an older site');
  assert.equal(commandWait(rc({ delayMs: NaN }), T), 0);
  assert.equal(commandWait({ id: 'x', kind: 'deduct', delayMs: 3000, at: T }, T), 0, 'only run-command waits');
  const slow = job('run-command', { commandId: CMD_SOUND, args: ['alice', 'Gouda Goat', 'Legendary', 'Golden'], delayMs: 500 });
  const tSlow = Date.now();
  si.s.jobs.push(slow);
  const quick = await resultOf(job('deduct', { username: 'alice', amount: 1 }));
  assert.equal(quick.ok, true, 'a deduct queued right behind the sound still runs');
  assert.ok(Date.now() - tSlow < 400 && !si.s.results.some(r => r.id === slow.id) && mi.ran.length === ranBefore, 'at once, while the sound is still waiting');
  await waitFor('delayed command result', () => si.s.results.some(r => r.id === slow.id));
  assert.ok(Date.now() - tSlow >= 450, 'the command waited about its delay');
  assert.equal(si.s.results.find(r => r.id === slow.id)!.ok, true);
  assert.deepEqual(mi.ran.at(-1), { id: CMD_SOUND, args: ['alice', 'Gouda Goat', 'Legendary', 'Golden'] }, 'then ran with its arguments');
  await resultOf(job('add', { username: 'alice', amount: 1 }));
  assert.equal(mi.users.get('alice')!.amount, 12, 'balance put back for the checks below');

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

  // self-tests: the site's hello gave the channel and the chosen currency; the balance test reads a Twitch name
  assert.deepEqual([svc.state.channel, svc.state.currencyId], ['Cheesygidds', CUR]);
  const tm = await testMixItUp(mix, ' Alice ', svc.state.currencyId);
  assert.equal(tm.ok, true);
  assert.match(tm.text, /Mix It Up 1\.10\.0\.0 answers\. The currency is Brie Bucks\. alice has 12 Brie Bucks\./);
  assert.match((await testMixItUp(mix, 'nobody', CUR)).text, /does not know nobody yet, so they have 0 Brie Bucks/);
  const callsBefore = mi.calls.length;
  assert.equal((await testMixItUp(mix, 'a/../b', CUR)).ok, false, 'a bad name is refused before anything is asked');
  assert.equal(mi.calls.length, callsBefore);
  assert.match((await testMixItUp(mix, 'alice', 'ffffffff-0000-0000-0000-000000000000')).text, /currency the site chose is not in Mix It Up/);
  assert.match((await testMixItUp(mix, 'alice', '')).text, /has not chosen a currency/);
  const chatBefore = mi.chat.length;
  assert.equal((await sendTestChat(mix)).ok, true);
  assert.deepEqual(mi.chat.slice(chatBefore), [{ Message: TEST_CHAT_MESSAGE, SendAsStreamer: false }]);
  assert.equal(TEST_CHAT_MESSAGE, 'TCG Bridge test message');

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
  assert.match((await testMixItUp(mix, 'alice', CUR)).text, /Mix It Up does not answer/);
  assert.deepEqual(await sendTestChat(mix), { ok: false, text: 'Mix It Up is not running' });
  const hellosBefore = si.s.hellos.length;
  await new Promise<void>(r => miSrv.server.listen(Number(new URL(miSrv.url).port), '127.0.0.1', r));
  await waitFor('hello after Mix It Up returns', () => si.s.hellos.length > hellosBefore);

  // the command list is sent again on a timer (every 5 minutes in the app), so a command added in Mix It Up reaches the site and can then run
  {
    const si2 = fakeSite();
    const siSrv2 = await listen(si2.handler);
    const client2 = new SiteClient(siSrv2.url, TOKEN, '0.0.0');
    const obs2 = new ObsWatcher({ site: siSrv2.url, report: b => client2.report(b), backoffMs: { min: 10, max: 40 }, debounceMs: 30, reportMs: 20, heartbeatMs: 200, clipAfterMs: 30 }, obsOff);
    const svc2 = new BridgeService({ client: client2, mix, obs: obs2, onChange: () => undefined, mixCheckMs: 20, commandsMs: 150, backoffMs: { min: 10, max: 40 }, retryMs: 5 });
    svc2.start();
    await waitFor('first hello', () => si2.s.hellos.length >= 1);
    assert.deepEqual(si2.s.hellos[0].commands, [{ id: CMD_SOUND, name: 'Big pull sound' }]);
    mi.commands.push({ ID: CMD_LIGHTS, Name: 'Lights', IsEnabled: true });
    await waitFor('commands sent again', () => si2.s.hellos.some(h => h.commands?.some(c => c.id === CMD_LIGHTS)));
    const lights = job('run-command', { commandId: CMD_LIGHTS, args: ['alice'] });
    si2.s.jobs.push(lights);
    await waitFor('lights ran', () => si2.s.results.some(r => r.id === lights.id));
    assert.equal(si2.s.results.find(r => r.id === lights.id)!.ok, true);
    assert.equal(mi.ran.at(-1)!.id, CMD_LIGHTS);
    await svc2.stop();
    await new Promise<void>(r => siSrv2.server.close(() => r()));
    mi.commands.pop();
  }

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

  // ── Alerts: a pure class fed snapshots and a clock ──
  const up = (o: Partial<Snapshot> = {}): Snapshot => ({ site: true, mix: true, obs: true, streaming: true, ...o });
  const kinds = (n: { part: string; kind: string }[]) => n.map(x => `${x.part} ${x.kind}`);
  let al = new Alerts();
  assert.deepEqual(al.update(up(), 0), []);
  assert.deepEqual([al.update(up({ site: false }), 1000), al.update(up({ site: false }), 6000), al.update(up(), 7000)], [[], [], []], 'a short drop never alerts, nor a return');
  al.update(up({ mix: false }), 10_000);
  assert.deepEqual(al.update(up({ mix: false }), 24_999), [], 'not before 15 s');
  const drop = al.update(up({ mix: false }), 25_000);
  assert.deepEqual(kinds(drop), ['mix drop']);
  assert.equal(drop[0].body, 'Mix It Up stopped answering. Is it still running, with its Developer API on?');
  assert.deepEqual(al.update(up({ mix: false }), 60_000), [], 'one alert per outage');
  assert.deepEqual(kinds(al.update(up(), 61_000)), ['mix back']);
  assert.deepEqual(al.update(up(), 62_000), [], 'and one return');
  al.update(up({ mix: false }), 70_000);
  assert.deepEqual(al.update(up({ mix: false }), 100_000), [], 'a second drop within 2 minutes of the last alert is held back');
  assert.deepEqual(kinds(al.update(up({ mix: false }), 145_000)), ['mix drop'], 'and shown once the 2 minutes are over, if it is still down');
  // only while live
  al = new Alerts();
  al.update(up({ streaming: false }), 0);
  al.update(up({ site: false, streaming: false }), 1000);
  assert.deepEqual(al.update(up({ site: false, streaming: false }), 30_000), [], 'not live: no alert');
  assert.deepEqual(kinds(al.update(up({ site: false, streaming: true }), 31_000)), ['site drop'], 'it goes live while still down: alert');
  // OBS lost: the last state it reported counts
  al = new Alerts();
  al.update(up(), 0);
  al.update(up({ obs: false, streaming: null, site: false }), 1000);
  assert.deepEqual(kinds(al.update(up({ obs: false, streaming: null, site: false }), 20_000)).sort(), ['obs drop', 'site drop'], 'OBS was live when it was lost');
  al = new Alerts();
  al.update(up({ streaming: false }), 0);
  al.update(up({ obs: false, streaming: null, site: false }), 1000);
  assert.deepEqual(al.update(up({ obs: false, streaming: null, site: false }), 20_000), [], 'OBS was not live when it was lost');
  // OBS switched off in the app: no live signal, so any drop alerts; a revoked site is not a drop
  al = new Alerts();
  al.update(up({ obs: null, streaming: null }), 0);
  al.update(up({ obs: null, streaming: null, mix: false }), 1000);
  assert.deepEqual(kinds(al.update(up({ obs: null, streaming: null, mix: false }), 16_000)), ['mix drop']);
  al = new Alerts();
  al.update(up({ obs: null, streaming: null }), 0);
  al.update(up({ obs: null, streaming: null, site: null }), 1000);
  assert.deepEqual(al.update(up({ obs: null, streaming: null, site: null }), 60_000), []);
  // a part that never came up is not a drop
  al = new Alerts();
  al.update(up({ mix: false }), 0);
  assert.deepEqual(al.update(up({ mix: false }), 60_000), []);

  // ── The log: one file a day, kept 7 days, never a secret ──
  const day = (offset: number) => { const d = new Date(Date.now() - offset * 86_400_000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const pruneDir = mkdtempSync(join(tmpdir(), 'tcg-bridge-prune-'));
  for (const name of [`bridge-${day(10)}.log`, `bridge-${day(8)}.log`, `bridge-${day(6)}.log`, 'notes.txt']) writeFileSync(join(pruneDir, name), 'x');
  const pruned = new Logger(pruneDir);
  assert.deepEqual(readdirSync(pruneDir).sort(), [`bridge-${day(6)}.log`, 'notes.txt'].sort(), 'files older than 7 days go, other files stay');
  pruned.log('first\nsecond');
  assert.ok(readdirSync(pruneDir).includes(`bridge-${day(0)}.log`), 'today has its own file');
  assert.match(readFileSync(join(pruneDir, `bridge-${day(0)}.log`), 'utf8'), /^\S+ first second\n$/, 'one line, with a time');
  rmSync(pruneDir, { recursive: true, force: true });

  const SECRET_KEY = 'SECRETKEY';
  const code = 'ABCD-EFGH';
  logger.addSecret(code);
  for (const line of [
    `poll failed, header Bearer ${TOKEN}`, 'Authorization: Bearer someOtherToken123', `open https://cheesytcg.app/overlay.html?key=${SECRET_KEY} failed`,
    `x key=${SECRET_KEY}2 y`, 'obs said wrong password pw-123', `pairing with ${code}`, 'secret=hunter22 token=abc123 password=zzzz1',
  ]) logger.log(line);
  svc.state.jobs.unshift({ at: Date.now(), kind: 'say', ok: false, detail: `failed Bearer ${TOKEN} key=${SECRET_KEY} pw-123`, ms: 7 });
  const text = diagnosticsText({ versions: { app: '0.3.0', electron: '45.0.0', windows: 'Windows 11' }, site: siSrv.url, paired: true, alerts: true, state: svc.state }, logger.redact);
  const logged = readdirSync(logDir).map(f => readFileSync(join(logDir, f), 'utf8')).join('\n');
  for (const [what, out] of [['the log', logged], ['the diagnostics', text]] as const) {
    for (const secret of [TOKEN, 'pw-123', SECRET_KEY, code, 'someOtherToken123', 'hunter22', 'abc123', 'zzzz1']) assert.ok(!out.includes(secret), `${what} holds ${secret}`);
  }
  assert.ok(logged.includes('Bearer [hidden]') && logged.includes('[overlay address]') && logged.includes('key=[hidden]'));
  assert.match(logged, /Job balance ok in \d+ ms/, 'jobs are logged with kind, result and time');
  assert.match(logged, /Job balance failed in \d+ ms: Mix It Up is not running/, 'a failed job with its error');
  assert.match(logged, /Site: offline \(poll: the site answered 500\)/, 'a site drop');
  assert.match(logged, /Mix It Up: not found/);
  assert.match(logged, /OBS: connected/);
  assert.equal(redact('Bearer abc', []), 'Bearer [hidden]');
  assert.equal(redact('ab key=1234 and ok', ['ab']), 'ab key=[hidden] and ok', 'a secret shorter than 4 characters is not hunted');
  assert.match(text, /^TCG Bridge 0\.3\.0, Electron 45\.0\.0, Windows 11\n/);
  assert.match(text, /Mix It Up: found, version 1\.10\.0\.0, currency Brie Bucks/);
  const jobLines = text.split('Last 20 jobs (newest first):\n')[1].split('\n');
  assert.ok(jobLines.length === 20 && jobLines.every(l => /^\d{4}-\d\d-\d\dT/.test(l)), 'the last 20 jobs, one per line');
  assert.match(jobLines[0], / say failed 7ms - failed Bearer \[hidden\] key=\[hidden\] \[hidden\]$/);
  assert.match(diagnosticsText({ versions: { app: '1', electron: '2', windows: '3' }, site: 'https://x.test', paired: false, alerts: false, state: null }, t => t), /paired: no/);
  rmSync(logDir, { recursive: true, force: true });

  // ── Starting Mix It Up: only a file called MixItUp.exe, at the saved or the default path, no shell ──
  const exeDir = mkdtempSync(join(tmpdir(), 'tcg-bridge-exe-'));
  const savedExe = join(exeDir, 'MixItUp.exe');
  writeFileSync(savedExe, 'x');
  writeFileSync(join(exeDir, 'notepad.exe'), 'x');
  mkdirSync(join(exeDir, 'dir', 'MixItUp.exe'), { recursive: true });
  assert.deepEqual([savedExe, join(exeDir, 'notepad.exe'), join(exeDir, 'missing', 'MixItUp.exe'), join(exeDir, 'dir', 'MixItUp.exe'), 'MixItUp.exe', ''].map(isMixItUpExe), [true, false, false, false, false, false]);
  const spawned: { cmd: string; args: string[]; opts: Record<string, unknown> }[] = [];
  const fakeSpawn = (fail: boolean) => ((cmd: string, args: string[], opts: Record<string, unknown>) => {
    spawned.push({ cmd, args, opts });
    const child = new EventEmitter() as ChildProcess;
    child.unref = () => child;
    queueMicrotask(() => (fail ? child.emit('error', new Error('EACCES')) : child.emit('spawn')));
    return child;
  }) as unknown as Parameters<typeof startMixItUp>[1];
  const home = process.env.LOCALAPPDATA;
  process.env.LOCALAPPDATA = join(exeDir, 'empty');
  assert.equal(defaultMixItUpPath(), join(exeDir, 'empty', 'MixItUp', 'MixItUp.exe'));
  const none = await startMixItUp(join(exeDir, 'notepad.exe'), fakeSpawn(false));
  assert.deepEqual([none.ok, spawned.length], [false, 0], 'a saved path that is not MixItUp.exe is never launched');
  const started = await startMixItUp(savedExe, fakeSpawn(false));
  assert.deepEqual([started.ok, spawned[0].cmd, spawned[0].args, spawned[0].opts.detached, spawned[0].opts.shell, spawned[0].opts.stdio], [true, savedExe, [], true, undefined, 'ignore'], 'detached, no shell');
  mkdirSync(join(exeDir, 'def', 'MixItUp'), { recursive: true });
  writeFileSync(join(exeDir, 'def', 'MixItUp', 'MixItUp.exe'), 'x');
  process.env.LOCALAPPDATA = join(exeDir, 'def');
  assert.equal((await startMixItUp('', fakeSpawn(false))).ok && spawned[1].cmd === join(exeDir, 'def', 'MixItUp', 'MixItUp.exe'), true, 'nothing saved: the default path');
  const failed = await startMixItUp(savedExe, fakeSpawn(true));
  assert.deepEqual([failed.ok, !failed.ok && /would not start/.test(failed.error)], [false, true]);
  if (home === undefined) delete process.env.LOCALAPPDATA; else process.env.LOCALAPPDATA = home;
  rmSync(exeDir, { recursive: true, force: true });

  // ── Updates ──
  assert.equal(releaseUrl('0.3.0'), 'https://github.com/JoshMiles/tcg/releases/tag/bridge-v0.3.0');
  assert.deepEqual([updatedTo('', '0.3.0'), updatedTo('0.3.0', '0.3.0'), updatedTo('0.2.0', '0.3.0')], ['', '', '0.3.0'], 'first run and no change say nothing');
  assert.equal(checkText('0.3.0', null, { stage: 'idle' }), 'You are up to date (version 0.3.0)');
  assert.equal(checkText('0.3.0', '0.4.0', { stage: 'idle' }), 'Downloading version 0.4.0');
  assert.match(checkText('0.3.0', '0.4.0', { stage: 'ready', version: '0.4.0' }), /^Version 0\.4\.0 is ready.*restart to update/);
  assert.equal(updateText({ stage: 'idle' }), '');

  // ── Start-up window: fake updater events and a fake clock ──
  {
    const fresh = new Startup(0);
    assert.deepEqual([fresh.step.text, fresh.step.handover, fresh.step.progress], ['Checking for updates', false, null]);
    // no update: straight to "Starting" and the real window
    let s = new Startup(0);
    s.event({ type: 'checking' }, 100);
    assert.equal(s.tick(2000).handover, false, 'still checking at 2 s');
    let st = s.event({ type: 'none' }, 2000);
    assert.deepEqual([st.phase, st.text, st.handover, st.install, st.note], ['starting', 'Starting', true, false, '']);
    // an update: progress, then "Installing update" and the install flag
    s = new Startup(0);
    s.event({ type: 'checking' }, 0);
    st = s.event({ type: 'available', version: '0.6.0' }, 500);
    assert.deepEqual([st.phase, st.text, st.progress, st.handover], ['downloading', 'Downloading update 0.6.0', 0, false]);
    assert.equal(s.event({ type: 'progress', percent: 40.4 }, 1000).progress, 40);
    assert.equal(s.event({ type: 'progress', percent: 140 }, 1100).progress, 100, 'clamped');
    assert.equal(s.tick(20_000).handover, false, 'a download is not cut off by the 8 s check limit');
    st = s.event({ type: 'downloaded', version: '0.6.0' }, 21_000);
    assert.deepEqual([st.phase, st.text, st.progress, st.install, st.handover], ['installing', 'Installing update', 100, true, false]);
    // offline: the check errors at once, so start the current version, with a note
    s = new Startup(0);
    s.event({ type: 'checking' }, 0);
    st = s.event({ type: 'error' }, 50);
    assert.deepEqual([st.phase, st.handover, st.install, st.note], ['starting', true, false, CHECK_NOTE]);
    // a slow check: at 8 s start anyway, with the note
    s = new Startup(1000);
    s.event({ type: 'checking' }, 1000);
    assert.equal(s.tick(8999).handover, false, 'not before 8 s');
    st = s.tick(9000);
    assert.deepEqual([st.phase, st.handover, st.note, st.update.stage], ['starting', true, CHECK_NOTE, 'idle']);
    // a failed download starts the current version, with its own note
    s = new Startup(0);
    s.event({ type: 'available', version: '0.6.0' }, 100);
    st = s.event({ type: 'error' }, 3000);
    assert.deepEqual([st.phase, st.handover, st.install, st.note], ['starting', true, false, DOWNLOAD_NOTE]);
    // a download that goes quiet for 30 s is given up on too
    s = new Startup(0);
    s.event({ type: 'available', version: '0.6.0' }, 100);
    s.event({ type: 'progress', percent: 10 }, 5000);
    assert.equal(s.tick(34_999).handover, false);
    assert.deepEqual([s.tick(35_000).handover, s.step.note], [true, DOWNLOAD_NOTE]);
    // an update-downloaded after the 8 s hand-over is not installed at start-up: it becomes "ready, restart to update"
    s = new Startup(0);
    s.event({ type: 'checking' }, 0);
    s.tick(8000);
    st = s.event({ type: 'available', version: '0.6.0' }, 9000);
    assert.deepEqual([st.handover, st.update, st.note], [true, { stage: 'downloading', version: '0.6.0' }, '']);
    st = s.event({ type: 'downloaded', version: '0.6.0' }, 20_000);
    assert.deepEqual([st.phase, st.install, st.update], ['starting', false, { stage: 'ready', version: '0.6.0' }]);
    assert.match(updateText(st.update), /ready.*restart to update/);
    // later events once running never come back to the start-up window
    assert.equal(s.event({ type: 'checking' }, 21_000).phase, 'starting');
  }

  // settings: the token and the OBS password are never written in plain text
  const dir = mkdtempSync(join(tmpdir(), 'tcg-bridge-'));
  const cipher = { encrypt: async (s: string) => Buffer.from(s.split('').reverse().join('')), decrypt: async (b: Buffer) => b.toString().split('').reverse().join('') };
  const store = new FileSettingsStore(dir, cipher);
  assert.equal((await store.load()).site, 'https://cheesytcg.app');
  assert.equal((await store.load()).startWithWindows, true);
  assert.deepEqual([(await store.load()).alerts, (await store.load()).startMixItUp, (await store.load()).mixItUpPath, defaults().lastSeenVersion], [true, false, '', ''], 'alerts on, starting Mix It Up off');
  const full = { site: 'https://example.test', token: 'secret-token', pairedAs: 'PC', startWithWindows: false, obsEnabled: true, obsAddress: 'ws://localhost:4456', obsPassword: 'obs-secret', obsStartReplay: true, alerts: false, startMixItUp: true, mixItUpPath: 'C:\\Mix\\MixItUp.exe', lastSeenVersion: '0.2.0', controlKey: 'abcdefghij0123456789', hotkeys: { refresh: 'Ctrl+Alt+R', pause: '', lastBuff: 'Ctrl+Alt+B' } };
  await store.save(full);
  const saved = readFileSync(join(dir, 'settings.json'), 'utf8');
  assert.ok(!saved.includes('secret-token') && !saved.includes('obs-secret'));
  assert.deepEqual(await store.load(), full);
  rmSync(dir, { recursive: true, force: true });

  // control from the PC (55.9): the Stream Deck server
  {
    const key = newControlKey();
    assert.match(key, /^[A-Za-z0-9_-]{16,64}$/);
    assert.notEqual(key, newControlKey(), 'a new key each time');
    const seen: ControlAction[] = [];
    const ctl = new ControlServer(key, async a => { seen.push(a); return a.action === 'refresh' ? { ok: true, text: 'Refreshing' } : { ok: false, text: 'Nope' }; }, 0);
    await ctl.start();
    assert.equal(ctl.error, '');
    const port = ctl.listeningPort;
    assert.ok(port > 0);
    const get = (path: string, headers: Record<string, string> = {}) => fetch(`http://127.0.0.1:${port}${path}`, { headers });
    assert.deepEqual(parseButton('buff/abc%20d'), { action: 'buff', id: 'abc d' });
    assert.equal(parseButton('nonsense'), null);
    assert.equal(parseButton('buff'), null);
    assert.equal(buttonUrl(key, 'pause', port), `http://127.0.0.1:${port}/${key}/pause`);
    const ok = await get(`/${key}/refresh`);
    assert.deepEqual([ok.status, await ok.text(), seen.length], [200, 'Refreshing', 1], 'a button runs its action');
    assert.equal((await get(`/${key}/pause`)).status, 422, 'a refused action answers 422');
    assert.equal((await get(`/${key}/launch-missiles`)).status, 404, 'an unknown action is refused');
    assert.equal((await get('/wrong-key-wrong-key/refresh')).status, 404, 'the key is required');
    assert.equal((await get('/refresh')).status, 404, 'no key, no action');
    assert.equal((await get(`/${key}/refresh`, { Origin: 'https://evil.example' })).status, 403, 'a web page is refused');
    assert.equal((await get(`/${key}/refresh`, { 'Sec-Fetch-Site': 'cross-site' })).status, 403, 'a browser fetch is refused');
    const viaName = await new Promise<number>(resolve => { // fetch cannot set Host
      const r = httpRequest({ host: '127.0.0.1', port, path: `/${key}/refresh`, headers: { Host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode ?? 0); });
      r.end();
    });
    assert.equal(viaName, 403, 'a name pointed at this PC is refused');
    assert.equal((await fetch(`http://127.0.0.1:${port}/${key}/refresh`, { method: 'POST' })).status, 405, 'GET only');
    assert.equal(seen.length, 2, 'refused requests ran nothing');
    await assert.rejects(fetch(`http://${Object.values((await import('node:os')).networkInterfaces()).flat().find(i => i && i.family === 'IPv4' && !i.internal)?.address ?? '203.0.113.1'}:${port}/${key}/refresh`, { signal: AbortSignal.timeout(1500) }), 'not reachable from the network');
    const taken = new ControlServer(key, async () => ({ ok: true, text: '' }), port);
    await taken.start();
    assert.match(taken.error, /used by another program/, 'a taken port is reported');
    await ctl.stop();
  }

  // control from the PC (55.9): global hotkeys
  {
    const regs = new Map<string, () => void>();
    const clash = new Set(['Ctrl+Alt+X']);
    const reg = {
      register: (a: string, cb: () => void) => { if (a === 'bogus') throw new Error('bad'); if (clash.has(a)) return false; regs.set(a, cb); return true; },
      unregister: (a: string) => { regs.delete(a); },
    };
    const pressed: string[] = [];
    const hk = new Hotkeys(reg, n => pressed.push(n));
    assert.deepEqual(hk.apply(noHotkeys()), {}, 'empty hotkeys register nothing');
    assert.equal(regs.size, 0);
    const errs = hk.apply({ refresh: 'Ctrl+Alt+R', pause: 'Ctrl+Alt+X', lastBuff: 'bogus' });
    assert.deepEqual(Object.keys(errs).sort(), ['lastBuff', 'pause']);
    assert.match(errs.pause!, /Another program/);
    assert.match(errs.lastBuff!, /not a shortcut/);
    regs.get('Ctrl+Alt+R')!();
    assert.deepEqual(pressed, ['refresh'], 'a press runs its action');
    assert.match(hk.apply({ refresh: 'Ctrl+Alt+R', pause: 'ctrl+alt+r', lastBuff: '' }).pause ?? '', /Already used/, 'the same shortcut twice is refused');
    hk.apply({ refresh: 'Ctrl+Alt+Q', pause: '', lastBuff: '' });
    assert.deepEqual([...regs.keys()], ['Ctrl+Alt+Q'], 'applying again drops the old shortcuts');
    hk.stop();
    assert.equal(regs.size, 0);
  }

  // control from the PC (55.9): the site client's action and queue calls
  {
    const calls: string[] = [];
    const s = await listen((req, res, body) => {
      calls.push(`${req.method} ${req.url} ${req.headers.authorization ?? ''}`);
      if (req.headers.authorization !== `Bearer ${TOKEN}`) return send(res, 401, { error: 'no' });
      if (req.url === '/api/bridge/queue') return send(res, 200, { rows: [{ id: 'a', kind: 'pull', username: 'alice', pack: 'Base', waitedS: 4 }] });
      send(res, 200, { ok: true, message: `did ${JSON.parse(body).action}`, paused: true });
    });
    const c = new SiteClient(s.url, TOKEN, '0.7.0');
    assert.deepEqual(await c.action({ action: 'pause' }), { ok: true, message: 'did pause', paused: true });
    assert.deepEqual((await c.queue()).map(r => r.username), ['alice']);
    const bad = new SiteClient(s.url, 'wrong', '0.7.0');
    await assert.rejects(bad.action({ action: 'pause' }), /Pair again/);
    await assert.rejects(bad.queue(), /Pair again/);
    s.server.close();
  }

  miSrv.server.close();
  siSrv.server.close();
  console.log('TCG Bridge checks passed');
}

main().then(() => process.exit(0), e => { console.error(e); process.exit(1); });
