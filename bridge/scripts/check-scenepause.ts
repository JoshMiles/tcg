// Pause pulls on chosen scenes (ROADMAP 57.2): a fake OBS and a fake site that keeps the site's rule (lib/pull-pause.ts setScenePause,
// checked for real in scripts/check-bridge-actions.mts), driven through the real ObsWatcher, SiteClient and ScenePause.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { ObsWatcher } from '../src/obs';
import { cleanScenePause, defaultScenePause, ScenePause, type ScenePauseSettings } from '../src/scenepause';
import { SiteClient } from '../src/site';
import { FakeObs } from './fake-obs';

const waitFor = async (what: string, cond: () => boolean, ms = 4000) => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise(r => setTimeout(r, 10));
  }
};
const pause = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function scenePauseChecks(): Promise<void> {
  assert.deepEqual(defaultScenePause(), { on: false, scenes: [] }, 'off by default');
  assert.deepEqual(cleanScenePause({ on: 'yes', scenes: ['A', 'A', 7, '', 'B'] }), { on: false, scenes: ['A', 'B'] });
  assert.deepEqual(cleanScenePause(null), { on: false, scenes: [] });

  // The fake site: a pause switch with a reason, and the two actions the app uses.
  const site = { on: false, reason: '', actions: [] as (string | null)[], down: false };
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      const json = body ? JSON.parse(body) : {};
      if (site.down) { res.writeHead(500); return void res.end('{}'); }
      if (json.action === 'scene-pause') {
        site.actions.push(json.scene);
        const mine = site.on && site.reason.startsWith('scene ');
        if (json.scene === null) { if (mine) { site.on = false; site.reason = ''; } } else if (!site.on || mine) { site.on = true; site.reason = `scene ${json.scene}`; }
      } else if (json.action === 'pause') { site.on = json.on; site.reason = ''; }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, message: '', paused: site.on, reason: site.reason }));
    });
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const client = new SiteClient(url, 'tok', '0.0.0');

  const fake = new FakeObs();
  fake.scenes = { Gameplay: [], 'Just Chatting': [], BRB: [] };
  fake.scene = 'Just Chatting';
  await fake.listen();
  const obs = new ObsWatcher({ site: url, report: async () => undefined, backoffMs: { min: 10, max: 40 }, debounceMs: 20, reportMs: 20, heartbeatMs: 100 }, { enabled: true, address: `ws://127.0.0.1:${fake.port}`, password: '' });
  let cfg: ScenePauseSettings = { on: false, scenes: ['Just Chatting', 'BRB'] };
  const sp = new ScenePause(async scene => { const r = await client.action({ action: 'scene-pause', scene }); if (!r.ok) throw new Error(r.message); }, 150);
  const tell = () => sp.update(cfg, obs.state.connected, obs.state.scene);
  obs.onChange = tell;
  const goto = async (scene: string) => { fake.scene = scene; fake.emit('CurrentProgramSceneChanged', { sceneName: scene }); await waitFor(`scene ${scene}`, () => obs.state.scene === scene); };

  // switched off: a chosen scene on air changes nothing, and nothing is sent
  obs.start();
  await waitFor('connected', () => obs.state.connected && obs.state.scene === 'Just Chatting');
  await pause(100);
  assert.deepEqual(site.actions, [], 'off by default: the site is never asked');
  assert.equal(site.on, false);

  // start-up with the switch on and a chosen scene on air: pauses once, with the scene as the reason, and quiet changes do not repeat it
  cfg = { ...cfg, on: true };
  tell();
  await waitFor('paused for the scene', () => site.on);
  assert.equal(site.reason, 'scene Just Chatting');
  fake.emit('InputSettingsChanged');
  await pause(350); // a few heartbeats and checks
  assert.deepEqual(site.actions, ['Just Chatting'], 'applied once, not on every OBS change');

  // another chosen scene: still paused, the reason follows; a scene that is not chosen resumes only this pause
  await goto('BRB');
  await waitFor('reason follows', () => site.reason === 'scene BRB');
  await goto('Gameplay');
  await waitFor('resumed', () => !site.on);
  assert.deepEqual(site.actions, ['Just Chatting', 'BRB', null]);

  // a pause set by hand is never lifted or taken over by a scene change
  site.on = true; site.reason = '';
  await goto('Just Chatting');
  await waitFor('asked', () => site.actions.length === 4);
  assert.deepEqual([site.on, site.reason], [true, ''], 'a chosen scene leaves a hand pause alone');
  await goto('Gameplay');
  await waitFor('asked again', () => site.actions.length === 5);
  assert.deepEqual([site.on, site.reason], [true, ''], 'leaving does not lift a hand pause');
  site.on = false;

  // a hand pause made while scene-paused takes over and stays
  await goto('BRB');
  await waitFor('scene pause again', () => site.on && site.reason === 'scene BRB');
  await client.action({ action: 'pause', on: true });
  await goto('Gameplay');
  await waitFor('asked a sixth time', () => site.actions.length === 7);
  assert.deepEqual([site.on, site.reason], [true, ''], 'the hand pause won');
  site.on = false;

  // the site cannot be reached: one try, then again within the retry time, never in a loop; a new scene is tried at once
  site.down = true;
  const before = site.actions.length;
  await goto('Just Chatting');
  fake.emit('InputSettingsChanged');
  await pause(80);
  fake.emit('InputSettingsChanged');
  await pause(60); // still inside the 150 ms retry window
  site.down = false;
  assert.equal(site.actions.length, before, 'nothing got through while the site was down');
  await waitFor('retry after the wait', () => site.on && site.reason === 'scene Just Chatting');

  // OBS reconnects: the rule is applied to the scene on air once more
  const asked = site.actions.length;
  await fake.close();
  await waitFor('OBS lost', () => !obs.state.connected);
  await fake.listen();
  await waitFor('OBS back', () => obs.state.connected && obs.state.scene === 'Just Chatting');
  await waitFor('applied again', () => site.actions.length === asked + 1);
  await pause(250);
  assert.equal(site.actions.length, asked + 1, 'once per connection');

  // switching the feature off while a scene pause is on resumes it
  cfg = { ...cfg, on: false };
  tell();
  await waitFor('resumed on switch off', () => !site.on);

  sp.stop();
  await obs.stop();
  await fake.close();
  server.close();
}
