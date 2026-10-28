// Live stats in OBS text sources (ROADMAP 57.4): the text input filter, the stat text, the mapping rules, and the writer's throttle (a source is
// written at most once a second and only when its text changed; an unmapped stat is never written). Run with the rest: npm run check.
import assert from 'node:assert/strict';
import { acceptStatMap, cleanStatFacts, cleanStatMap, noStatMap, siteStats, statText, TextWriter, textInputNames, wantedTexts } from '../src/obsstats';

const tick = () => new Promise<void>(r => setImmediate(r));

export async function statsChecks(): Promise<void> {
  // The text input filter: GDI+ and FreeType only, by the kind OBS reports.
  assert.deepEqual(textInputNames([
    { inputName: 'Chat', inputKind: 'text_gdiplus_v2' }, { inputName: 'Old', inputKind: 'text_gdiplus' }, { inputName: 'Linux', inputKind: 'text_ft2_source_v2' },
    { inputName: 'Overlay', inputKind: 'browser_source' }, { inputName: 'Cam', inputKind: 'dshow_input' }, { inputName: '', inputKind: 'text_gdiplus' }, { inputKind: 'text_gdiplus' }, { inputName: 'NoKind' },
  ]), ['Chat', 'Old', 'Linux']);

  // The text of each stat. Nothing is written for a stat the site has not answered; no data to show clears the source.
  const now = 1_000_000;
  const happy = { what: 'free packs', endsAt: now + 754_000 };
  assert.equal(statText('packs', { packs: 12 }, null, now), 'Packs: 12');
  assert.equal(statText('packs', {}, null, now), null, 'not answered yet');
  assert.equal(statText('lastBig', { lastBig: { username: 'ann', cardName: 'Bird' } }, null, now), 'ann: Bird');
  assert.equal(statText('lastBig', { lastBig: null }, null, now), '', 'no big pull yet');
  assert.equal(statText('topPuller', { topPuller: { username: 'bob', packs: 7 } }, null, now), 'Top puller: bob (7)');
  assert.equal(statText('topPuller', { topPuller: null }, null, now), '');
  assert.equal(statText('queue', { queue: 3 }, null, now), 'Queue: 3');
  assert.equal(statText('queue', { queue: 0 }, null, now), 'Queue: 0');
  assert.equal(statText('happyHour', {}, happy, now), 'Happy hour: free packs, 12:34 left');
  assert.equal(statText('happyHour', {}, happy, now + 1000), 'Happy hour: free packs, 12:33 left', 'it ticks each second');
  assert.equal(statText('happyHour', {}, happy, now + 754_000), '', 'run out = cleared');
  assert.equal(statText('happyHour', {}, null, now), '');
  assert.equal(statText('goal', { goal: 'Pack goal: 37 / 50' }, null, now), 'Pack goal: 37 / 50', 'the site sends the finished text');
  assert.equal(statText('goal', { goal: null }, null, now), '', 'no goal for this stream clears the source');
  assert.equal(statText('goal', {}, null, now), null, 'not answered yet');
  assert.deepEqual(cleanStatFacts({ goal: 'G: 1 / 5' }), { goal: 'G: 1 / 5' });
  assert.deepEqual(cleanStatFacts({ goal: null }), { goal: null });
  assert.deepEqual(cleanStatFacts({ goal: 7 }), {});

  // Only mapped stats are wanted, and nothing at all before the site has answered.
  const map = { ...noStatMap(), packs: 'Packs text', happyHour: 'Happy text' };
  assert.deepEqual(wantedTexts(map, null, happy, now), {}, 'the site has not answered: nothing to write');
  assert.deepEqual(wantedTexts(map, { packs: 4, queue: 9 }, happy, now), { 'Packs text': 'Packs: 4', 'Happy text': 'Happy hour: free packs, 12:34 left' }, 'the queue is not mapped, so it is not written');
  assert.deepEqual(wantedTexts(noStatMap(), { packs: 4 }, happy, now), {}, 'nothing mapped, nothing written (off by default)');
  assert.deepEqual(wantedTexts({ ...noStatMap(), packs: 'S' }, {}, null, now), {}, 'mapped but no value yet');
  assert.deepEqual(siteStats(map), ['packs'], 'the happy hour is counted here, so the site is not asked for it');
  assert.deepEqual(siteStats(noStatMap()), []);

  // The mapping: known stats, each source once, long names refused; a new name must be a text source OBS reported.
  assert.deepEqual(cleanStatMap(undefined), noStatMap());
  assert.deepEqual(cleanStatMap({ packs: 'A', queue: 'A', bogus: 'B', topPuller: 5, lastBig: 'x'.repeat(201), happyHour: 'H' }), { ...noStatMap(), packs: 'A', happyHour: 'H' });
  const cur = { ...noStatMap(), packs: 'A' };
  assert.deepEqual(acceptStatMap({ packs: 'A', queue: 'Q' }, ['Q'], cur), { ...noStatMap(), packs: 'A', queue: 'Q' }, 'a reported text source is accepted, a saved one stays even when OBS is not listing it');
  assert.deepEqual(acceptStatMap({ packs: 'A', queue: 'Browser' }, ['Q'], cur), { ...noStatMap(), packs: 'A' }, 'a name OBS did not report as a text source is dropped');
  assert.deepEqual(acceptStatMap({ packs: 'Z' }, [], cur), noStatMap(), 'a new name with OBS not connected is dropped');

  // The site's answer is checked.
  assert.deepEqual(cleanStatFacts({ packs: 3.7, queue: -1, lastBig: { username: 'a', cardName: 'b' }, topPuller: { username: 'c', packs: 'x' }, extra: 1 }), { packs: 3, lastBig: { username: 'a', cardName: 'b' } });
  assert.deepEqual(cleanStatFacts({ lastBig: null, topPuller: null }), { lastBig: null, topPuller: null });
  assert.deepEqual(cleanStatFacts('nope'), {});

  // The writer: first write at once, an unchanged text is not sent again, a change waits for the second, a failure is retried but not in a loop.
  {
    const sent: string[] = [];
    let fail = false;
    const w = new TextWriter(async (s, t) => { if (fail) throw new Error('no'); sent.push(`${s}=${t}`); });
    w.push({ A: 'one' }, 0); await tick();
    assert.deepEqual(sent, ['A=one'], 'the first text is written');
    w.push({ A: 'one' }, 600); await tick();
    assert.deepEqual(sent, ['A=one'], 'an unchanged text is never written again');
    w.push({ A: 'two' }, 700); await tick();
    w.push({ A: 'two' }, 999); await tick();
    assert.deepEqual(sent, ['A=one'], 'a change inside the second waits');
    w.push({ A: 'two' }, 1000); await tick();
    assert.deepEqual(sent, ['A=one', 'A=two'], 'a change goes out once the second is up');
    w.push({ A: 'two', B: 'x' }, 1100); await tick();
    assert.deepEqual(sent.slice(2), ['B=x'], 'each source has its own second');
    w.push({ A: 'three' }, 1500); w.push({ A: 'four' }, 1900); w.push({ A: 'five' }, 2000); await tick();
    assert.deepEqual(sent.slice(3), ['A=five'], 'a burst of changes writes the newest text once the second is up, not each one');
    fail = true;
    w.push({ A: 'six' }, 3000); await tick();
    w.push({ A: 'six' }, 3500); await tick();
    fail = false;
    w.push({ A: 'six' }, 3999); await tick();
    assert.equal(sent.length, 4, 'a failed write is not retried inside the second');
    w.push({ A: 'six' }, 4000); await tick();
    assert.equal(sent.at(-1), 'A=six', 'and is retried after it');
    assert.equal(sent.length, 5);
    w.reset();
    w.push({ A: 'six' }, 9000); await tick();
    assert.equal(sent.length, 6, 'after a reset (OBS came back) the same text is written again');
    w.push({}, 20_000); await tick();
    assert.equal(sent.length, 6, 'an unmapped stat is no longer in the list, so nothing is written for it');
  }

  // A slow write does not pile up: one at a time per source.
  {
    let calls = 0;
    let release: () => void = () => undefined;
    const w = new TextWriter(() => { calls++; return new Promise<void>(r => { release = r; }); });
    w.push({ A: 'x' }, 0); w.push({ A: 'y' }, 5000); w.push({ A: 'z' }, 9000);
    assert.equal(calls, 1, 'no second write while the first has not answered');
    release(); await tick();
    w.push({ A: 'z' }, 9500); await tick();
    assert.equal(calls, 2, 'then the newest text goes');
  }
}
