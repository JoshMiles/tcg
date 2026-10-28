// Sign in with Twitch from the app (ROADMAP 58.0b): the poll state machine, the page address, the account words, and the two link routes
// against a fake site. Run with the rest: npm run check.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { accountLabel, cleanRole, linkPage, OFFLINE_NOTE, refreshAccount, runSignIn, staffShown, type LinkPollAnswer, type SignInView } from '../src/signin';
import { pollLink, startLink } from '../src/site';
import { staffActionsFor } from '../src/staffpages';

const ID = 'A'.repeat(22);
const link = { id: ID, code: 'ABC123', secret: 'the-secret', url: `https://x.test/bridge/link?id=${ID}`, expiresAt: 0 };

/** Runs the machine with a fake clock: each sleep moves time on by the asked time, so a ten minute wait takes no real time. */
function run(answers: (LinkPollAnswer | Error)[], o: { limitMs?: number; abortAfterPolls?: number; startFails?: boolean } = {}) {
  const shown: SignInView[] = [];
  const polled: { id: string; secret: string }[] = [];
  const ctl = new AbortController();
  let t = 0;
  const done = runSignIn({
    start: async () => { if (o.startFails) throw new Error('Too many tries'); return link; },
    poll: async (id, secret) => {
      polled.push({ id, secret });
      if (o.abortAfterPolls && polled.length >= o.abortAfterPolls) ctl.abort();
      const a = answers[Math.min(polled.length - 1, answers.length - 1)];
      if (a instanceof Error) throw a;
      return a;
    },
    show: v => shown.push(v),
    sleep: async ms => { t += ms; },
    now: () => t,
    signal: ctl.signal,
    limitMs: o.limitMs,
  });
  return done.then(r => ({ r, shown, polled, at: () => t }));
}

