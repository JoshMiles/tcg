// The Stream Deck plugin link (ROADMAP 57.13a): the token and the 127.0.0.1-only refusals, the message shapes, the install helpers, the version match with the plugin
// manifest, and the plugin's own link and key logic (streamdeck/src, no Stream Deck SDK) driven against the real server with a fake Stream Deck. Run with the rest: npm run check.
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { networkInterfaces, tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import type { ControlAction } from '../src/control';
import { DeckServer, toAction } from '../src/deck';
import { manifestVersion, installedPluginVersion, pluginOutdated, streamDeckAppFound, type DeckEnv, PLUGIN_UUID } from '../src/deckinstall';
import { CLOSE_REFUSED, parseClient, parseLinkFile, parseRequest, parseServer, type DeckState } from '../src/deckprotocol';
import { versionProblems } from './check-version';
import { Keys, type KeyHandle } from '../../streamdeck/src/controller';
import { ACTION_KIND, HOLD_MS, happyStart, requestFor, view } from '../../streamdeck/src/keys';
import { BridgeLink, type Socket } from '../../streamdeck/src/link';

const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const until = async (what: string, ok: () => boolean) => { for (let i = 0; i < 200 && !ok(); i++) await wait(10); assert.ok(ok(), `timed out waiting for ${what}`); };
const state = (over: Partial<DeckState> = {}): DeckState => ({ ready: true, paused: false, reason: '', happy: null, buffs: [{ id: 'b1', name: 'Speed up' }], ...over });

/** A raw client: what it was sent and how it closed (or why it was never let in). */
function client(url: string, opts: WebSocket.ClientOptions = {}) {
  const ws = new WebSocket(url, opts);
  const got: string[] = [];
  const r = { ws, got, closed: -1, failed: '', opened: false };
  ws.on('open', () => { r.opened = true; });
  ws.on('message', d => got.push(d.toString()));
  ws.on('close', code => { r.closed = code; });
  ws.on('error', e => { r.failed = e.message; });
  return r;
}

/** The plugin's socket adapter (plugin.ts has the same, around the same `ws`). */
function adapter(url: string): Socket {
  const ws = new WebSocket(url);
  let closed: (() => void) | undefined;
  let done = false;
  const end = () => { if (!done) { done = true; closed?.(); } };
  ws.on('close', end);
  ws.on('error', end);
  return { send: d => ws.send(d), close: () => ws.close(), onOpen: cb => ws.on('open', cb), onMessage: cb => ws.on('message', d => cb(d.toString())), onClose: cb => { closed = cb; if (done) cb(); } };
}

class FakeKey implements KeyHandle {
  title = '';
  image = '';
  alerts = 0;
  oks = 0;
  setTitle(t: string) { this.title = t; }
  setImage(i: string) { this.image = i; }
  showAlert() { this.alerts++; }
  showOk() { this.oks++; }
}

export async function deckChecks(): Promise<void> {
  const root = join(__dirname, '..', '..');

  // ── The protocol is one file in two places ──
  assert.equal(readFileSync(join(root, 'bridge', 'src', 'deckprotocol.ts'), 'utf8'), readFileSync(join(root, 'streamdeck', 'src', 'protocol.ts'), 'utf8'), 'streamdeck/src/protocol.ts and bridge/src/deckprotocol.ts must be identical');

  // ── Versions: the plugin is always the bridge's version ──
  const appVersion = (JSON.parse(readFileSync(join(root, 'bridge', 'package.json'), 'utf8')) as { version: string }).version;
  const manifest = JSON.parse(readFileSync(join(root, 'streamdeck', `${PLUGIN_UUID}.sdPlugin`, 'manifest.json'), 'utf8')) as { UUID: string; Version: string; Actions: { UUID: string }[] };
  assert.equal(manifest.UUID, PLUGIN_UUID);
  assert.equal(manifest.Version, manifestVersion(appVersion), 'the plugin manifest version must be the bridge version plus .0');
  assert.equal((JSON.parse(readFileSync(join(root, 'streamdeck', 'package.json'), 'utf8')) as { version: string }).version, appVersion, 'streamdeck/package.json must carry the bridge version');
  assert.deepEqual(manifest.Actions.map(a => a.UUID).sort(), Object.keys(ACTION_KIND).sort(), 'every manifest action has a key kind');
  assert.deepEqual(versionProblems(['streamdeck/src/keys.ts'], '0.23.0', '0.23.0', { version: '0.23.0', packages: { '': { version: '0.23.0' } } }).length, 1, 'a change under streamdeck/ needs the bridge bump');
  assert.deepEqual(versionProblems(['streamdeck/src/keys.ts'], '0.23.0', '0.24.0', { version: '0.24.0', packages: { '': { version: '0.24.0' } } }), []);

  // ── Message shapes ──
  assert.deepEqual(parseRequest({ what: 'buff', id: 'b1' }), { what: 'buff', id: 'b1' });
  assert.equal(parseRequest({ what: 'buff' }), null, 'a buff needs an id');
  assert.equal(parseRequest({ what: 'launch-missiles' }), null);
  assert.equal(parseRequest({ what: 'happy-start', minutes: 'x', kind: 'free', percent: 0 }), null);
  assert.equal(parseClient('not json'), null);
  assert.equal(parseClient(JSON.stringify({ t: 'hello', token: 5, protocol: 1, version: '1' })), null);
  assert.equal(parseClient(JSON.stringify({ t: 'do', n: 1, req: { what: 'nope' } })), null);
  assert.deepEqual(parseClient(JSON.stringify({ t: 'do', n: 2, req: { what: 'pause' } })), { t: 'do', n: 2, req: { what: 'pause' } });
  assert.equal(parseServer(JSON.stringify({ t: 'welcome', version: '1', state: { ready: true } })), null, 'a state missing fields is refused');
  assert.equal(parseLinkFile('{"port":"x","token":"t"}'), null);
  assert.deepEqual(parseLinkFile('{"port":47654,"token":"t"}'), { port: 47654, token: 't' });
  assert.deepEqual(toAction({ what: 'happy-start', minutes: 30, kind: 'discount', percent: 50 }), { action: 'happy-hour-start', minutes: 30, kind: 'discount', percent: 50 });
  assert.deepEqual(toAction({ what: 'happy-start', minutes: 15, kind: 'free', percent: 0 }), { action: 'happy-hour-start', minutes: 15, kind: 'free' });
  assert.deepEqual(toAction({ what: 'happy-end' }), { action: 'happy-hour-end' });

  // ── Install helpers, on a fake PC ──
  const files = new Map<string, string>();
  const env = (programFiles = ['C:\\PF']): DeckEnv => ({ programFiles, appData: 'C:\\AD', exists: p => files.has(p), read: p => files.get(p) ?? '' });
  assert.equal(streamDeckAppFound(env()), false, 'nothing installed');
  files.set(join('C:\\AD', 'Elgato', 'StreamDeck', 'Profiles', 'x'), '');
  assert.equal(streamDeckAppFound(env()), false, 'a leftover settings folder is not the app');
  files.set(join('C:\\PF', 'Elgato', 'StreamDeck', 'StreamDeck.exe'), '');
  assert.equal(streamDeckAppFound(env()), true);
  assert.equal(installedPluginVersion(env()), '');
  files.set(join('C:\\AD', 'Elgato', 'StreamDeck', 'Plugins', `${PLUGIN_UUID}.sdPlugin`, 'manifest.json'), JSON.stringify({ Version: '0.23.0.0' }));
  assert.equal(installedPluginVersion(env()), '0.23.0.0');
  assert.equal(pluginOutdated('0.23.0.0', '0.24.0'), true);
  assert.equal(pluginOutdated('0.24.0.0', '0.24.0'), false);
  assert.equal(pluginOutdated('', '0.24.0'), false, 'not installed is not outdated');

  // ── The key views and requests ──
  const now = 1_000_000;
  assert.match(view('pause', null, {}, now).title, /App closed/);
  assert.match(view('buff', state({ ready: false }), {}, now).title, /Not paired/);
  assert.equal(view('buff', state(), { buff: 'b1' }, now).title, 'Speed up');
  assert.equal(view('buff', state(), {}, now).title, 'Pick a buff');
  assert.equal(view('pause', state({ paused: false }), {}, now).title, 'Pulls open');
  assert.equal(view('pause', state({ paused: true, reason: 'scene Break' }), {}, now).title, 'Paused\nscene Break', 'a scene pause shows its reason');
  assert.equal(view('happy', state({ happy: { what: '25% off packs', endsAt: now + 754_000 } }), {}, now).title, '12:34\n25% off');
  assert.equal(view('happy', state(), { preset: 'p30' }, now).title, 'Happy hour\n30 min 50% off');
  assert.deepEqual(happyStart({ preset: 'p60' }), { what: 'happy-start', minutes: 60, kind: 'discount', percent: 25 });
  assert.deepEqual(happyStart({ preset: 'custom', minutes: 9999, kind: 'discount', percent: 0 }), { what: 'happy-start', minutes: 240, kind: 'discount', percent: 1 }, 'custom values are kept in range');
  assert.equal(requestFor('buff', {}), null, 'no buff picked = nothing to ask for');
  assert.deepEqual(requestFor('last-buff', {}), { what: 'last-buff' });

  // ── The server: token, loopback only ──
  const dir = mkdtempSync(join(tmpdir(), 'tcg-deck-'));
  const file = join(dir, 'streamdeck.json');
  const calls: ControlAction[] = [];
  let refuse = false;
  let current = state();
  const logs: string[] = [];
  let changes = 0;
  const server = new DeckServer({
    file, version: '9.9.9', state: () => current, ports: [0], helloMs: 150, log: l => logs.push(l), onChange: () => { changes++; },
    run: async a => { calls.push(a); return refuse ? { ok: false, text: 'Pulls are not open' } : { ok: true, text: 'Done' }; },
  });
  await server.start();
  try {
    assert.equal(server.error, '');
    const link = parseLinkFile(readFileSync(file, 'utf8'));
    assert.ok(link, 'streamdeck.json holds a port and a token');
    assert.equal(link.port, server.listeningPort);
    assert.equal(link.token, server.token);
    assert.ok(server.token.length >= 32, 'the token is long and random');
    const url = `ws://127.0.0.1:${link.port}`;
    const hello = (token: string) => JSON.stringify({ t: 'hello', token, protocol: 1, version: '1.0.0' });

    // 127.0.0.1 only: no other address of this PC answers.
    const other = Object.values(networkInterfaces()).flat().find(i => i && i.family === 'IPv4' && !i.internal);
    if (other) {
      const c = client(`ws://${other.address}:${link.port}`);
      await until('the other address to refuse', () => c.failed !== '' || c.opened);
      assert.equal(c.opened, false, 'the server must not answer on a non-loopback address');
    }

    // A wrong token, a first message that is not a hello, a stale protocol, and silence are all closed with 4401.
    const bad = client(url);
    bad.ws.on('open', () => bad.ws.send(hello('wrong')));
    await until('wrong token close', () => bad.closed !== -1);
    assert.equal(bad.closed, CLOSE_REFUSED);
    assert.deepEqual(bad.got, [], 'a refused client is told nothing');

    const first = client(url);
    first.ws.on('open', () => first.ws.send(JSON.stringify({ t: 'do', n: 1, req: { what: 'pause' } })));
    await until('do-first close', () => first.closed !== -1);
    assert.equal(first.closed, CLOSE_REFUSED);
    assert.deepEqual(calls, [], 'nothing runs before the hello');

    const old = client(url);
    old.ws.on('open', () => old.ws.send(JSON.stringify({ t: 'hello', token: server.token, protocol: 99, version: '1' })));
    await until('old protocol close', () => old.closed !== -1);
    assert.equal(old.closed, CLOSE_REFUSED);

    const silent = client(url);
    await until('hello timeout', () => silent.closed !== -1);
    assert.equal(silent.closed, CLOSE_REFUSED, 'no hello in time is closed');

    // A browser (Origin) or a name pointed at this PC (Host) is refused before any message.
    const web = client(url, { headers: { Origin: 'https://evil.example' } });
    await until('origin refusal', () => web.failed !== '' || web.opened);
    assert.equal(web.opened, false, 'a browser page cannot connect');
    const host = client(url, { headers: { Host: `evil.example:${link.port}` } });
    await until('host refusal', () => host.failed !== '' || host.opened);
    assert.equal(host.opened, false, 'a wrong Host is refused');
    assert.equal(server.connected, false);

    // The plugin's own link, with the right token: welcome, requests, refusals, pushed state.
    const keyDeck = { buff: new FakeKey(), pause: new FakeKey(), happy: new FakeKey(), last: new FakeKey() };
    let clockNow = 5_000_000;
    let linkChanges = 0;
    const plugin = new BridgeLink({ file, version: '9.9.9', connect: adapter, retryMs: 50, requestMs: 2000, onChange: () => { linkChanges++; keys.drawAll(); } });
    const keys = new Keys(plugin, () => clockNow);
    keys.add('k-buff', 'buff', keyDeck.buff, { buff: 'b1' });
    keys.add('k-pause', 'pause', keyDeck.pause, {});
    keys.add('k-happy', 'happy', keyDeck.happy, { preset: 'p15' });
    keys.add('k-last', 'last-buff', keyDeck.last, {});
    assert.match(keyDeck.pause.title, /App closed/, 'before the link is up every key says so');
    await keys.down('k-pause');
    assert.equal(keyDeck.pause.alerts, 1, 'a press while the app is closed shows the alert');
    assert.deepEqual(calls, []);

    plugin.start();
    await until('the plugin to connect', () => plugin.state !== null && server.connected);
    assert.equal(keyDeck.pause.title, 'Pulls open');
    assert.equal(keyDeck.buff.title, 'Speed up');
    assert.ok(logs.some(l => /^Stream Deck plugin 9\.9\.9 connected$/.test(l)), 'the app logs the connection');

    await keys.down('k-buff');
    await keys.down('k-pause');
    await keys.down('k-last');
    assert.deepEqual(calls, [{ action: 'buff', id: 'b1' }, { action: 'pause' }, { action: 'last-buff' }], 'each key runs through the app');
    assert.equal(keyDeck.buff.oks, 1);

    refuse = true;
    const alertsBefore = keyDeck.pause.alerts;
    await keys.down('k-pause');
    assert.equal(keyDeck.pause.alerts, alertsBefore + 1, 'a refusal shows the key alert');
    refuse = false;

    current = state({ paused: true, reason: 'scene Break' });
    server.broadcast();
    await until('the pushed pause', () => keyDeck.pause.title === 'Paused\nscene Break');
    const before = linkChanges;
    server.broadcast();
    await wait(60);
    assert.equal(linkChanges, before, 'an unchanged state is not sent again');

    // Happy hour: a press starts one; with one running a short press only explains, a 1 second hold ends it.
    calls.length = 0;
    await keys.down('k-happy'); clockNow += 100; await keys.up('k-happy');
    assert.deepEqual(calls, [{ action: 'happy-hour-start', minutes: 15, kind: 'free' }]);
    current = state({ happy: { what: 'free packs', endsAt: clockNow + 600_000 } });
    server.broadcast();
    await until('the running happy hour', () => /^10:00\nfree/.test(keyDeck.happy.title));
    calls.length = 0;
    await keys.down('k-happy'); clockNow += 200; await keys.up('k-happy');
    assert.deepEqual(calls, [], 'a short press does not end a running happy hour');
    assert.match(keyDeck.happy.title, /Hold 1 second/);
    await keys.down('k-happy'); clockNow += HOLD_MS; await keys.up('k-happy');
    assert.deepEqual(calls, [{ action: 'happy-hour-end' }], 'a hold of a second ends it');

    // The app closing turns every key back to "App closed", and the plugin finds it again when it returns.
    await server.stop();
    assert.equal(existsSync(file), false, 'stop removes streamdeck.json');
    await until('the keys to notice', () => plugin.state === null);
    assert.match(keyDeck.pause.title, /App closed/);
    plugin.stop();
    assert.equal(server.connected, false);
  } finally {
    await server.stop();
    rmSync(dir, { recursive: true, force: true });
  }
  assert.ok(changes > 0);

  // Every port taken: the app says so.
  const blocker = new DeckServer({ file: join(tmpdir(), 'tcg-deck-blocker.json'), version: '1', state: () => state(), ports: [0], run: async () => ({ ok: true, text: '' }), onChange: () => undefined, log: () => undefined });
  await blocker.start();
  try {
    const busy = new DeckServer({ file: join(tmpdir(), 'tcg-deck-busy.json'), version: '1', state: () => state(), ports: [blocker.listeningPort], run: async () => ({ ok: true, text: '' }), onChange: () => undefined, log: () => undefined });
    await busy.start();
    assert.match(busy.error, /are used by other programs/);
    assert.equal(existsSync(join(tmpdir(), 'tcg-deck-busy.json')), false, 'no file is written when nothing listens');
  } finally { await blocker.stop(); }
}
