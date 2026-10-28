// The event feed (ROADMAP 57.7): the site's lines cleaned into text for the windows, merged newest first without repeats, kept to 30. Run with the rest: npm run check.
import assert from 'node:assert/strict';
import { cleanEvent, cleanEvents, clock, eventsAfter, mergeEvents, resultText } from '../src/events';

export function eventsChecks(): void {
  const at = new Date(2026, 9, 28, 14, 5, 9).getTime();
  assert.equal(clock(at), '14:05:09', 'local clock time, padded');

  // An earned reward, an ignored one, and what each says.
  assert.deepEqual(cleanEvent({ at, username: 'Ann', event: 'bits', amount: 1500, ok: true, detail: 'ann got 3 packs for 1,500 bits!' }),
    { at, time: '14:05:09', event: 'Bits', viewer: 'Ann', amount: '1,500', ok: true, result: 'ann got 3 packs for 1,500 bits!' });
  assert.deepEqual(cleanEvent({ at, username: 'bob', event: 'raid', amount: 12, ok: false, detail: 'event_off' }),
    { at, time: '14:05:09', event: 'Raid', viewer: 'bob', amount: '12', ok: false, result: 'Ignored: event off' });
  assert.equal(resultText(true, 'ok'), 'Nothing earned', 'ok with nothing said earned nothing');
  assert.equal(resultText(false, ''), 'Ignored: no reason given');
  assert.equal(cleanEvent({ at, username: 'cat', event: 'redeem', ok: true, detail: 'ok' })!.amount, '-', 'no amount shows a hyphen');
  assert.equal(cleanEvent({ at, username: 'cat', event: 'gifted-subs', amount: 5, ok: true, detail: '' })!.event, 'Gifted subs');
  assert.equal(cleanEvent({ at, username: 'cat', event: 'something-new', ok: true, detail: '' })!.event, 'something-new', 'an unknown event is shown as sent');

  // Twitch events (58.5): a redemption with its award result, one refused while awards are paused, and the stream going online or offline (no viewer).
  assert.deepEqual(cleanEvent({ at, username: 'cat', event: 'redeem', ok: true, detail: 'Twitch channel points: redeemed Open a pack' }),
    { at, time: '14:05:09', event: 'Channel point redeem', viewer: 'cat', amount: '-', ok: true, result: 'Twitch channel points: redeemed Open a pack' });
  assert.equal(cleanEvent({ at, username: 'cat', event: 'redeem', ok: false, detail: 'Twitch channel points: Open a pack failed for Open a pack: awards paused' })!.result,
    'Ignored: Twitch channel points: Open a pack failed for Open a pack: awards paused', 'a paused award says why');
  assert.deepEqual(cleanEvent({ at, username: '', event: 'stream-online', ok: true, detail: 'The stream went online' }),
    { at, time: '14:05:09', event: 'Stream online', viewer: '-', amount: '-', ok: true, result: 'The stream went online' });
  assert.equal(cleanEvent({ at, username: '', event: 'stream-offline', ok: true, detail: 'The stream went offline' })!.event, 'Stream offline');

  // Junk is dropped or made safe: nothing here can become markup (the windows use textContent), control characters and long text are cut.
  assert.equal(cleanEvent(null), null);
  assert.equal(cleanEvent({ username: 'x', event: 'bits' }), null, 'no time');
  assert.equal(cleanEvent({ at: 'now', username: 'x', event: 'bits' }), null);
  assert.equal(cleanEvent({ at, username: 'x' }), null, 'no event');
  const messy = cleanEvent({ at, username: 'a\nb'.padEnd(80, 'z'), event: 'bits', amount: -4, ok: 'yes', detail: 'x'.repeat(500) })!;
  assert.ok(messy.viewer.length <= 40 && !messy.viewer.includes('\n') && messy.amount === '-' && messy.ok === false && messy.result.length <= 'Ignored: '.length + 200);
  assert.deepEqual(cleanEvents('nope'), []);
  assert.equal(cleanEvents([{ at, username: 'a', event: 'bits' }, 5, null]).length, 1, 'bad lines are skipped');
  assert.equal(cleanEvents(Array.from({ length: 80 }, (_, i) => ({ at: at + i, username: 'a', event: 'bits' }))).length, 30, 'at most 30 are taken');

  // Merging: new lines in front, no line twice, 30 at most; and where to ask from next.
  const line = (n: number) => cleanEvent({ at: at + n, username: `v${n}`, event: 'redeem', ok: true, detail: 'ok' })!;
  const held = Array.from({ length: 30 }, (_, i) => line(30 - i)); // v30 (newest) .. v1
  assert.equal(eventsAfter([]), 0, 'nothing held: ask for everything');
  assert.equal(eventsAfter(held), at + 30, 'ask from the newest held');
  const merged = mergeEvents(held, [line(32), line(31), line(30)]); // the site repeats v30
  assert.equal(merged.length, 30, 'kept to 30');
  assert.deepEqual(merged.slice(0, 3).map(e => e.viewer), ['v32', 'v31', 'v30'], 'newest first, the repeat once');
  assert.equal(merged[29].viewer, 'v3', 'the oldest are dropped');
  assert.deepEqual(mergeEvents([line(1)], []).map(e => e.viewer), ['v1'], 'nothing new changes nothing');
}
