// The pre-stream checklist (ROADMAP 57.1): the line texts, the overall state, the time limit and the site client, with fakes for each part.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { overall, runChecklist, siteLines, type ChecklistParts, type SiteFacts } from '../src/checklist';
import type { MixItUpClient } from '../src/mixitup';
import type { ObsState } from '../src/obs';
import { SUBSCRIPTIONS, type EsStatus } from '../src/eventsub';
import { SiteClient, Unauthorized } from '../src/site';

const CUR = '11111111-2222-3333-4444-555555555555';
const NOW = 1_000_000;
const mixOk = { version: async () => '1.10', currencies: async () => [{ id: CUR, name: 'Brie Bucks' }], twitchUser: async () => ({ id: 'u', twitchId: '1', username: 'josh', amounts: [{ id: CUR, name: 'Brie Bucks', amount: 7 }] }) } as unknown as MixItUpClient;
const mixDown = { version: async () => null } as unknown as MixItUpClient;
const facts: SiteFacts = { season: { name: 'Season 1' }, openablePacks: 3, queueLength: 0, paused: false, happyHour: null };
const obsGood: ObsState = { enabled: true, connected: true, error: '', scene: 'Live', streaming: false, overlay: { found: true, inProgram: true, visible: true, sourceName: 'TCG overlay' } };
const parts = (over: Partial<ChecklistParts> = {}): ChecklistParts => ({ mix: mixOk, channel: 'josh', currencyId: CUR, facts: async () => facts, obsEnabled: true, obsCheck: async () => obsGood, now: () => NOW, timeoutMs: 80, ...over });
const line = (r: Awaited<ReturnType<typeof runChecklist>>, label: string) => r.lines.find(l => l.label === label)!;

