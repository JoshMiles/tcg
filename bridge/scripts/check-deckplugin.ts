// The BUILT Stream Deck plugin (ROADMAP 61.1): the packed file holds everything the manifest and plugin.js need, and bin/plugin.js, started the way Stream Deck
// starts it (its -port / -pluginUUID / -registerEvent / -info arguments, the plugin folder as the working directory), loads, registers and answers key presses
// against a fake Stream Deck host and the real DeckServer. Run with the rest: npm run check (it builds the plugin first when it is missing, as `npm run deck` does).
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ControlAction } from '../src/control';
import { DeckServer } from '../src/deck';
import type { DeckState } from '../src/deckprotocol';
import { PLUGIN_UUID } from '../src/deckinstall';
import { ACTION_KIND } from '../../streamdeck/src/keys';

const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const until = async (what: string, ok: () => boolean, ms = 8000) => { for (let i = 0; i < ms / 10 && !ok(); i++) await wait(10); assert.ok(ok(), `timed out waiting for ${what}`); };

/** Every file in a .streamDeckPlugin (a zip), by path. */
export function zipFiles(buf: Buffer): Map<string, Buffer> {
  let end = buf.length - 22;
  while (end >= 0 && buf.readUInt32LE(end) !== 0x06054b50) end--;
  assert.ok(end >= 0, 'the packed plugin is not a zip file');
  const out = new Map<string, Buffer>();
  let p = buf.readUInt32LE(end + 16);
  for (let i = buf.readUInt16LE(end + 10); i > 0; i--) {
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20), n = buf.readUInt16LE(p + 28), x = buf.readUInt16LE(p + 30), c = buf.readUInt16LE(p + 32), at = buf.readUInt32LE(p + 42);
    const data = at + 30 + buf.readUInt16LE(at + 26) + buf.readUInt16LE(at + 28);
    const raw = buf.subarray(data, data + size);
    out.set(buf.toString('utf8', p + 46, p + 46 + n), method === 8 ? inflateRawSync(raw) : raw);
    p += 46 + n + x + c;
  }
  return out;
}

interface Manifest { CodePath: string; Icon: string; CategoryIcon: string; Software: { MinimumVersion: string }; Actions: { UUID: string; Icon: string; PropertyInspectorPath?: string; States: { Image: string }[] }[] }

