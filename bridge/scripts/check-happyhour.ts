// Happy hour from the app (ROADMAP 57.3): the countdown text, the tray's preset list, and the app reading the site's answer (the site's own
// rules are checked in scripts/check-bridge-actions.mts). Run with the rest: npm run check.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { clock, HAPPY_PRESETS, happyText } from '../src/happyhour';
import { SiteClient } from '../src/site';

export async function happyHourChecks(): Promise<void> {
  assert.equal(clock(754_000), '12:34');
  assert.equal(clock(754_001), '12:35', 'rounded up to the second');
  assert.equal(clock(59_000), '0:59');
  assert.equal(clock(-5000), '0:00', 'never negative');
  assert.equal(clock(240 * 60_000), '240:00', 'the longest happy hour');

  const now = 1_000_000;
  assert.equal(happyText({ what: 'free packs', endsAt: now + 754_000 }, now), 'Happy hour: free packs, 12:34 left');
  assert.equal(happyText({ what: '25% off packs', endsAt: now + 60_000 }, now), 'Happy hour: 25% off packs, 1:00 left');
  assert.equal(happyText({ what: 'free packs', endsAt: now }, now), '', 'run out by this clock = nothing to show');
  assert.equal(happyText(null, now), '', 'none running = nothing to show');

  assert.deepEqual(HAPPY_PRESETS.map(p => p.label), ['15 minutes, free packs', '30 minutes, 50% off', '60 minutes, 25% off']);
  assert.deepEqual(HAPPY_PRESETS.map(p => p.body), [
    { action: 'happy-hour-start', minutes: 15, kind: 'free' },
    { action: 'happy-hour-start', minutes: 30, kind: 'discount', percent: 50 },
    { action: 'happy-hour-start', minutes: 60, kind: 'discount', percent: 25 },
  ]);

  // The app reads the happy hour out of the site's answer: an object, null (none), and nothing from an older site.
  let reply: Record<string, unknown> = {};
  const seen: Record<string, unknown>[] = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => { seen.push(JSON.parse(body)); res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(reply)); });
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  try {
    const port = (server.address() as { port: number }).port;
    const site = new SiteClient(`http://127.0.0.1:${port}`, 'tok', '0.0.0');
    reply = { ok: true, message: 'Happy hour: free packs for 15 minutes.', happyHour: { what: 'free packs', endsAt: 5000 } };
    const started = await site.action(HAPPY_PRESETS[0].body);
    assert.deepEqual(seen.at(-1), HAPPY_PRESETS[0].body, 'the preset goes to the site as is');
    assert.deepEqual(started.happyHour, { what: 'free packs', endsAt: 5000 });
    reply = { ok: true, message: 'Happy hour is over.', happyHour: null };
    assert.equal((await site.action({ action: 'happy-hour-end' })).happyHour, null, 'end: none running');
    reply = { ok: true, message: '', paused: false };
    assert.equal('happyHour' in (await site.action({ action: 'status' })), false, 'an older site says nothing: keep what we knew');
    reply = { ok: true, message: '', happyHour: { what: 7, endsAt: 'soon' } };
    assert.equal('happyHour' in (await site.action({ action: 'status' })), false, 'a garbled answer is ignored');
  } finally {
    await new Promise<void>(r => server.close(() => r()));
  }
}
