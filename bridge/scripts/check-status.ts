// The status pill's item list (ROADMAP 59.3): what needs the streamer, built from plain facts. Run with the rest: npm run check.
import assert from 'node:assert/strict';
import { attentionItems, type AttentionFacts } from '../src/status';

export function statusChecks(): void {
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
