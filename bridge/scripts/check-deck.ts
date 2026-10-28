// The Stream Deck plugin link (ROADMAP 57.13): the token and the 127.0.0.1-only refusals, the message shapes, the install helpers, the version match with the plugin
// manifest, and the plugin's own link and key logic (streamdeck/src, no Stream Deck SDK) driven against the real server with a fake Stream Deck. Run with the rest: npm run check.
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { networkInterfaces, tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import type { ControlAction } from '../src/control';
import { DeckServer, deckChecklist, deckStaff, deckStats, runStaffKey, runStaffPcKey, toAction, toStaff, type StaffPcEnv } from '../src/deck';
import { statsPlan, noStatMap } from '../src/obsstats';
import { manifestVersion, installedPluginVersion, pluginOutdated, streamDeckAppFound, type DeckEnv, PLUGIN_UUID } from '../src/deckinstall';
import { CLOSE_REFUSED, parseClient, parseLinkFile, parseRequest, parseServer, type DeckStaff, type DeckState } from '../src/deckprotocol';
import { versionProblems } from './check-version';
import { Keys, type KeyHandle } from '../../streamdeck/src/controller';
import { ACTION_KIND, HOLD_MS, SKIP_MS, happyStart, liveHold, requestFor, view } from '../../streamdeck/src/keys';
import { BridgeLink, type Socket } from '../../streamdeck/src/link';

const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const until = async (what: string, ok: () => boolean) => { for (let i = 0; i < 200 && !ok(); i++) await wait(10); assert.ok(ok(), `timed out waiting for ${what}`); };
const state = (over: Partial<DeckState> = {}): DeckState => ({ ready: true, paused: false, reason: '', happy: null, buffs: [{ id: 'b1', name: 'Speed up' }], stats: {}, staff: null, live: false, checklist: null, ...over });

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

  // ── The 57.13b messages: Test pull, Show a card, skip, the visible-stats list, the stats in the state ──
  assert.deepEqual(parseRequest({ what: 'test-pull' }), { what: 'test-pull' });
  assert.deepEqual(parseRequest({ what: 'skip' }), { what: 'skip' });
  assert.deepEqual(parseRequest({ what: 'show-card', username: 'cheesy_1' }), { what: 'show-card', username: 'cheesy_1' });
  assert.equal(parseRequest({ what: 'show-card' }), null, 'a card needs a viewer');
  assert.equal(parseRequest({ what: 'show-card', username: '' }), null);
  assert.equal(parseRequest({ what: 'show-card', username: 5 }), null);
  assert.deepEqual(parseClient(JSON.stringify({ t: 'stats', want: ['packs', 'nope', 'queue', 'queue'] })), { t: 'stats', want: ['queue', 'packs'] }, 'only known stats, once each');
  assert.deepEqual(parseClient(JSON.stringify({ t: 'stats', want: [] })), { t: 'stats', want: [] });
  assert.equal(parseClient(JSON.stringify({ t: 'stats' })), null, 'a stats message needs a list');
  assert.equal(parseClient(JSON.stringify({ t: 'stats', want: 'queue' })), null);
  const withStats = parseServer(JSON.stringify({ t: 'state', state: { ...state(), stats: { queue: 3, packs: 12, goal: null, junk: 1 } } }));
  assert.deepEqual(withStats?.t === 'state' ? withStats.state.stats : null, { queue: 3, packs: 12, goal: null }, 'the stats are rebuilt field by field');
  const oldApp = parseServer(JSON.stringify({ t: 'state', state: { ready: true, paused: false, reason: '', happy: null, buffs: [] } }));
  assert.deepEqual(oldApp?.t === 'state' ? oldApp.state.stats : null, {}, 'a state from an app without stats still parses');
  assert.equal(oldApp?.t === 'state' ? oldApp.state.staff : undefined, null, 'and an app without staff keys is not a staff PC');
  assert.deepEqual(toAction({ what: 'skip' }), { action: 'skip' });
  assert.equal(toAction({ what: 'test-pull' }), null, 'a test pull is a staff action, not a control action');
  assert.deepEqual(toStaff({ what: 'test-pull' }), { action: 'test-pull' });
  assert.deepEqual(toStaff({ what: 'show-card', username: 'cheesy_1' }), { action: 'show-card', username: 'cheesy_1' });
  assert.equal(toStaff({ what: 'skip' }), null);
  assert.deepEqual(deckStats({ queue: 2, packs: 0, goal: 'Goal: 3 / 50', lastBig: null }), { queue: 2, packs: 0, goal: 'Goal: 3 / 50', lastBig: null }, 'nobody yet is said, not left out');
  assert.deepEqual(deckStats({ lastBig: { username: 'brie_fan', cardName: 'Brie' }, topPuller: { username: 'cheese', packs: 9 } }), { lastBig: { username: 'brie_fan', cardName: 'Brie' }, topPuller: { username: 'cheese', packs: 9 } });
  assert.deepEqual(deckStats(null), {});

  // ── Asking the site for stats: only while OBS has a mapped stat or a Stat key is on a deck ──
  const none = noStatMap();
  assert.deepEqual(statsPlan(none, true, []), { poll: false, obs: false, ask: [] }, 'nothing mapped, no Stat key: no polling');
  assert.equal(statsPlan({ ...none, queue: 'Q' }, false, []).poll, false, 'a mapped stat with OBS down: no polling');
  assert.deepEqual(statsPlan({ ...none, queue: 'Q' }, true, []), { poll: true, obs: true, ask: ['queue'] });
  assert.deepEqual(statsPlan(none, false, ['packs', 'queue']), { poll: true, obs: false, ask: ['packs', 'queue'] }, 'a Stat key alone polls, and OBS is not written');
  assert.deepEqual(statsPlan({ ...none, queue: 'Q', goal: 'G' }, true, ['queue', 'packs']).ask, ['packs', 'goal', 'queue'], 'the OBS and the deck stats are asked for once each');

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
  const anyStaff = state({ staff: { can: ['trading', 'scene', 'preview-url', 'test-pull', 'show-card'], tradingPaused: false, scene: 'Main', scenes: [] } });
  assert.equal(view('test-pull', anyStaff, {}, now).title, 'Test pull');
  assert.deepEqual(requestFor('test-pull', {}), { what: 'test-pull' });
  assert.equal(view('show-card', anyStaff, { viewer: '@Cheesy_1' }, now).title, 'Show card\ncheesy_1');
  assert.equal(view('show-card', anyStaff, {}, now).title, 'Name a viewer');
  assert.equal(requestFor('show-card', {}), null, 'no viewer named = nothing to ask for');
  assert.equal(requestFor('show-card', { viewer: 'x' }), null, 'a name that cannot be a Twitch login is not sent');
  assert.deepEqual(requestFor('show-card', { viewer: ' @Cheesy_1 ' }), { what: 'show-card', username: 'cheesy_1' });
  assert.equal(view('stat', state({ stats: { queue: 4 } }), { stat: 'queue' }, now).title, 'Queue\n4');
  assert.equal(view('stat', state(), { stat: 'queue' }, now).title, 'Queue\n-', 'before the site has said');
  assert.equal(view('stat', state({ stats: { packs: 12 } }), { stat: 'packs' }, now).title, 'Packs\n12');
  assert.equal(view('stat', state({ stats: { goal: 'Pack goal: 37 / 50' } }), { stat: 'goal' }, now).title, 'Pack goal\n37 / 50');
  assert.equal(view('stat', state({ stats: { goal: null } }), { stat: 'goal' }, now).title, 'Goal\nnone set');
  assert.equal(view('stat', state(), {}, now).title, 'Pick a stat');
  assert.match(view('stat', null, { stat: 'queue' }, now).title, /App closed/);
  assert.deepEqual(requestFor('stat', { stat: 'queue' }), { what: 'skip' });
  assert.equal(requestFor('stat', { stat: 'packs' }), null, 'only the queue key asks for anything');
  assert.equal(HOLD_MS, 1000);
  assert.equal(SKIP_MS, 3000);

  // ── The 61.4 live info options of the Stat key: last big pull, top puller, happy hour time left, pack goal cut to fit ──
  const wired = parseServer(JSON.stringify({ t: 'state', state: { ...state(), stats: { lastBig: { username: 'brie_fan', cardName: 'Brie', junk: 1 }, topPuller: { username: 'cheese', packs: 9 } } } }));
  assert.deepEqual(wired?.t === 'state' ? wired.state.stats : null, { lastBig: { username: 'brie_fan', cardName: 'Brie' }, topPuller: { username: 'cheese', packs: 9 } }, 'the two names survive the wire, rebuilt field by field');
  const nobody = parseServer(JSON.stringify({ t: 'state', state: { ...state(), stats: { lastBig: null, topPuller: null } } }));
  assert.deepEqual(nobody?.t === 'state' ? nobody.state.stats : null, { lastBig: null, topPuller: null });
  const junkNames = parseServer(JSON.stringify({ t: 'state', state: { ...state(), stats: { lastBig: { username: 5 }, topPuller: 'x' } } }));
  assert.deepEqual(junkNames?.t === 'state' ? junkNames.state.stats : null, {}, 'a malformed name is left out');
  assert.deepEqual(parseClient(JSON.stringify({ t: 'stats', want: ['topPuller', 'lastBig', 'happy'] })), { t: 'stats', want: ['lastBig', 'topPuller'] }, 'the happy hour time is not a site stat, so it is never wanted');
  assert.equal(view('stat', state({ stats: { lastBig: { username: 'brie_fan', cardName: 'Charizard' } } }), { stat: 'lastBig' }, now).title, 'brie_fan\nCharizard');
  assert.equal(view('stat', state({ stats: { lastBig: { username: 'a_very_long_viewer_name', cardName: 'Pikachu VMAX Rainbow' } } }), { stat: 'lastBig' }, now).title, 'a_very_lo.\nPikachu V.', 'long names are cut with a dot');
  assert.equal(view('stat', state({ stats: { lastBig: null } }), { stat: 'lastBig' }, now).title, 'Big pull\nnone yet');
  assert.equal(view('stat', state(), { stat: 'lastBig' }, now).title, 'Big pull\n-', 'before the site has said');
  assert.equal(view('stat', state({ stats: { topPuller: { username: 'cheese', packs: 9 } } }), { stat: 'topPuller' }, now).title, 'cheese\n9 packs');
  assert.equal(view('stat', state({ stats: { topPuller: null } }), { stat: 'topPuller' }, now).title, 'Top puller\nnone yet');
  assert.equal(view('stat', state(), { stat: 'topPuller' }, now).title, 'Top puller\n-');
  assert.equal(view('stat', state({ happy: { what: 'Free packs', endsAt: now + 754_000 } }), { stat: 'happy' }, now).title, 'Happy hour\n12:34', 'counts down');
  assert.equal(view('stat', state({ happy: { what: 'Free packs', endsAt: now + 1_000 } }), { stat: 'happy' }, now + 2_000).title, 'No happy\nhour', 'a happy hour that has ended');
  assert.equal(view('stat', state(), { stat: 'happy' }, now).title, 'No happy\nhour');
  assert.equal(view('stat', state({ stats: { goal: 'Open the legendary pack: 37 / 50' } }), { stat: 'goal' }, now).title, 'Open the .\n37 / 50', 'a long goal label is cut to fit');
  for (const stat of ['lastBig', 'topPuller', 'happy', 'goal']) {
    assert.match(view('stat', null, { stat }, now).title, /App closed/);
    assert.match(view('stat', state({ ready: false }), { stat }, now).title, /Not paired/);
    assert.equal(requestFor('stat', { stat }), null, `${stat}: a press asks for nothing`);
  }
  for (const stat of ['lastBig', 'topPuller', 'happy', 'goal', 'packs']) {
    const full = state({ happy: { what: '25% off packs', endsAt: now + 3_599_000 }, stats: { packs: 1234, goal: 'Open the legendary pack: 137 / 150', lastBig: { username: 'a_very_long_viewer_name', cardName: 'Pikachu VMAX Rainbow' }, topPuller: { username: 'a_very_long_viewer_name', packs: 1234 } } });
    for (const line of view('stat', full, { stat }, now).title.split('\n')) assert.ok(line.length <= 10, `${stat}: "${line}" fits a key`);
  }

  // ── The 61.2 queue keys: Skip next pull, Clear queue (hold), Pulls waiting ──
  assert.deepEqual(parseRequest({ what: 'clear-queue' }), { what: 'clear-queue' });
  assert.deepEqual(toAction({ what: 'clear-queue' }), { action: 'clear-queue' }, 'the same action as the Control tab and the tray, so refunds are the app path as today');
  assert.equal(toStaff({ what: 'clear-queue' }), null);
  assert.equal(ACTION_KIND['tv.cheesygidds.tcgbridge.skip'], 'skip');
  assert.equal(ACTION_KIND['tv.cheesygidds.tcgbridge.clear-queue'], 'clear-queue');
  assert.equal(ACTION_KIND['tv.cheesygidds.tcgbridge.queue'], 'queue');
  assert.equal(view('skip', state(), {}, now).title, 'Skip\nnext pull');
  assert.equal(view('clear-queue', state(), {}, now).title, 'Clear\nqueue');
  assert.equal(view('queue', state({ stats: { queue: 5 } }), {}, now).title, 'Waiting\n5');
  assert.equal(view('queue', state({ stats: { queue: 0 } }), {}, now).title, 'Waiting\n0');
  assert.equal(view('queue', state(), {}, now).title, 'Waiting\n-', 'before the app has said');
  for (const k of ['skip', 'clear-queue', 'queue'] as const) {
    assert.match(view(k, null, {}, now).title, /App closed/);
    assert.match(view(k, state({ ready: false }), {}, now).title, /Not paired/);
    for (const line of view(k, state({ stats: { queue: 12 } }), {}, now).title.split('\n')) assert.ok(line.length <= 10, `"${line}" fits a key`);
  }
  assert.deepEqual(requestFor('skip', {}), { what: 'skip' });
  assert.deepEqual(requestFor('clear-queue', {}), { what: 'clear-queue' });
  assert.equal(requestFor('queue', {}), null, 'a press on the count asks for nothing');
  // The count is polled from the app, at most every 5 seconds, and only while a Pulls waiting (or Queue stat) key is on a deck: the plugin has no timer of its own for it.
  assert.match(readFileSync(join(__dirname, '..', 'src', 'main.ts'), 'utf8'), /const STATS_MS = 5000;/, 'the app asks the site for the queue count at most every 5 seconds');
  assert.doesNotMatch(readFileSync(join(__dirname, '..', '..', 'streamdeck', 'src', 'controller.ts'), 'utf8'), /setInterval/, 'the keys poll nothing themselves');

  // ── The 61.3 staff keys: Pause trading, Switch scene, Preview overlay ──
  const staffOpen: DeckStaff = { can: ['trading', 'scene', 'preview-url', 'test-pull', 'show-card'], tradingPaused: false, scene: 'Main', scenes: ['Main', 'Break'] };
  const adminPc = state({ staff: staffOpen });
  const modPc = state({ staff: { ...staffOpen, can: ['trading', 'scene'] } });
  assert.deepEqual(parseRequest({ what: 'trading', pause: true }), { what: 'trading', pause: true });
  assert.equal(parseRequest({ what: 'trading' }), null, 'a trading request says pause or resume');
  assert.deepEqual(parseRequest({ what: 'scene', name: 'Break' }), { what: 'scene', name: 'Break' });
  assert.equal(parseRequest({ what: 'scene', name: '' }), null, 'a scene key names a scene');
  assert.deepEqual(parseRequest({ what: 'preview' }), { what: 'preview' });
  const pushed = parseServer(JSON.stringify({ t: 'state', state: adminPc }));
  assert.deepEqual(pushed?.t === 'state' ? pushed.state.staff : undefined, staffOpen, 'the staff state survives the wire');
  const junkStaff = parseServer(JSON.stringify({ t: 'state', state: { ...adminPc, staff: { can: 'all' } } }));
  assert.equal(junkStaff?.t === 'state' ? junkStaff.state.staff : undefined, null, 'a malformed staff state is not a staff PC');
  for (const r of [{ what: 'trading', pause: true }, { what: 'scene', name: 'Break' }, { what: 'preview' }] as const) assert.equal(toAction(r), null, `${r.what} is a staff key, not a control action`);
  assert.equal(ACTION_KIND['tv.cheesygidds.tcgbridge.trading'], 'trading');
  assert.equal(ACTION_KIND['tv.cheesygidds.tcgbridge.scene'], 'scene');
  assert.equal(ACTION_KIND['tv.cheesygidds.tcgbridge.preview'], 'preview');
  // What each key shows: the current state on a staff PC, "Staff only" on any other, "Admins only" on a mod-linked PC for the preview.
  assert.equal(view('trading', adminPc, {}, now).title, 'Trading\nopen');
  assert.equal(view('trading', state({ staff: { ...staffOpen, tradingPaused: true } }), {}, now).title, 'Trading\npaused');
  assert.notEqual(view('trading', adminPc, {}, now).image, view('trading', state({ staff: { ...staffOpen, tradingPaused: true } }), {}, now).image, 'open and paused look different');
  assert.equal(view('scene', adminPc, { scene: 'Break' }, now).title, 'Scene\nBreak');
  assert.notEqual(view('scene', adminPc, { scene: 'Main' }, now).image, view('scene', adminPc, { scene: 'Break' }, now).image, 'the scene on air is lit');
  assert.equal(view('scene', adminPc, {}, now).title, 'Pick a scene');
  assert.equal(view('preview', adminPc, {}, now).title, 'Preview\noverlay');
  for (const k of ['trading', 'scene', 'preview'] as const) {
    assert.equal(view(k, state(), { scene: 'Main' }, now).title, 'Staff only', `${k}: a PC that is not a staff PC`);
    assert.match(view(k, null, {}, now).title, /App closed/);
    assert.match(view(k, state({ ready: false }), {}, now).title, /Not paired/);
    for (const line of view(k, adminPc, { scene: 'Main' }, now).title.split('\n')) assert.ok(line.length <= 10, `"${line}" fits a key`);
  }
  assert.equal(view('trading', modPc, {}, now).title, 'Trading\nopen', 'a mod may pause trading');
  assert.equal(view('scene', modPc, { scene: 'Main' }, now).title, 'Scene\nMain', 'and switch scenes');
  assert.equal(view('preview', modPc, {}, now).title, 'Admins only', 'but the preview address is an admin action');
  assert.deepEqual(requestFor('trading', {}, adminPc), { what: 'trading', pause: true }, 'an open trading key asks to pause');
  assert.deepEqual(requestFor('trading', {}, state({ staff: { ...staffOpen, tradingPaused: true } })), { what: 'trading', pause: false }, 'a paused one asks to resume');
  assert.equal(requestFor('trading', {}, state()), null, 'no staff state, nothing to ask');
  assert.deepEqual(requestFor('scene', { scene: ' Break ' }), { what: 'scene', name: 'Break' });
  assert.equal(requestFor('scene', {}), null, 'no scene picked = nothing to ask for');
  assert.deepEqual(requestFor('preview', {}), { what: 'preview' });
  // The app side: deckStaff and the refusal in runStaffPcKey (not only the key's display).
  assert.equal(deckStaff(false, null, false, 'Main', ['Main']), null, 'not a staff PC');
  assert.deepEqual(deckStaff(true, null, true, 'Main', ['Main', 'Break']), { can: ['trading', 'scene', 'preview-url', 'test-pull', 'show-card'], tradingPaused: true, scene: 'Main', scenes: ['Main', 'Break'] }, 'a PC paired with a code may use every action');
  assert.deepEqual(deckStaff(true, ['trading', 'scene', 'state', 'users'], false, '', [])?.can, ['trading', 'scene'], 'a mod-linked PC: the mod actions only');
  assert.deepEqual(deckStaff(true, ['trading', 'scene', 'preview-url', 'test-pull', 'show-card', 'gift'], false, '', [])?.can, ['trading', 'scene', 'preview-url', 'test-pull', 'show-card'], 'an admin account');
  assert.deepEqual(deckStaff(true, [], false, '', [])?.can, [], 'a signed-in account with no role may do nothing');
  const pcLog: string[] = [];
  const pcDid: string[] = [];
  let pcStaff: DeckStaff | null = null;
  const pcEnv: StaffPcEnv = {
    staff: () => pcStaff, log: l => pcLog.push(l),
    setTrading: async pause => { pcDid.push(`trading ${pause}`); return { ok: true, text: pause ? 'Trading paused' : 'Trading open' }; },
    scene: async name => { pcDid.push(`scene ${name}`); return { ok: true, text: `Switched to ${name}.` }; },
    openPreview: () => { pcDid.push('preview'); },
  };
  for (const r of [{ what: 'trading', pause: true }, { what: 'scene', name: 'Break' }, { what: 'preview' }] as const) {
    assert.deepEqual(await runStaffPcKey(pcEnv, r), { ok: false, text: 'Staff tools are off for this PC' }, `${r.what}: refused on a PC that is not a staff PC`);
  }
  assert.deepEqual(pcDid, [], 'nothing ran');
  pcStaff = modPc.staff;
  assert.deepEqual(await runStaffPcKey(pcEnv, { what: 'preview' }), { ok: false, text: 'This account\'s role cannot do that' }, 'a mod-linked PC is refused the preview');
  assert.deepEqual(pcDid, [], 'and it did not open');
  assert.deepEqual(await runStaffPcKey(pcEnv, { what: 'trading', pause: true }), { ok: true, text: 'Trading paused' });
  assert.deepEqual(await runStaffPcKey(pcEnv, { what: 'scene', name: 'Break' }), { ok: true, text: 'Switched to Break.' });
  pcStaff = staffOpen;
  assert.deepEqual(await runStaffPcKey(pcEnv, { what: 'preview' }), { ok: true, text: 'Opened the preview overlay' });
  assert.deepEqual(pcDid, ['trading true', 'scene Break', 'preview']);
  assert.deepEqual(await runStaffPcKey({ ...pcEnv, setTrading: async () => { throw new Error('boom'); } }, { what: 'trading', pause: false }), { ok: false, text: 'boom' });
  assert.ok(pcLog.includes('Staff: preview (Stream Deck key): refused, This account\'s role cannot do that'), 'the log says why');
  // Test pull and Show a card now honour the role too.
  const roleRan: Record<string, unknown>[] = [];
  const roleTools = { run: async (req: Record<string, unknown>) => { roleRan.push(req); return { ok: true, text: 'Queued' }; } };
  assert.deepEqual(await runStaffKey(roleTools, true, { action: 'test-pull' }, () => undefined, ['trading', 'scene']), { ok: false, text: 'This account\'s role cannot do that' });
  assert.deepEqual(roleRan, [], 'a mod-linked PC cannot test pull');
  assert.equal((await runStaffKey(roleTools, true, { action: 'test-pull' }, () => undefined, null)).ok, true, 'a code-paired staff PC can');

  // ── Test pull and Show a card are staff actions: refused with a reason, and logged, on a PC that is not a staff PC ──
  const staffLog: string[] = [];
  const staffRan: Record<string, unknown>[] = [];
  const tools = { run: async (req: Record<string, unknown>) => { staffRan.push(req); return { ok: true, text: 'Queued' }; } };
  assert.deepEqual(await runStaffKey(tools, false, { action: 'test-pull' }, l => staffLog.push(l)), { ok: false, text: 'Staff tools are off for this PC' });
  assert.deepEqual(await runStaffKey(null, true, { action: 'show-card', username: 'a_b' }, l => staffLog.push(l)), { ok: false, text: 'Staff tools are off for this PC' });
  assert.deepEqual(staffRan, [], 'nothing reaches the site without staff tools');
  assert.deepEqual(staffLog, ['Staff: test-pull (Stream Deck key): refused, Staff tools are off for this PC', 'Staff: show-card (Stream Deck key): refused, Staff tools are off for this PC']);
  assert.deepEqual(await runStaffKey({ run: async () => { throw new Error('boom'); } }, true, { action: 'test-pull' }, () => undefined), { ok: false, text: 'boom' });

  // ── The 61.5 OBS and overlay keys: Refresh overlay, Test pull / Show a card (the live hold, the card), Run checklist ──
  assert.deepEqual(parseRequest({ what: 'refresh' }), { what: 'refresh' });
  assert.deepEqual(parseRequest({ what: 'checklist' }), { what: 'checklist' });
  assert.deepEqual(parseRequest({ what: 'show-card', username: 'cheesy_1', card: '#12' }), { what: 'show-card', username: 'cheesy_1', card: '#12' });
  assert.deepEqual(parseRequest({ what: 'show-card', username: 'cheesy_1', card: 5 }), { what: 'show-card', username: 'cheesy_1' }, 'a card that is not text is left out');
  assert.deepEqual(parseRequest({ what: 'show-card', username: 'cheesy_1', card: 'x'.repeat(81) }), { what: 'show-card', username: 'cheesy_1' }, 'and so is one that is too long');
  assert.deepEqual(toAction({ what: 'refresh' }), { action: 'refresh' }, 'the same action as the Refresh the overlay button and hotkey, so the app\'s own OBS path runs');
  assert.equal(toAction({ what: 'checklist' }), null, 'the checklist has its own path in the app');
  assert.equal(toStaff({ what: 'refresh' }), null);
  assert.equal(toStaff({ what: 'checklist' }), null);
  assert.deepEqual(toStaff({ what: 'show-card', username: 'cheesy_1', card: '#12' }), { action: 'show-card', username: 'cheesy_1', card: '#12' }, 'the card goes to the staff action as the Staff tab sends it');
  assert.equal(ACTION_KIND['tv.cheesygidds.tcgbridge.refresh'], 'refresh');
  assert.equal(ACTION_KIND['tv.cheesygidds.tcgbridge.checklist'], 'checklist');
  const liveWire = parseServer(JSON.stringify({ t: 'state', state: { ...state(), live: true, checklist: { total: 8, failing: 2, junk: 1 } } }));
  assert.deepEqual(liveWire?.t === 'state' ? [liveWire.state.live, liveWire.state.checklist] : null, [true, { total: 8, failing: 2 }], 'live and the checklist survive the wire, rebuilt field by field');
  assert.deepEqual(oldApp?.t === 'state' ? [oldApp.state.live, oldApp.state.checklist] : null, [false, null], 'an app without them is not live and has run no checklist');
  const junkList = parseServer(JSON.stringify({ t: 'state', state: { ...state(), live: 'yes', checklist: { total: 'x' } } }));
  assert.deepEqual(junkList?.t === 'state' ? [junkList.state.live, junkList.state.checklist] : null, [false, null]);
  assert.equal(deckChecklist(null), null);
  const lines = (ok: number, bad: number, muted = 0) => ({ lines: [...Array(ok).fill({ tone: 'ok' }), ...Array(bad).fill({ tone: 'bad' }), ...Array(muted).fill({ tone: 'muted' })] });
  assert.deepEqual(deckChecklist(lines(8, 0)), { total: 8, failing: 0 });
  assert.deepEqual(deckChecklist(lines(6, 2, 1)), { total: 9, failing: 2 }, 'only the red lines fail');
  // Refresh overlay and Run checklist: the views.
  assert.equal(view('refresh', state(), {}, now).title, 'Refresh\noverlay');
  assert.deepEqual(requestFor('refresh', {}), { what: 'refresh' });
  assert.deepEqual(requestFor('checklist', {}), { what: 'checklist' });
  assert.equal(view('checklist', state(), {}, now).title, 'Run\nchecklist', 'before the first run');
  const okList = view('checklist', state({ checklist: { total: 8, failing: 0 } }), {}, now);
  const badList = view('checklist', state({ checklist: { total: 8, failing: 2 } }), {}, now);
  assert.equal(okList.title, 'Checklist\n8/8 OK');
  assert.equal(badList.title, 'Checklist\n2 failing');
  assert.ok(decodeURIComponent(okList.image).includes('#4ade80'), 'green when nothing fails');
  assert.ok(decodeURIComponent(badList.image).includes('#ee3b3b') && !decodeURIComponent(badList.image).includes('#4ade80'), 'red when something fails');
  assert.notEqual(okList.image, view('checklist', state(), {}, now).image);
  for (const k of ['refresh', 'checklist'] as const) {
    assert.match(view(k, null, {}, now).title, /App closed/);
    assert.match(view(k, state({ ready: false }), {}, now).title, /Not paired/);
    assert.equal(view(k, state(), {}, now).title === 'Staff only', false, `${k} is not a staff key`);
  }
  for (const c of [{ total: 12, failing: 0 }, { total: 12, failing: 11 }, { total: 100, failing: 100 }]) for (const line of view('checklist', state({ checklist: c }), {}, now).title.split('\n')) assert.ok(line.length <= 10, `"${line}" fits a key`);
  // Test pull and Show a card: the staff rules, the LIVE title, the card setting.
  assert.equal(view('test-pull', state(), {}, now).title, 'Staff only');
  assert.equal(view('show-card', modPc, { viewer: 'cheesy_1' }, now).title, 'Admins only', 'a mod-linked PC may not play on the overlay');
  assert.equal(view('test-pull', modPc, {}, now).title, 'Admins only');
  assert.equal(view('test-pull', { ...anyStaff, live: true }, {}, now).title, 'Test pull\nLIVE');
  assert.notEqual(view('test-pull', { ...anyStaff, live: true }, {}, now).image, view('test-pull', anyStaff, {}, now).image, 'live looks different');
  assert.equal(view('show-card', { ...anyStaff, live: true }, { viewer: 'cheesy_1' }, now).title, 'Show card\ncheesy_1');
  assert.equal(view('show-card', anyStaff, { viewer: 'a_very_long_viewer_name', card: ' Charizard VMAX Rainbow ' }, now).title, 'a_very_lo.\nCharizard.', 'with a card picked the key names the viewer and the card, cut to fit');
  assert.deepEqual(requestFor('show-card', { viewer: 'Cheesy_1', card: ' #12 ' }), { what: 'show-card', username: 'cheesy_1', card: '#12' });
  assert.deepEqual(requestFor('show-card', { viewer: 'cheesy_1', card: 7 }), { what: 'show-card', username: 'cheesy_1' }, 'no card = the site picks one');
  assert.equal(liveHold('test-pull', { ...anyStaff, live: true }), true);
  assert.equal(liveHold('test-pull', anyStaff), false, 'not live: one press');
  assert.equal(liveHold('refresh', { ...anyStaff, live: true }), false, 'only the two that play on the overlay need the hold');

  // ── The server: token, loopback only ──
  const dir =mkdtempSync(join(tmpdir(), 'tcg-deck-'));
  const file = join(dir, 'streamdeck.json');
  const calls: ControlAction[] = [];
  let refuse = false;
  let current = state();
  const logs: string[] = [];
  let changes = 0;
  const staffRuns: Record<string, unknown>[] = [];
  let staffOn = false;
  let liveStaff: DeckStaff | null = null;
  let roleCan: string[] | null = null;
  let checklistRuns = 0;
  const staffTools = { run: async (req: Record<string, unknown>) => { staffRuns.push(req); return { ok: true, text: 'Queued' }; } };
  const server = new DeckServer({
    file, version: '9.9.9', state: () => current, ports: [0], helloMs: 150, log: l => logs.push(l), onChange: () => { changes++; },
    run: async a => { calls.push(a); return refuse ? { ok: false, text: 'Pulls are not open' } : { ok: true, text: 'Done' }; },
    staff: body => runStaffKey(staffTools, staffOn, body, l => logs.push(l), roleCan),
    staffPc: r => runStaffPcKey({ ...pcEnv, staff: () => liveStaff, log: l => logs.push(l) }, r),
    checklist: async () => { checklistRuns++; return { ok: true, text: 'Ready to stream.' }; },
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

    // Test pull and Show a card: a PC that is not a staff PC refuses, the key shows its alert and the log says why.
    const x = { test: new FakeKey(), card: new FakeKey(), nocard: new FakeKey(), queue: new FakeKey(), packs: new FakeKey(), goal: new FakeKey(), big: new FakeKey(), top: new FakeKey(), happy: new FakeKey() };
    keys.add('k-test', 'test-pull', x.test, {});
    keys.add('k-card', 'show-card', x.card, { viewer: '@Cheesy_1' });
    keys.add('k-nocard', 'show-card', x.nocard, {});
    calls.length = 0;
    await keys.down('k-test');
    await keys.down('k-card');
    assert.equal(x.test.title, 'Staff only', 'since 61.5 the keys say so on a PC that is not a staff PC');
    assert.equal(x.test.alerts, 1, 'a test pull from a PC without staff tools shows the alert');
    assert.equal(x.card.alerts, 1);
    assert.deepEqual(staffRuns, [], 'nothing reached the site');
    // The app refuses a request sent to it anyway, and logs why.
    const rawS = client(url);
    rawS.ws.on('open', () => rawS.ws.send(hello(server.token)));
    await until('the raw client to be let in', () => rawS.got.length > 0);
    rawS.ws.send(JSON.stringify({ t: 'do', n: 1, req: { what: 'test-pull' } }));
    rawS.ws.send(JSON.stringify({ t: 'do', n: 2, req: { what: 'show-card', username: 'cheesy_1' } }));
    await until('two refusals', () => rawS.got.filter(g => g.includes('"done"')).length === 2);
    assert.ok(rawS.got.filter(g => g.includes('"done"')).every(g => g.includes('"ok":false') && g.includes('Staff tools are off for this PC')));
    assert.deepEqual(staffRuns, [], 'enforced in the app, not only on the key');
    assert.ok(logs.includes('Staff: test-pull (Stream Deck key): refused, Staff tools are off for this PC'), 'the log says why');
    assert.ok(logs.includes('Staff: show-card (Stream Deck key): refused, Staff tools are off for this PC'));
    rawS.ws.close();
    staffOn = true;
    current = adminPc;
    server.broadcast();
    await until('the staff test pull key', () => x.test.title === 'Test pull');
    await keys.down('k-test');
    await keys.down('k-card');
    assert.deepEqual(staffRuns, [{ op: 'do', action: 'test-pull' }, { op: 'do', action: 'show-card', username: 'cheesy_1' }], 'a staff PC runs the same staff actions as the Preview overlay');
    assert.equal(x.test.oks, 1);
    assert.equal(x.card.oks, 1);
    await keys.down('k-nocard');
    assert.equal(x.nocard.alerts, 1, 'a Show a card key with no viewer named shows the alert');
    assert.equal(staffRuns.length, 2, 'and asks for nothing');
    assert.deepEqual(calls, [], 'the staff keys never run a control action');

    // 61.5, through the real server. Refresh overlay is one press and runs the app's refresh action; Show a card sends the card picked in its settings.
    const ob = { refresh: new FakeKey(), checklist: new FakeKey(), pick: new FakeKey() };
    keys.add('k-refresh', 'refresh', ob.refresh, {});
    keys.add('k-checklist', 'checklist', ob.checklist, {});
    keys.add('k-pick', 'show-card', ob.pick, { viewer: 'Cheesy_1', card: ' #12 ' });
    await keys.down('k-refresh');
    assert.deepEqual(calls, [{ action: 'refresh' }], 'Refresh overlay runs the same action as the Refresh the overlay button');
    assert.equal(ob.refresh.oks, 1);
    refuse = true;
    await keys.down('k-refresh');
    assert.equal(ob.refresh.alerts, 1, 'OBS not answering shows the alert');
    refuse = false;
    calls.length = 0;
    staffRuns.length = 0;
    await keys.down('k-pick');
    assert.deepEqual(staffRuns, [{ op: 'do', action: 'show-card', username: 'cheesy_1', card: '#12' }], 'the card picked in the key\'s settings reaches the staff action');
    assert.equal(ob.pick.title, 'cheesy_1\n#12');
    keys.setSettings('k-pick', { viewer: 'cheesy_1' });
    staffRuns.length = 0;
    await keys.down('k-pick');
    assert.deepEqual(staffRuns, [{ op: 'do', action: 'show-card', username: 'cheesy_1' }], 'no card picked: the site picks');

    // While OBS is live both play on the live overlay: a short press only says so, a 1 second hold plays. Not live: one press.
    current = state({ staff: staffOpen, live: true });
    server.broadcast();
    await until('the LIVE keys', () => x.test.title === 'Test pull\nLIVE' && x.card.title === 'Show card\ncheesy_1');
    staffRuns.length = 0;
    for (const [id, fake, body] of [['k-test', x.test, { op: 'do', action: 'test-pull' }], ['k-card', x.card, { op: 'do', action: 'show-card', username: 'cheesy_1' }]] as const) {
      const oks = fake.oks;
      const alerts = fake.alerts;
      await keys.down(id); clockNow += 200; await keys.up(id);
      assert.deepEqual(staffRuns, [], `${id}: a short press while live plays nothing`);
      assert.equal(fake.title, 'Live!\nHold 1 s');
      assert.equal(fake.alerts, alerts + 1, `${id}: and shows the alert`);
      clockNow += 2100;
      await keys.down(id); clockNow += HOLD_MS - 1; await keys.up(id);
      assert.deepEqual(staffRuns, [], `${id}: just under a second plays nothing`);
      clockNow += 2100;
      await keys.down(id); clockNow += HOLD_MS; await keys.up(id);
      assert.deepEqual(staffRuns, [body], `${id}: a 1 second hold plays it`);
      assert.equal(fake.oks, oks + 1);
      staffRuns.length = 0;
      clockNow += 2100;
    }
    for (const line of ['Test pull', 'LIVE', 'Live!', 'Hold 1 s']) assert.ok(line.length <= 10);
    current = adminPc;
    server.broadcast();
    await until('the keys when not live', () => x.test.title === 'Test pull');
    await keys.down('k-test'); await keys.up('k-test');
    assert.deepEqual(staffRuns, [{ op: 'do', action: 'test-pull' }], 'not live: one press plays it, once');
    staffRuns.length = 0;
    // A mod-linked PC: the keys say so and send nothing, and the app refuses a request sent anyway.
    roleCan = modPc.staff!.can;
    current = state({ staff: modPc.staff, live: true });
    server.broadcast();
    await until('Admins only', () => x.test.title === 'Admins only' && x.card.title === 'Admins only');
    await keys.down('k-test'); await keys.up('k-test');
    await keys.down('k-card'); await keys.up('k-card');
    assert.deepEqual(staffRuns, [], 'a mod-linked PC plays nothing');
    const rawM = client(url);
    rawM.ws.on('open', () => rawM.ws.send(hello(server.token)));
    await until('the mod raw client', () => rawM.got.length > 0);
    rawM.ws.send(JSON.stringify({ t: 'do', n: 1, req: { what: 'test-pull' } }));
    rawM.ws.send(JSON.stringify({ t: 'do', n: 2, req: { what: 'show-card', username: 'cheesy_1' } }));
    await until('two mod refusals', () => rawM.got.filter(g => g.includes('"done"')).length === 2);
    assert.ok(rawM.got.filter(g => g.includes('"done"')).every(g => g.includes('"ok":false') && g.includes('role cannot do that')), 'enforced in the app by role');
    assert.deepEqual(staffRuns, []);
    rawM.ws.close();
    roleCan = null;

    // Run checklist: a press runs the app's checklist; the key shows the last result (green with the count, or red with the failing count) until the next run.
    current = state();
    server.broadcast();
    await until('Run checklist', () => ob.checklist.title === 'Run\nchecklist');
    await keys.down('k-checklist');
    assert.equal(checklistRuns, 1, 'a press runs the checklist once');
    assert.equal(ob.checklist.oks, 1);
    current = state({ checklist: deckChecklist(lines(8, 0)) });
    server.broadcast();
    await until('the green checklist', () => ob.checklist.title === 'Checklist\n8/8 OK');
    clockNow += 60_000;
    keys.drawAll();
    assert.equal(ob.checklist.title, 'Checklist\n8/8 OK', 'the result stays until the next run');
    current = state({ checklist: deckChecklist(lines(6, 2)) });
    server.broadcast();
    await until('the red checklist', () => ob.checklist.title === 'Checklist\n2 failing');
    assert.notEqual(ob.checklist.image, okList.image);
    for (const id of ['k-refresh', 'k-checklist', 'k-pick']) keys.remove(id);
    current = state();
    server.broadcast();

    // Stat keys: the app wants stats only while a Stat key is on a deck.
    assert.deepEqual(server.wanted, [], 'no Stat key, no stats wanted');
    assert.equal(statsPlan(noStatMap(), false, server.wanted).poll, false, 'so nothing is polled');
    keys.add('k-queue', 'stat', x.queue, { stat: 'queue' });
    await until('the queue stat to be wanted', () => server.wanted.join() === 'queue');
    keys.add('k-packs', 'stat', x.packs, { stat: 'packs' });
    await until('two stats to be wanted', () => server.wanted.join() === 'queue,packs');
    assert.deepEqual(statsPlan(noStatMap(), false, server.wanted), { poll: true, obs: false, ask: ['packs', 'queue'] });
    keys.setSettings('k-packs', { stat: 'goal' });
    await until('the goal stat to be wanted', () => server.wanted.join() === 'queue,goal');
    keys.remove('k-packs');
    await until('the goal stat to be dropped', () => server.wanted.join() === 'queue');
    keys.add('k-packs', 'stat', x.packs, { stat: 'packs' });
    keys.add('k-goal', 'stat', x.goal, { stat: 'goal' });
    await until('all three', () => server.wanted.join() === 'queue,packs,goal');
    current = state({ stats: { queue: 4, packs: 12, goal: 'Pack goal: 37 / 50' } });
    server.broadcast();
    await until('the stats to show', () => x.queue.title === 'Queue\n4' && x.packs.title === 'Packs\n12' && x.goal.title === 'Pack goal\n37 / 50');

    // A Queue key skips the next pull only on a second press within 3 seconds; the other stat keys do nothing on a press.
    calls.length = 0;
    await keys.down('k-queue');
    assert.deepEqual(calls, [], 'the first press does not skip');
    assert.equal(x.queue.title, 'Press again\nto skip');
    clockNow += SKIP_MS - 1;
    await keys.down('k-queue');
    assert.deepEqual(calls, [{ action: 'skip' }], 'a second press inside 3 seconds skips');
    assert.equal(x.queue.oks, 1);
    calls.length = 0;
    await keys.down('k-queue');
    clockNow += SKIP_MS + 1;
    await keys.down('k-queue');
    assert.deepEqual(calls, [], 'a second press after 3 seconds only starts over');
    await keys.down('k-queue');
    assert.deepEqual(calls, [{ action: 'skip' }], 'and the next one skips');
    calls.length = 0;
    await keys.down('k-packs');
    await keys.down('k-packs');
    await keys.down('k-goal');
    await keys.down('k-goal');
    assert.deepEqual(calls, [], 'the packs and goal keys do nothing on a press');
    assert.equal(x.packs.alerts + x.goal.alerts, 0);
    for (const id of ['k-queue', 'k-packs', 'k-goal']) keys.remove(id);
    await until('no stats wanted', () => server.wanted.length === 0);

    // 61.4 live info: last big pull and top puller are wanted from the site like the other stats; the happy hour time left is not (the app already holds it, so no polling).
    keys.add('k-happy', 'stat', x.happy, { stat: 'happy' });
    await wait(50);
    assert.deepEqual(server.wanted, [], 'a happy hour time key asks the site for nothing');
    assert.equal(statsPlan(noStatMap(), false, server.wanted).poll, false, 'and nothing is polled for it');
    keys.add('k-big', 'stat', x.big, { stat: 'lastBig' });
    keys.add('k-top', 'stat', x.top, { stat: 'topPuller' });
    await until('the two name stats to be wanted', () => server.wanted.join() === 'lastBig,topPuller');
    assert.deepEqual(statsPlan(noStatMap(), false, server.wanted).ask, ['lastBig', 'topPuller']);
    current = state({ happy: { what: 'Free packs', endsAt: clockNow + 754_000 }, stats: { lastBig: { username: 'brie_fan', cardName: 'Charizard' }, topPuller: { username: 'cheese', packs: 9 } } });
    server.broadcast();
    await until('the live info to show', () => x.big.title === 'brie_fan\nCharizard' && x.top.title === 'cheese\n9 packs' && x.happy.title === 'Happy hour\n12:34');
    calls.length = 0;
    for (const id of ['k-happy', 'k-big', 'k-top']) { await keys.down(id); await keys.up(id); }
    assert.deepEqual(calls, [], 'a press on a live info key does nothing');
    assert.equal(x.big.alerts + x.top.alerts + x.happy.alerts, 0);
    for (const id of ['k-happy', 'k-big', 'k-top']) keys.remove(id);
    await until('no stats wanted after the live info keys', () => server.wanted.length === 0);

    // Queue keys: Skip next pull is one press; Clear queue only after a hold of a second, a short press shows the hint; Pulls waiting wants the queue stat and does nothing when pressed.
    const q = { skip: new FakeKey(), clear: new FakeKey(), count: new FakeKey() };
    keys.add('k-skip', 'skip', q.skip, {});
    keys.add('k-clear', 'clear-queue', q.clear, {});
    keys.add('k-count', 'queue', q.count, {});
    await until('the waiting count to be wanted', () => server.wanted.join() === 'queue');
    keys.add('k-count2', 'queue', new FakeKey(), {});
    keys.remove('k-count2');
    await until('the count key still on a deck', () => server.wanted.join() === 'queue');
    calls.length = 0;
    await keys.down('k-skip');
    assert.deepEqual(calls, [{ action: 'skip' }], 'one press skips the next pull');
    assert.equal(q.skip.oks, 1);
    await keys.down('k-clear'); clockNow += 200; await keys.up('k-clear');
    assert.deepEqual(calls, [{ action: 'skip' }], 'a short press does not clear the queue');
    assert.equal(q.clear.title, 'Hold 1 second\nto clear');
    assert.equal(q.clear.alerts, 1);
    clockNow += 2100;
    await keys.down('k-clear'); clockNow += HOLD_MS - 1; await keys.up('k-clear');
    assert.equal(calls.length, 1, 'just under a second does not clear it');
    await keys.down('k-clear'); clockNow += HOLD_MS; await keys.up('k-clear');
    assert.deepEqual(calls, [{ action: 'skip' }, { action: 'clear-queue' }], 'a hold of a second clears it');
    assert.equal(q.clear.oks, 1);
    await keys.down('k-count'); await keys.up('k-count');
    assert.equal(calls.length, 2, 'the count key does nothing when pressed');
    current = state({ stats: { queue: 6 } });
    server.broadcast();
    await until('the waiting count to show', () => q.count.title === 'Waiting\n6');
    for (const id of ['k-skip', 'k-clear', 'k-count']) keys.remove(id);
    await until('no stats wanted after the queue keys', () => server.wanted.length === 0);

    // Staff keys (61.3), through the real server. A PC that is not a staff PC: the keys say so, send nothing, and the app refuses a request sent anyway.
    const sk = { trading: new FakeKey(), scene: new FakeKey(), preview: new FakeKey(), none: new FakeKey() };
    keys.add('k-trading', 'trading', sk.trading, {});
    keys.add('k-scene', 'scene', sk.scene, { scene: 'Break' });
    keys.add('k-preview', 'preview', sk.preview, {});
    keys.add('k-sceneless', 'scene', sk.none, {});
    pcDid.length = 0;
    current = state();
    server.broadcast();
    await until('Staff only on the keys', () => sk.trading.title === 'Staff only' && sk.scene.title === 'Staff only' && sk.preview.title === 'Staff only');
    for (const id of ['k-trading', 'k-scene', 'k-preview']) { await keys.down(id); await keys.up(id); }
    assert.equal(sk.trading.alerts + sk.scene.alerts + sk.preview.alerts, 3, 'a press on a refused staff key shows the alert');
    assert.deepEqual(pcDid, [], 'and does nothing');
    const raw = client(url);
    raw.ws.on('open', () => raw.ws.send(hello(server.token)));
    await until('the raw client to be let in', () => raw.got.length > 0);
    for (const [n, req] of [[1, { what: 'trading', pause: true }], [2, { what: 'scene', name: 'Break' }], [3, { what: 'preview' }]] as const) raw.ws.send(JSON.stringify({ t: 'do', n, req }));
    await until('three refusals', () => raw.got.filter(g => g.includes('"done"')).length === 3);
    assert.ok(raw.got.filter(g => g.includes('"done"')).every(g => g.includes('"ok":false') && g.includes('Staff tools are off for this PC')), 'the app refuses a request sent to it from a PC that is not a staff PC');
    assert.deepEqual(pcDid, [], 'enforced in the app, not only on the key');
    // A mod-linked PC: trading and scene work, the preview is refused with a clear title and in the app.
    liveStaff = modPc.staff;
    current = modPc;
    server.broadcast();
    await until('the mod keys', () => sk.trading.title === 'Trading\nopen' && sk.scene.title === 'Scene\nBreak' && sk.preview.title === 'Admins only');
    assert.equal(sk.none.title, 'Pick a scene');
    await keys.down('k-preview'); await keys.up('k-preview');
    assert.equal(sk.preview.alerts, 2);
    raw.ws.send(JSON.stringify({ t: 'do', n: 4, req: { what: 'preview' } }));
    await until('the mod preview refusal', () => raw.got.some(g => g.includes('"n":4') && g.includes('"ok":false') && g.includes('role cannot do that')));
    assert.deepEqual(pcDid, [], 'a mod PC did not open the preview');
    await keys.down('k-scene');
    assert.deepEqual(pcDid, ['scene Break'], 'a mod may switch the scene');
    await keys.down('k-sceneless');
    assert.equal(sk.none.alerts, 1, 'a scene key with no scene picked shows the alert');
    assert.equal(pcDid.length, 1);
    // An admin PC: pausing trading needs a 1 second hold, resuming is one press, the preview opens.
    liveStaff = staffOpen;
    current = adminPc;
    server.broadcast();
    await until('the admin keys', () => sk.preview.title === 'Preview\noverlay' && sk.scene.image !== '');
    pcDid.length = 0;
    const alertsT = sk.trading.alerts;
    await keys.down('k-trading'); clockNow += 200; await keys.up('k-trading');
    assert.deepEqual(pcDid, [], 'a short press does not pause trading');
    assert.equal(sk.trading.title, 'Hold 1 second\nto pause');
    assert.equal(sk.trading.alerts, alertsT + 1);
    clockNow += 2100;
    await keys.down('k-trading'); clockNow += HOLD_MS - 1; await keys.up('k-trading');
    assert.deepEqual(pcDid, [], 'just under a second does not pause it');
    clockNow += 2100;
    await keys.down('k-trading'); clockNow += HOLD_MS; await keys.up('k-trading');
    assert.deepEqual(pcDid, ['trading true'], 'a hold of a second pauses trading');
    current = state({ staff: { ...staffOpen, tradingPaused: true } });
    server.broadcast();
    await until('the paused trading key', () => sk.trading.title === 'Trading\npaused');
    await keys.down('k-trading'); clockNow += 100; await keys.up('k-trading');
    assert.deepEqual(pcDid, ['trading true', 'trading false'], 'one short press resumes it');
    await keys.down('k-preview');
    assert.deepEqual(pcDid.slice(2), ['preview']);
    await keys.down('k-scene');
    assert.equal(pcDid.at(-1), 'scene Break');
    assert.ok(logs.includes('Staff: preview (Stream Deck key): refused, This account\'s role cannot do that'), 'the log says why a mod was refused');
    for (const id of ['k-trading', 'k-scene', 'k-preview', 'k-sceneless']) keys.remove(id);
    raw.ws.close();
    current = state();
    server.broadcast();

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
  const blocker = new DeckServer({ file: join(tmpdir(), 'tcg-deck-blocker.json'), version: '1', state: () => state(), ports: [0], run: async () => ({ ok: true, text: '' }), staff: async () => ({ ok: true, text: '' }), staffPc: async () => ({ ok: true, text: '' }), checklist: async () => ({ ok: true, text: '' }), onChange: () => undefined, log: () => undefined });
  await blocker.start();
  try {
    const busy = new DeckServer({ file: join(tmpdir(), 'tcg-deck-busy.json'), version: '1', state: () => state(), ports: [blocker.listeningPort], run: async () => ({ ok: true, text: '' }), staff: async () => ({ ok: true, text: '' }), staffPc: async () => ({ ok: true, text: '' }), checklist: async () => ({ ok: true, text: '' }), onChange: () => undefined, log: () => undefined });
    await busy.start();
    assert.match(busy.error, /are used by other programs/);
    assert.equal(existsSync(join(tmpdir(), 'tcg-deck-busy.json')), false, 'no file is written when nothing listens');
  } finally { await blocker.stop(); }
}
