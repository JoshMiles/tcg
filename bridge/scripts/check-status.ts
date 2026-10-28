// The status pill's item list (ROADMAP 59.3): what needs the streamer, built from plain facts; and the sidebar's pages (59.4): every Fix jump lands on a page. Run with the rest: npm run check.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { attentionItems, type AttentionFacts } from '../src/status';
import { CONN_ORDER, GO_CONNECT, connOf, connectionRows, fixPlan, goFor, rowFor, type ConnFacts, type ConnId } from '../src/connections';

/** The sidebar and the jumps (59.4): the page of every `go:` id, and every id the window script uses, must exist in index.html. */
function pageChecks(): void {
  const html = readFileSync(join(__dirname, '..', 'renderer', 'index.html'), 'utf8');
  const js = readFileSync(join(__dirname, '..', 'renderer', 'renderer.js'), 'utf8');
  const tabs = [...html.matchAll(/data-tab="([\w-]+)"/g)].map(m => m[1]);
  const panels = [...html.matchAll(/data-panel="([\w-]+)"/g)].map(m => m[1]);
  assert.deepEqual([...tabs].sort(), [...panels].sort(), 'every sidebar button has a page and every page a button');
  assert.deepEqual([...tabs].sort(), ['about', 'app', 'buttons', 'connections', 'controls', 'feed', 'home', 'notifications', 'overlay', 'stream', 'viewers'], 'the eleven pages of the 59.4 sidebar, once each');

  const allIds = [...html.matchAll(/\sid="([\w-]+)"/g)].map(m => m[1]);
  const ids = new Set(allIds);
  assert.equal(ids.size, allIds.length, 'no id twice in index.html');
  const used = [...js.matchAll(/\$\('([\w-]+)'\)/g), ...js.matchAll(/setDot\('([\w-]+)'/g)].map(m => m[1]);
  for (const m of js.matchAll(/action\('([\w-]+)', '([\w-]+)'/g)) used.push(m[1], m[2]);
  for (const id of used) assert.ok(ids.has(id), `renderer.js uses #${id}, which index.html does not have`);

  /** The page a card sits on: the last data-panel before its id. */
  const pageOf = (id: string): string => {
    const at = html.indexOf(` id="${id}"`);
    assert.ok(at >= 0, `#${id} is in index.html`);
    const before = [...html.slice(0, at).matchAll(/data-panel="([\w-]+)"/g)];
    return before[before.length - 1][1];
  };
  const bad: AttentionFacts = { paired: true, updateVersion: '1', startNote: 'x', site: 'revoked', mixFound: false, obsEnabled: true, obsConnected: false };
  const gos = new Set<string>();
  for (const f of [bad, { ...bad, site: 'offline' as const }, { ...bad, paired: false }]) for (const i of attentionItems(f)) if (i.go) gos.add(i.go);
  assert.deepEqual([...gos].sort(), ['conn-account', 'conn-mix', 'conn-obs', 'connect'], 'the jumps the pill can make');
  // A conn-<id> jump selects that connection on the Connections page; 'connect' is the first-run screen, before every page.
  for (const go of gos) {
    if (go === GO_CONNECT) continue;
    const conn = connOf(go);
    assert.ok(conn, `${go} names a connection`);
    assert.equal(pageOf(`detail-${conn}`), 'connections', `${go} sits on the Connections page`);
    assert.ok(html.includes(`data-conn="${conn}"`), `${conn} has a row in the list`);
  }
  assert.ok(html.indexOf('id="connect"') >= 0 && html.indexOf('id="connect"') < html.indexOf('data-panel='), 'the Connect screen comes before every page');
  for (const conn of CONN_ORDER) assert.equal(pageOf(`detail-${conn}`), 'connections', `${conn} detail is on Connections`);
  assert.equal(pageOf('whatsnew-card'), 'about', "What's new is on the About page");
}

export function statusChecks(): void {
  pageChecks();
  const good: AttentionFacts = { paired: true, updateVersion: '', startNote: '', site: 'connected', mixFound: true, obsEnabled: true, obsConnected: true };
  const ids = (o: Partial<AttentionFacts>): string[] => attentionItems({ ...good, ...o }).map(i => i.id);

  assert.deepEqual(ids({}), [], 'everything fine: no items, "All good"');
  assert.deepEqual(ids({ obsEnabled: false, obsConnected: false }), [], 'OBS switched off is not a problem');
  assert.deepEqual(ids({ site: null, mixFound: false, obsConnected: false }), [], 'service not running yet: nothing is said about the links');
  assert.deepEqual(ids({ site: 'connecting' }), [], 'still connecting is not a problem');

  const up = attentionItems({ ...good, updateVersion: '0.28.0' })[0];
  assert.deepEqual([up.id, up.fix, up.button, up.text], ['update', 'restart', 'Restart', 'Update 0.28.0 is ready'], 'update ready: Restart');
  const check = attentionItems({ ...good, startNote: "Couldn't check for updates" })[0];
  assert.deepEqual([check.id, check.fix, check.button, check.text], ['check', 'recheck', 'Try again', "Couldn't check for updates"], 'update check failed: Try again');
  const mix = attentionItems({ ...good, mixFound: false })[0];
  assert.deepEqual([mix.id, mix.fix, mix.go], ['mix', 'goto', 'conn-mix'], 'Mix It Up down: Fix goes to its connection');
  assert.deepEqual(attentionItems({ ...good, obsConnected: false }).map(i => i.go), ['conn-obs'], 'OBS down while switched on');
  assert.deepEqual(attentionItems({ ...good, site: 'offline' }).map(i => i.go), ['conn-account'], 'site unreachable');
  assert.deepEqual(attentionItems({ ...good, site: 'revoked' }).map(i => i.go), ['conn-account'], 'the site dropped this PC: unpair, then pair again');

  assert.deepEqual(ids({ updateVersion: '0.28.0', startNote: 'x', site: 'offline', mixFound: false, obsConnected: false }), ['update', 'check', 'site', 'mix', 'obs'], 'all of it, update first');
  assert.deepEqual(ids({ paired: false, site: 'offline', mixFound: false, updateVersion: '0.28.0' }), ['update', 'pair'], 'not paired: only the update and the pairing, no link noise');
  for (const i of attentionItems({ ...good, updateVersion: '1', startNote: 'x', site: 'revoked', mixFound: false, obsConnected: false })) {
    assert.ok(i.text && i.detail && i.button, `${i.id} has text, a reason and a button`);
    assert.ok(![8212, 8211].some(c => (i.text + i.detail).includes(String.fromCharCode(c))), `${i.id} has no long dash`);
  }
  connectionChecks();
}

/** The Connections page's rows and fix steps (59.6). */
function connectionChecks(): void {
  const ok: ConnFacts = { paired: true, pairedAs: 'Josh', site: 'connected', siteError: '', mixFound: true, obsEnabled: true, obsConnected: true, obsStreaming: false, obsError: '', deckInstalled: true, deckOn: true, deckConnected: true, deckError: '' };
  const line = (id: ConnId, o: Partial<ConnFacts> = {}): string => rowFor(id, { ...ok, ...o }).line;
  const tone = (id: ConnId, o: Partial<ConnFacts> = {}): string => rowFor(id, { ...ok, ...o }).tone;
  assert.deepEqual(CONN_ORDER, ['account', 'mix', 'obs', 'deck'], 'the list order');

  assert.deepEqual([line('account'), tone('account')], ['Paired as Josh', 'ok']);
  assert.deepEqual([line('account', { site: 'offline' }), tone('account', { site: 'offline' })], ['Cannot reach the site', 'bad']);
  assert.equal(tone('account', { site: 'connecting' }), 'warn');
  assert.equal(line('account', { paired: false }), 'Not paired');
  assert.equal(line('account', { site: 'revoked' }), 'Not paired', 'revoked reads as not paired');

  assert.deepEqual([line('mix'), tone('mix')], ['Connected', 'ok']);
  assert.deepEqual([line('mix', { mixFound: false }), tone('mix', { mixFound: false })], ['Not answering', 'bad']);

  assert.deepEqual([line('obs', { obsEnabled: false }), tone('obs', { obsEnabled: false })], ['Off', 'off']);
  assert.equal(line('obs'), 'Connected');
  assert.equal(line('obs', { obsStreaming: true }), 'Connected, the stream is live');
  assert.deepEqual([line('obs', { obsConnected: false }), tone('obs', { obsConnected: false })], ['Not connected', 'bad']);

  assert.equal(line('deck'), 'Plugin connected');
  assert.equal(line('deck', { deckOn: false }), 'Off');
  assert.equal(line('deck', { deckConnected: false }), 'Waiting for the plugin');
  assert.equal(line('deck', { deckConnected: false, deckInstalled: false }), 'Plugin not installed');
  assert.equal(line('deck', { deckError: 'x' }), 'Needs attention');

  // The fix steps: only when something is wrong.
  for (const id of CONN_ORDER) assert.deepEqual(fixPlan(id, ok).steps, [], `${id} is fine: no fix steps`);
  const mix = fixPlan('mix', { ...ok, mixFound: false });
  assert.equal(mix.steps.length, 3, 'Mix It Up API off: three steps');
  assert.ok(mix.again && mix.steps[1].includes('Developer API'));
  const obs = fixPlan('obs', { ...ok, obsConnected: false });
  assert.ok(obs.steps.length === 3 && obs.again, 'OBS not connected: three steps and Check again');
  assert.deepEqual(fixPlan('obs', { ...ok, obsEnabled: false, obsConnected: false }).steps, [], 'OBS switched off needs no fix');
  assert.equal(fixPlan('account', { ...ok, site: 'offline' }).steps.length, 2);
  assert.equal(fixPlan('deck', { ...ok, deckConnected: false }).steps.length, 1);

  // Jumps.
  assert.equal(goFor('obs'), 'conn-obs');
  assert.equal(connOf('conn-mix'), 'mix');
  assert.equal(connOf('connect'), null);
  assert.equal(connectionRows(ok).length, 4);

  // No long dash anywhere in what the window shows.
  const bad = { ...ok, site: 'offline' as const, mixFound: false, obsConnected: false, deckConnected: false };
  for (const r of [...connectionRows(ok), ...connectionRows(bad)]) {
    const text = [r.name, r.line, r.sentence, ...r.fix.steps].join(' ');
    assert.ok(![8212, 8211].some(c => text.includes(String.fromCharCode(c))), `${r.id} has no long dash`);
  }
}
