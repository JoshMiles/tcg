// The status pill's item list (ROADMAP 59.3): what needs the streamer, built from plain facts; and the sidebar's pages (59.4): every Fix jump lands on a page. Run with the rest: npm run check.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { attentionItems, type AttentionFacts } from '../src/status';

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
  assert.deepEqual([...gos].sort(), ['card-mix', 'card-obs', 'card-site', 'card-unpair', 'pairing'], 'the jumps the pill can make');
  for (const go of gos) assert.ok(tabs.includes(pageOf(go)), `${go} sits on a page the sidebar can open`);
  assert.equal(pageOf('pairing'), 'home', 'pairing is the first screen');
  assert.equal(pageOf('card-mix'), 'connections');
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
  assert.deepEqual([mix.id, mix.fix, mix.go], ['mix', 'goto', 'card-mix'], 'Mix It Up down: Fix goes to its card');
  assert.deepEqual(attentionItems({ ...good, obsConnected: false }).map(i => i.go), ['card-obs'], 'OBS down while switched on');
  assert.deepEqual(attentionItems({ ...good, site: 'offline' }).map(i => i.go), ['card-site'], 'site unreachable');
  assert.deepEqual(attentionItems({ ...good, site: 'revoked' }).map(i => i.go), ['card-unpair'], 'the site dropped this PC: unpair, then pair again');

  assert.deepEqual(ids({ updateVersion: '0.28.0', startNote: 'x', site: 'offline', mixFound: false, obsConnected: false }), ['update', 'check', 'site', 'mix', 'obs'], 'all of it, update first');
  assert.deepEqual(ids({ paired: false, site: 'offline', mixFound: false, updateVersion: '0.28.0' }), ['update', 'pair'], 'not paired: only the update and the pairing, no link noise');
  for (const i of attentionItems({ ...good, updateVersion: '1', startNote: 'x', site: 'revoked', mixFound: false, obsConnected: false })) {
    assert.ok(i.text && i.detail && i.button, `${i.id} has text, a reason and a button`);
    assert.ok(![8212, 8211].some(c => (i.text + i.detail).includes(String.fromCharCode(c))), `${i.id} has no long dash`);
  }
}