export async function checklistChecks(): Promise<void> {
  // all good: every line green except the happy hour (grey), ready
  let r = await runChecklist(parts());
  assert.equal(r.ready, true);
  assert.equal(r.summary, 'Ready to stream.');
  assert.deepEqual(r.lines.map(l => l.label), ['Site', 'Mix It Up', 'OBS', 'Overlay', 'Season', 'Packs', 'Pull queue', 'Pulls', 'Happy hour']);
  assert.ok(r.lines.every(l => l.tone === (l.label === 'Happy hour' ? 'muted' : 'ok')), 'green, and the happy hour grey');
  assert.match(line(r, 'Mix It Up').text, /Mix It Up 1\.10 answers\..*josh has 7 Brie Bucks/);

  // The Twitch line (58.5): left out without a status; grey with no channel; red with the reason; red when a subscription is missing; green when all are enabled.
  const es = (over: Partial<EsStatus> = {}): EsStatus => ({ state: 'connected', why: '', reason: '', login: 'josh', testing: false, subs: SUBSCRIPTIONS.map(s => ({ type: s.type, status: 'enabled' as const })), lastEventAt: null, since: null, ...over });
  r = await runChecklist(parts({ twitch: es() }));
  assert.deepEqual(r.lines.map(l => l.label), ['Site', 'Mix It Up', 'OBS', 'Overlay', 'Twitch', 'Season', 'Packs', 'Pull queue', 'Pulls', 'Happy hour']);
  assert.ok(r.ready && line(r, 'Twitch').tone === 'ok' && /Listening to josh, all 6 subscriptions enabled/.test(line(r, 'Twitch').text));
  r = await runChecklist(parts({ twitch: es({ state: 'off', why: 'none', reason: 'No Twitch channel is connected.', subs: [] }) }));
  assert.ok(r.ready && line(r, 'Twitch').tone === 'muted', 'no channel connected is grey and does not block');
  r = await runChecklist(parts({ twitch: es({ state: 'reconnecting', why: 'twitch', reason: 'Twitch is not reachable.', subs: [] }) }));
  assert.ok(!r.ready && line(r, 'Twitch').tone === 'bad' && line(r, 'Twitch').text === 'Twitch is not reachable.', 'red with the reason');
  r = await runChecklist(parts({ twitch: es({ subs: es().subs.slice(0, 4) }) }));
  assert.ok(!r.ready && /not enabled: stream\.online, stream\.offline/.test(line(r, 'Twitch').text) && /2 subscriptions are/.test(line(r, 'Twitch').text), 'a missing subscription is red');

  // Mix It Up closed, the currency missing, no channel yet
  r = await runChecklist(parts({ mix: mixDown }));
  assert.ok(!r.ready && line(r, 'Mix It Up').tone === 'bad' && /does not answer/.test(line(r, 'Mix It Up').text));
  assert.match(r.summary, /^1 thing needs fixing/);
  r = await runChecklist(parts({ currencyId: '' }));
  assert.match(line(r, 'Mix It Up').text, /has not chosen a currency/);
  r = await runChecklist(parts({ channel: '' }));
  assert.ok(line(r, 'Mix It Up').tone === 'bad' && /channel name/.test(line(r, 'Mix It Up').text));

  // OBS off is grey, not red; on but unreachable is red; overlay hidden is red
  r = await runChecklist(parts({ obsEnabled: false, obsCheck: async () => { throw new Error('should not be called'); } }));
  assert.ok(r.ready && line(r, 'OBS').tone === 'muted' && /Not used/.test(line(r, 'OBS').text) && line(r, 'Overlay').tone === 'muted');
  r = await runChecklist(parts({ obsCheck: async () => { throw new Error('OBS does not answer'); } }));
  assert.ok(!r.ready && line(r, 'OBS').text === 'OBS does not answer' && line(r, 'Overlay').tone === 'bad');
  r = await runChecklist(parts({ obsCheck: async () => ({ ...obsGood, overlay: { ...obsGood.overlay, visible: false } }) }));
  assert.ok(line(r, 'OBS').tone === 'ok' && line(r, 'Overlay').tone === 'bad' && /hidden/.test(line(r, 'Overlay').text));
  r = await runChecklist(parts({ obsCheck: async () => ({ ...obsGood, overlay: { found: false, inProgram: false, visible: false, sourceName: '' } }) }));
  assert.match(line(r, 'Overlay').text, /not in OBS/);

  // the site's four facts
  const f = (over: Partial<SiteFacts>) => siteLines({ ...facts, ...over }, NOW);
  assert.equal(f({ season: null })[0].tone, 'bad');
  assert.equal(f({ openablePacks: 0 })[1].tone, 'bad');
  assert.ok(f({ queueLength: 2 })[2].tone === 'bad' && /2 pulls are still waiting/.test(f({ queueLength: 2 })[2].text));
  assert.match(f({ queueLength: 1 })[2].text, /1 pull is still waiting/);
  assert.ok(f({ paused: true })[3].tone === 'bad' && /paused/.test(f({ paused: true })[3].text));
  const hh = f({ happyHour: { what: 'free packs', endsAt: NOW + 12 * 60_000 } })[4];
  assert.ok(hh.tone === 'muted' && hh.text === 'Running: free packs, 12 minutes left.', 'a running happy hour is shown, never red');
  assert.equal(overall(f({ happyHour: { what: 'free packs', endsAt: NOW + 60_000 } })).ready, true);
  // the Mix It Up command check (57.8): no line until the site has the commands, grey (never red) when some are missing
  assert.equal(f({}).length, 5, 'no commands line before the site says');
  const cm = f({ commandsMissing: ['!pack', 'Bits'] }).find(l => l.label === 'Commands')!;
  assert.ok(cm.tone === 'muted' && cm.text === '2 Mix It Up commands missing or switched off: !pack, Bits.', cm.text);
  assert.equal(f({ commandsMissing: [] }).find(l => l.label === 'Commands')!.tone, 'ok');
  assert.equal(overall(f({ commandsMissing: ['!pack'] })).ready, true);

  // the site does not answer: red, and the lines that need it say so (the other parts still answer)
  r = await runChecklist(parts({ facts: async () => { throw new Error('The site answered 500'); } }));
  assert.ok(!r.ready && line(r, 'Site').text === 'The site answered 500' && line(r, 'Season').tone === 'bad' && line(r, 'Happy hour').tone === 'muted');
  assert.equal(line(r, 'Mix It Up').tone, 'ok');

  // one slow part never hangs the list, and the rest still answer
  const started = Date.now();
  r = await runChecklist(parts({ obsCheck: () => new Promise<ObsState>(() => undefined), facts: () => new Promise<SiteFacts>(() => undefined) }));
  assert.ok(Date.now() - started < 2000, 'finished at the time limit');
  assert.match(line(r, 'OBS').text, /Did not answer within 0 seconds|Did not answer within \d+ seconds/);
  assert.equal(line(r, 'Site').tone, 'bad');
  assert.equal(line(r, 'Mix It Up').tone, 'ok');

  // the site client: the answer is cleaned, a 401 means pair again
  let status = 200;
  let auth = '';
  const server = createServer((req, res) => {
    auth = String(req.headers.authorization);
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ season: { name: 'S1' }, openablePacks: 2, queueLength: 'x', paused: true, happyHour: { what: 'free packs', endsAt: 5 } }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const got = await new SiteClient(base, 'tok', '0.13.0').checklistFacts();
    assert.deepEqual(got, { season: { name: 'S1' }, openablePacks: 2, queueLength: 0, paused: true, happyHour: { what: 'free packs', endsAt: 5 } });
    assert.equal(auth, 'Bearer tok');
    status = 401;
    await assert.rejects(new SiteClient(base, 'tok', '0.13.0').checklistFacts(), Unauthorized);
    status = 500;
    await assert.rejects(new SiteClient(base, 'tok', '0.13.0').checklistFacts(), /answered 500/);
  } finally {
    server.close();
  }
}
