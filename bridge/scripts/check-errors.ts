// Error reports to the site (ROADMAP 57.9): the text is redacted like the log, one report per part per minute, a report is dropped while the site is
// unreachable (not sent later), and the reporter never throws, whatever the sender or the redaction does. Run with the rest: npm run check.
import assert from 'node:assert/strict';
import { ErrorReporter } from '../src/errors';
import { redact } from '../src/log';
import { errorPartOf } from '../src/service';

export function errorsChecks(): void {
  let t = 1_000_000;
  let up = true;
  const sent: Record<string, unknown>[] = [];
  const make = (over: Partial<ConstructorParameters<typeof ErrorReporter>[0]> = {}) =>
    new ErrorReporter({ send: async b => { sent.push(b); }, redact: text => redact(text, ['hunter2pw']), version: '0.21.0', commit: 'abc1234', canSend: () => up, now: () => t, ...over });
  const r = make();

  // The message is redacted (a known secret, a key= value, an overlay address) and cut to 300 characters on one line.
  r.report('job', 'deduct failed with hunter2pw at https://cheesytcg.app/overlay.html?key=abc and token=xyz\nsecond line');
  assert.equal(sent.length, 1);
  const first = sent[0];
  assert.equal(first.type, 'error');
  assert.equal(first.part, 'job');
  assert.equal(first.version, '0.21.0');
  assert.equal(first.commit, 'abc1234');
  assert.ok(!/hunter2pw|abc&|xyz|overlay\.html|\n/.test(String(first.message)), `redacted: ${first.message}`);
  assert.match(String(first.message), /\[hidden\].*\[overlay address\].*token=\[hidden\] second line/);
  t += 120_000;
  r.report('job', 'x'.repeat(1000));
  assert.equal(String(sent[1].message).length, 300);

  // At most one per part per minute; another part is not held back by it.
  r.report('job', 'again');
  assert.equal(sent.length, 2, 'the same part within a minute is dropped');
  r.report('obs', 'obs down');
  assert.equal(sent.length, 3, 'another part still reports');
  t += 59_999;
  r.report('obs', 'obs again');
  assert.equal(sent.length, 3, 'still inside the minute');
  t += 1;
  r.report('obs', 'obs after the minute');
  assert.equal(sent.length, 4, 'a minute later it reports again');

  // While the site is unreachable the report is dropped, never queued: nothing is sent when it comes back, and the part's minute did not start.
  up = false;
  r.report('mixitup', 'mix down');
  up = true;
  assert.equal(sent.length, 4, 'dropped while the site is down');
  r.report('mixitup', 'mix down again');
  assert.equal(sent.length, 5, 'the dropped report did not use up the minute, and nothing queued');
  assert.equal(sent[4].message, 'mix down again');

  // Never throws: a sender that throws or rejects, a redaction that throws, a check that throws, and no loop on its own failure.
  let calls = 0;
  const bad = make({ send: () => { calls++; throw new Error('boom'); } });
  assert.doesNotThrow(() => bad.report('reconnect', 'a'));
  const rejecting = make({ send: () => { calls++; return Promise.reject(new Error('nope')); } });
  assert.doesNotThrow(() => rejecting.report('reconnect', 'a'));
  assert.doesNotThrow(() => make({ redact: () => { throw new Error('x'); } }).report('job', 'a'));
  assert.doesNotThrow(() => make({ canSend: () => { throw new Error('x'); } }).report('job', 'a'));
  assert.equal(calls, 2, 'a failed send is not retried or reported again');
  assert.doesNotThrow(() => make().report('job', undefined as unknown as string));

  // Which part a failed job blames; faults only.
  assert.equal(errorPartOf('Mix It Up is not running'), 'mixitup');
  assert.equal(errorPartOf('Mix It Up answered 500'), 'mixitup');
  assert.equal(errorPartOf('OBS did not accept the refresh'), 'obs');
  assert.equal(errorPartOf('TCG Bridge is not connected to OBS'), 'obs');
  assert.equal(errorPartOf('TCG Bridge hit an unexpected error'), 'job');
  assert.equal(errorPartOf('Not enough Brie Bucks'), null, 'a viewer without currency is not a fault');
  assert.equal(errorPartOf('Mix It Up does not know that viewer'), null);
  assert.equal(errorPartOf('OBS is switched off in TCG Bridge'), null);
}