/** What the manifest points at, and nothing else needed to load: every file is in `has`, and plugin.js imports only Node built-ins (no node_modules ship in the pack). */
export function packProblems(has: (path: string) => boolean, read: (path: string) => string): string[] {
  const bad: string[] = [];
  const need = (path: string, why: string) => { if (!has(path)) bad.push(`${path} is missing (${why})`); };
  const m = JSON.parse(read('manifest.json')) as Manifest;
  need(m.CodePath, 'CodePath');
  need('bin/package.json', 'plugin.js is an ES module');
  const picture = (base: string, why: string) => need(`${base}.png`, why);
  picture(m.Icon, 'Icon');
  picture(m.CategoryIcon, 'CategoryIcon');
  for (const a of m.Actions) {
    picture(a.Icon, `${a.UUID} Icon`);
    for (const s of a.States) picture(s.Image, `${a.UUID} state image`);
    if (a.PropertyInspectorPath) {
      need(a.PropertyInspectorPath, `${a.UUID} PropertyInspectorPath`);
      if (has(a.PropertyInspectorPath)) {
        const dir = a.PropertyInspectorPath.replace(/[^/]*$/, '');
        for (const ref of read(a.PropertyInspectorPath).matchAll(/(?:src|href)="([^"#?]+)"/g)) if (!/^(?:[a-z]+:)?\/\//.test(ref[1])) need(dir + ref[1], `${a.PropertyInspectorPath} loads it`);
      }
    }
  }
  if (has(m.CodePath)) {
    const code = read(m.CodePath);
    const optional = new Set(['bufferutil', 'utf-8-validate']); // ws loads these in a try/catch when present
    const specs = new Set([...code.matchAll(/\bfrom\s*["']([^"']+)["']|\bimport\s*\(?\s*["']([^"']+)["']|\brequire\(\s*["']([^"']+)["']\s*\)/g)].map(r => r[1] ?? r[2] ?? r[3]));
    for (const s of specs) if (!optional.has(s) && !builtinModules.includes(s.replace(/^node:/, ''))) bad.push(`plugin.js requires "${s}", which is not a Node built-in and is not in the pack`);
  }
  return bad;
}

/** The built plugin folder and the packed file; builds them (like `npm run deck`) when they are not there. */
function built(root: string): { dir: string; packed: string } {
  const sd = join(root, 'streamdeck');
  const dir = join(sd, `${PLUGIN_UUID}.sdPlugin`);
  const packed = join(sd, 'dist', 'TCG Bridge.streamDeckPlugin');
  if (!existsSync(join(dir, 'bin', 'plugin.js')) || !existsSync(packed)) {
    // Same as `npm run deck`.
    if (!existsSync(join(sd, 'node_modules'))) execFileSync('npm', ['ci', '--no-audit', '--no-fund'], { cwd: sd, stdio: 'ignore', shell: true });
    execFileSync(process.execPath, [join(sd, 'scripts', 'build.mjs')], { cwd: sd, stdio: 'ignore' });
    execFileSync(process.execPath, [join(sd, 'scripts', 'pack.mjs')], { cwd: sd, stdio: 'ignore' });
  }
  return { dir, packed };
}

const state = (over: Partial<DeckState> = {}): DeckState => ({ ready: true, paused: false, reason: '', happy: null, buffs: [{ id: 'b1', name: 'Speed up' }], stats: { queue: 3 }, ...over });

export async function deckPluginChecks(): Promise<void> {
  const root = join(__dirname, '..', '..');
  const { dir, packed } = built(root);

  // ── The packed file ──
  const zip = zipFiles(readFileSync(packed));
  const prefix = `${PLUGIN_UUID}.sdPlugin/`;
  assert.equal(zip.get(`${prefix}manifest.json`)?.toString('utf8'), readFileSync(join(dir, 'manifest.json'), 'utf8'), 'dist is stale: run npm --prefix ../streamdeck run pack');
  assert.deepEqual(packProblems(p => zip.has(prefix + p), p => (zip.get(prefix + p) ?? Buffer.alloc(0)).toString('utf8')), [], 'the packed plugin must hold everything the manifest and plugin.js need');
  assert.ok(packProblems(p => p !== 'ui/pi.js', p => readFileSync(join(dir, p), 'utf8')).length > 0,'the pack check sees a missing property inspector script');
  assert.equal(packProblems(p => p !== 'bin/plugin.js', p => readFileSync(join(dir, p), 'utf8')).length, 1, 'the pack check sees a missing plugin.js');
  assert.equal(packProblems(() => true, p => (p === 'bin/plugin.js' ? 'import x from "left-pad";' : readFileSync(join(dir, p), 'utf8'))).length, 1, 'the pack check sees a module that would not be found');
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as Manifest;
  assert.ok(Number(manifest.Software.MinimumVersion) >= 7.1, 'the SDK needs Software.MinimumVersion 7.1 or higher to start (it throws ERR_NOT_SUPPORTED at connect otherwise)');

  // ── The built plugin against a fake Stream Deck and the real DeckServer ──
  const tmp = mkdtempSync(join(tmpdir(), 'tcg-deckplugin-'));
  const appData = join(tmp, 'AppData');
  const home = join(tmp, 'sdPlugin'); // the plugin runs in a copy: the SDK writes logs/ in its working directory
  cpSync(dir, home, { recursive: true });
  let st = state();
  let skipOk = false; // the Skip next pull key gets the app's answer; the Queue stat key's second press is refused
  const ran: ControlAction[] = [];
  const staffRan: Record<string, unknown>[] = [];
  const serve = async () => {
    const s = new DeckServer({
      file: join(appData, 'TCG Bridge', 'streamdeck.json'), version: '0.0.0', state: () => st, onChange: () => undefined, log: () => undefined, ports: [0],
      run: async a => { ran.push(a); return a.action === 'skip' && !skipOk ?{ ok: false, text: 'The queue is empty' } : { ok: true, text: 'Done' }; },
      staff: async b => { staffRan.push(b); return { ok: true, text: 'Done' }; },
    });
    await s.start();
    assert.equal(s.error, '');
    return s;
  };
  let server = await serve();

  const keys = { buff: { buff: 'b1' }, 'last-buff': {}, pause: {}, 'happy-hour': { preset: 'p15' }, 'test-pull': {}, 'show-card': { viewer: '@Alice' }, stat: { stat: 'queue' }, skip: {}, 'clear-queue': {}, queue: {} } as Record<string, Record<string, unknown>>;
  const seen: Record<string, { title: string; ok: number; alert: number }> = {};
  const ctx = (name: string) => `ctx-${name}`;
  for (const name of Object.keys(keys)) seen[ctx(name)] = { title: '', ok: 0, alert: 0 };
  let registered = false;
  let sd: WebSocket | null = null;
  const host = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  const say = (m: object) => sd?.send(JSON.stringify(m));
  const action = (name: string) => `${PLUGIN_UUID}.${name}`;
  const device = 'DEVICE1';
  const down = (name: string) => say({ event: 'keyDown', action: action(name), context: ctx(name), device, payload: { settings: keys[name], coordinates: { column: 0, row: 0 }, state: 0, isInMultiAction: false } });
  const up = (name: string) => say({ event: 'keyUp', action: action(name), context: ctx(name), device, payload: { settings: keys[name], coordinates: { column: 0, row: 0 }, state: 0, isInMultiAction: false } });
  const press = async (name: string) => { down(name); up(name); };
  host.on('connection', ws => {
    sd = ws;
    ws.on('message', d => {
      const m = JSON.parse(d.toString()) as { event: string; context?: string; payload?: { title?: string } };
      if (m.event === 'registerPlugin') {
        registered = true;
        say({ event: 'deviceDidConnect', device, deviceInfo: { name: 'Fake deck', type: 0, size: { columns: 5, rows: 3 } } });
        for (const name of Object.keys(keys)) say({ event: 'willAppear', action: action(name), context: ctx(name), device, payload: { settings: keys[name], coordinates: { column: 0, row: 0 }, controller: 'Keypad', state: 0, isInMultiAction: false } });
      }
      const k = m.context ? seen[m.context] : undefined;
      if (!k) return;
      if (m.event === 'setTitle') k.title = m.payload?.title ?? '';
      if (m.event === 'showOk') k.ok++;
      if (m.event === 'showAlert') k.alert++;
    });
  });
  await new Promise<void>(r => host.once('listening', () => r()));
  const info = { application: { font: 'Segoe UI', language: 'en', platform: 'windows', platformVersion: '10.0.0', version: '7.2.0.22000' }, plugin: { uuid: PLUGIN_UUID, version: manifest.Software.MinimumVersion }, devicePixelRatio: 1, colors: {}, devices: [{ id: device, name: 'Fake deck', type: 0, size: { columns: 5, rows: 3 } }] };
  let out = '';
  let exited: number | null = null;
  const child = spawn(process.execPath, [join(home, 'bin', 'plugin.js'), '-port', String((host.address() as { port: number }).port), '-pluginUUID', 'PLUGIN-CONTEXT', '-registerEvent', 'registerPlugin', '-info', JSON.stringify(info)], { cwd: home, env: { ...process.env, APPDATA: appData } });
  child.stdout.on('data', d => { out += d; });
  child.stderr.on('data', d => { out += d; });
  child.on('exit', code => { exited = code ?? -1; });
  const alive = (what: string) => assert.equal(exited, null, `the plugin exited (${exited}) before ${what}: ${out.slice(0, 600)}`);

  try {
    await until('the plugin to register with Stream Deck', () => registered || exited !== null);
    alive('registering');
    assert.ok(registered, 'plugin.js registers with the host');
    await until('the keys to be drawn from the app\'s state', () => seen[ctx('buff')].title === 'Speed up' && seen[ctx('stat')].title === 'Queue\n3');
    alive('drawing the keys');
    assert.equal(seen[ctx('pause')].title, 'Pulls open');
    assert.equal(seen[ctx('show-card')].title, 'Show card\nalice', 'the Show a card key reads the viewer from its settings');
    assert.ok(server.connected && server.seen, 'the app sees the plugin connected');

    // ── Each key: the app receives the request, the key gets the app's answer ──
    const answered = async (name: string, fire: () => Promise<void> | void, kind: 'ok' | 'alert' = 'ok') => {
      const before = seen[ctx(name)][kind];
      await fire();
      await until(`the ${name} key to be answered`, () => seen[ctx(name)][kind] > before);
    };
    await answered('buff', () => press('buff'));
    assert.deepEqual(ran.pop(), { action: 'buff', id: 'b1' });
    await answered('last-buff', () => press('last-buff'));
    assert.deepEqual(ran.pop(), { action: 'last-buff' });
    await answered('pause', () => press('pause'));
    assert.deepEqual(ran.pop(), { action: 'pause' });
    await answered('test-pull', () => press('test-pull'));
    assert.deepEqual(staffRan.pop(), { action: 'test-pull' });
    await answered('show-card', () => press('show-card'));
    assert.deepEqual(staffRan.pop(), { action: 'show-card', username: 'alice' });
    await answered('happy-hour', () => press('happy-hour'));
    assert.deepEqual(ran.pop(), { action: 'happy-hour-start', minutes: 15, kind: 'free' });

    // Settings changed in the Property Inspector reach the key.
    keys['happy-hour'] = { preset: 'p30' };
    say({ event: 'didReceiveSettings', action: action('happy-hour'), context: ctx('happy-hour'), device, payload: { settings: keys['happy-hour'], coordinates: { column: 0, row: 0 }, isInMultiAction: false } });
    await until('the new happy hour settings to be drawn', () => seen[ctx('happy-hour')].title.includes('30 min'));
    await answered('happy-hour', () => press('happy-hour'));
    assert.deepEqual(ran.pop(), { action: 'happy-hour-start', minutes: 30, kind: 'discount', percent: 50 });

    // A running happy hour: a short press only says how to end it; a press held a second ends it.
    st = state({ happy: { what: 'Free packs', endsAt: Date.now() + 600_000 } });
    server.broadcast();
    await until('the happy hour countdown', () => /^\d+:\d\d/.test(seen[ctx('happy-hour')].title));
    await answered('happy-hour', () => press('happy-hour'), 'alert');
    assert.equal(ran.length, 0, 'a short press does not end the happy hour');
    down('happy-hour');
    await wait(1100);
    await answered('happy-hour', () => up('happy-hour'));
    assert.deepEqual(ran.pop(), { action: 'happy-hour-end' });

    // A Queue stat key: the first press says how to skip, the second skips; the app's refusal is the key's alert.
    await press('stat');
    await until('the skip hint', () => seen[ctx('stat')].title.startsWith('Press again'));
    assert.equal(ran.length, 0);
    await answered('stat', () => press('stat'), 'alert');
    assert.deepEqual(ran.pop(), { action: 'skip' });

    // Queue keys (61.2): Skip next pull is one press; Clear queue needs a hold of a second (a short press only says so); Pulls waiting shows the app's number.
    assert.equal(seen[ctx('skip')].title, 'Skip\nnext pull');
    assert.equal(seen[ctx('clear-queue')].title, 'Clear\nqueue');
    await until('the waiting count', () => seen[ctx('queue')].title === 'Waiting\n3');
    skipOk = true;
    await answered('skip', () => press('skip'));
    assert.deepEqual(ran.pop(), { action: 'skip' });
    await answered('clear-queue', () => press('clear-queue'), 'alert');
    assert.equal(ran.length, 0, 'a short press does not clear the queue');
    assert.equal(seen[ctx('clear-queue')].title, 'Hold 1 second\nto clear');
    down('clear-queue');
    await wait(1100);
    await answered('clear-queue', () => up('clear-queue'));
    assert.deepEqual(ran.pop(), { action: 'clear-queue' });
    const before = seen[ctx('queue')].ok + seen[ctx('queue')].alert;
    await press('queue');
    await wait(200);
    assert.equal(seen[ctx('queue')].ok + seen[ctx('queue')].alert, before, 'a press on the waiting count does nothing');
    assert.equal(ran.length, 0);
    st = state({ stats: { queue: 7 } });
    server.broadcast();
    await until('the new waiting count', () => seen[ctx('queue')].title === 'Waiting\n7');

    // The app closes and comes back (a new port and token): the keys notice and recover without a restart of the plugin.
    await server.stop();
    await until('the keys to say the app is closed', () => seen[ctx('pause')].title === 'App closed');
    st = state();
    server = await serve();
    await until('the keys to find the restarted app', () => seen[ctx('pause')].title === 'Pulls open', 15000);
    await answered('last-buff', () => press('last-buff'));
    assert.deepEqual(ran.pop(), { action: 'last-buff' });
    alive('the end');
  } finally {
    child.kill();
    await new Promise<void>(r => host.close(() => r()));
    for (const ws of host.clients) ws.terminate();
    await server.stop();
    await wait(100);
    rmSync(tmp, { recursive: true, force: true });
  }
}