export async function signInChecks(): Promise<void> {
  // Pending twice, then allowed: the code is shown, polling is every 2 s, the token comes back once.
  const ok = await run([{ status: 'pending' }, { status: 'pending' }, { status: 'allowed', token: 'tok', login: 'cheesygidds', role: 'admin' }]);
  assert.equal(ok.r.token, 'tok');
  assert.deepEqual(ok.r.view, { phase: 'allowed', login: 'cheesygidds', role: 'admin' });
  assert.equal(ok.polled.length, 3);
  assert.equal(ok.at(), 6000, 'polled every 2 seconds');
  assert.deepEqual(ok.shown[0], { phase: 'starting' });
  assert.deepEqual(ok.shown[1], { phase: 'waiting', code: 'ABC123', note: '' });
  assert.ok(!JSON.stringify(ok.shown).includes('the-secret') && !JSON.stringify(ok.shown).includes('tok"'), 'the view never holds the secret or the token');
  assert.ok(ok.polled.every(p => p.secret === 'the-secret' && p.id === ID));

  // Denied and expired end it with no token.
  const denied = await run([{ status: 'denied', message: 'Not allowed' }]);
  assert.deepEqual(denied.r, { view: { phase: 'denied', message: 'Not allowed' } });
  assert.deepEqual((await run([{ status: 'expired' }])).r, { view: { phase: 'expired' } });

  // No answer for ten minutes is "expired" (the site's request is gone by then).
  const slow = await run([{ status: 'pending' }]);
  assert.deepEqual(slow.r.view, { phase: 'expired' });
  assert.ok(slow.at() >= 10 * 60_000 && slow.polled.length <= 301, 'gives up at 10 minutes');

  // A network error keeps polling and only changes the note.
  const flaky = await run([new Error('offline'), new Error('offline'), { status: 'allowed', token: 'tok', login: 'a', role: '' }]);
  assert.equal(flaky.r.token, 'tok');
  assert.ok(flaky.shown.some(v => v.phase === 'waiting' && v.note === OFFLINE_NOTE), 'a quiet note while offline');

  // Cancel (or closing the window) stops the polling at once and keeps no token.
  const cancelled = await run([{ status: 'pending' }], { abortAfterPolls: 2 });
  assert.deepEqual(cancelled.r, { view: { phase: 'cancelled' } });
  assert.equal(cancelled.polled.length, 2);

  // The site refusing the start (rate limit) is an error with its words.
  assert.deepEqual((await run([], { startFails: true })).r.view, { phase: 'error', message: 'Too many tries' });

  // The page to open is built from the configured site and a well-formed id, never from the site's `url`.
  assert.equal(linkPage('https://tcg.example', ID), `https://tcg.example/bridge/link?id=${ID}`);
  assert.equal(linkPage('https://tcg.example', 'short'), null);
  assert.equal(linkPage('https://tcg.example', `${ID}/../x`), null);
  assert.equal(linkPage('https://tcg.example', 'A'.repeat(21) + '?'), null);

  // The account in words, the role cleaning, and what the window shows.
  assert.equal(accountLabel({ login: 'cheesygidds', role: 'super', pairedAs: 'PC' }), 'Signed in with Twitch as cheesygidds (Super admin)');
  assert.equal(accountLabel({ login: 'modguy', role: 'mod', pairedAs: 'PC' }), 'Signed in with Twitch as modguy (Mod)');
  assert.equal(accountLabel({ login: 'x', role: '', pairedAs: 'PC' }), 'Signed in with Twitch as x (no staff role)');
  assert.equal(accountLabel({ login: '', role: '', pairedAs: 'STREAM-PC' }), 'Paired as STREAM-PC');
  assert.equal(cleanRole('owner'), '');
  assert.equal(staffShown({ login: '', role: '' }), null, 'a PC paired with a code shows everything (the admin switch decides)');
  assert.deepEqual(staffShown({ login: 'm', role: 'mod' }), staffActionsFor('mod'));
  assert.ok(!staffShown({ login: 'm', role: 'mod' })!.includes('gift') && staffShown({ login: 'm', role: 'mod' })!.includes('trading'), 'a mod does not see admin things');
  assert.ok(staffShown({ login: 'a', role: 'admin' })!.includes('gift'));
  assert.deepEqual(staffShown({ login: 'a', role: '' }), [], 'a lost role shows nothing');

  // The status answer refreshes a linked PC and never touches a paired one.
  assert.deepEqual(refreshAccount({ login: 'a', role: 'mod' }, { login: 'a', role: 'admin' }), { login: 'a', role: 'admin', changed: true });
  assert.deepEqual(refreshAccount({ login: 'a', role: 'mod' }, { login: 'a', role: 'mod' }), { login: 'a', role: 'mod', changed: false });
  assert.deepEqual(refreshAccount({ login: '', role: '' }, { login: 'a', role: 'admin' }), { login: '', role: '', changed: false });
  assert.equal(refreshAccount({ login: 'a', role: 'mod' }, undefined).changed, false);

  // The two routes against a fake site: the request carries the PC name, the poll carries the id and secret, and no token is ever sent.
  const seen: { url: string; body: Record<string, unknown>; auth: string | undefined }[] = [];
  let polls = 0;
  const srv = createServer((req, res) => {
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : {};
      seen.push({ url: req.url ?? '', body, auth: req.headers.authorization });
      const out = (status: number, j: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(j)); };
      if (req.url === '/api/bridge/link') return out(200, { id: ID, code: 'ABC123', secret: 'srv-secret', url: `http://localhost/bridge/link?id=${ID}`, expiresAt: Date.now() + 600_000 });
      if (req.url === '/api/bridge/link/poll') {
        if (body.secret !== 'srv-secret') return out(200, { status: 'expired' }); // a wrong secret looks like an expired request
        polls++;
        return out(200, polls < 2 ? { status: 'pending' } : polls === 2 ? { status: 'allowed', token: 'tok-1', login: 'cheesygidds', role: 'mod' } : { status: 'expired' });
      }
      out(404, {});
    });
  });
  await new Promise<void>(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  try {
    const l = await startLink(base, 'STREAM-PC');
    assert.deepEqual([l.id, l.code, l.secret], [ID, 'ABC123', 'srv-secret']);
    assert.deepEqual(seen[0].body, { name: 'STREAM-PC' });
    assert.equal(seen[0].auth, undefined, 'no token on the start');
    assert.deepEqual(await pollLink(base, l.id, l.secret), { status: 'pending' });
    assert.deepEqual(await pollLink(base, l.id, l.secret), { status: 'allowed', token: 'tok-1', login: 'cheesygidds', role: 'mod' });
    assert.deepEqual(await pollLink(base, l.id, l.secret), { status: 'expired' }, 'allowed comes once');
    assert.deepEqual(await pollLink(base, l.id, 'wrong'), { status: 'expired' });
    assert.ok(seen.every(s => s.auth === undefined && !s.url.includes('secret') && !s.url.includes('tok')), 'the secret travels in the body only');
  } finally {
    srv.close();
  }
}
