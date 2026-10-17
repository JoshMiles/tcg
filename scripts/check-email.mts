// Checks email notifications (ROADMAP 22.1): address rules, double opt-in, kind gating, the 15 minute batching window, unsubscribe and
// confirmation tokens, bounce / complaint switch-off, the webhook signature, sandbox silence and the export, against the mock KV and the
// fake Resend in scripts/mock-resend.cjs. Delivery to a real inbox is not checkable here.
// Run: node scripts/run-checks.mjs email
import { createRequire } from 'node:module';
import { createHmac } from 'node:crypto';

const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const eq = (a: unknown, b: unknown, msg: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);

const require = createRequire(import.meta.url);
const mock = await require('./mock-resend.cjs').start(0) as { port: number; sent: { auth: string; body: Record<string, unknown> }[]; stop: () => void };
const sentTo = (a: string) => mock.sent.filter(m => (m.body.to as string[]).includes(a));

const core = await import('../lib/email-core');
// ── pure rules ──
eq(core.normalizeAddress('  Ann@Example.COM '), 'ann@example.com', 'addresses are trimmed and lower-cased');
ok(!core.normalizeAddress('nope') && !core.normalizeAddress('a@b') && !core.normalizeAddress('a b@c.com') && !core.normalizeAddress('a@b..com') && !core.normalizeAddress(5) && !core.normalizeAddress('<x>@y.com'), 'junk addresses are refused');
eq(core.maskAddress('ann@example.com'), 'a***@example.com', 'masking');
eq(core.sanitizeEmailKinds(undefined), ['offers', 'results'], 'default kinds are offers and results only');
eq(core.sanitizeEmailKinds(['watch', 'bogus', 'offers']), ['offers', 'watch'], 'known kinds only');
const rec = (o: object = {}) => ({ address: 'a@example.com', addedAt: 1, kinds: ['offers', 'results'] as core.EmailKind[], ...o });
ok(!core.emailWants(rec(), 'offer'), 'unconfirmed email wants nothing');
ok(core.emailWants(rec({ verifiedAt: 5 }), 'offer') && core.emailWants(rec({ verifiedAt: 5 }), 'accepted') && !core.emailWants(rec({ verifiedAt: 5 }), 'watch') && !core.emailWants(rec({ verifiedAt: 5 }), 'admin'), 'kind gating');
ok(!core.emailWants(rec({ verifiedAt: 5, off: 'bounced' }), 'offer'), 'a switched-off address wants nothing');
const links = { base: 'https://x.test', unsubscribe: 'https://x.test/u?t=1', manage: 'https://x.test/settings#email' };
const n = (kind: 'offer' | 'accepted' | 'watch', text: string, i = 0) => ({ id: `n${i}`, at: 1000 + i, kind, text });
eq(core.buildEmail([n('offer', 'a')], links, 'App').subject, 'New trade offer', 'one notice: its title');
eq(core.buildEmail([n('offer', 'a'), n('offer', 'b', 1), n('offer', 'c', 2)], links, 'App').subject, '3 new trade offers', 'batched same kind');
eq(core.buildEmail([n('offer', 'a'), n('accepted', 'b', 1)], links, 'App').subject, '2 new notices on App', 'mixed kinds');
const many = core.buildEmail(Array.from({ length: 25 }, (_, i) => n('offer', `o${i}`, i)), links, 'App');
ok(many.text.includes('And 5 more') && many.text.includes(links.unsubscribe) && many.html.includes(links.unsubscribe), 'long batches are cut and always carry the unsubscribe link');
ok(core.buildEmail([n('offer', '<script>x</script>')], links, 'App').html.includes('&lt;script&gt;'), 'notice text is escaped in the html');
ok(!/[—]/.test(many.text + many.html), 'no em dashes');

// ── not set up: nothing happens ──
delete process.env.RESEND_API_KEY; delete process.env.SESSION_SECRET;
process.env.RESEND_API_URL = `http://127.0.0.1:${mock.port}`;
process.env.EMAIL_COALESCE_MS = '0';
const email = await import('../lib/email');
ok(!email.emailConfigured(), 'without a key email is off');
ok(!(await email.startEmail('ann', 'ann@example.com')).ok, 'no opt-in without a key');
const { notify } = await import('../lib/trade-notify');
await notify('ann', { kind: 'offer', text: 'x' });
eq(mock.sent.length, 0, 'nothing sent without a key');

// ── set up ──
process.env.RESEND_API_KEY = 're_test_key'; process.env.SESSION_SECRET = 'a-long-enough-test-secret';
ok(email.emailConfigured(), 'a key and a session secret switch email on');
ok(!(await email.startEmail('ann', 'not an address')).ok, 'a bad address is refused');
eq(mock.sent.length, 0, 'and nothing is sent');

// ── double opt-in ──
const started = await email.startEmail('ann', 'Ann@Example.com');
ok(started.ok, 'opt-in starts');
eq(sentTo('ann@example.com').length, 1, 'one confirmation email');
ok(mock.sent[0].auth === 'Bearer re_test_key', 'sent with the API key');
ok(!(mock.sent[0].body.headers), 'the confirmation has no unsubscribe header (it is not a notification)');
const link = /https?:\/\/\S*\/api\/email\/confirm\?t=([A-Za-z0-9_.-]+)/.exec(String(mock.sent[0].body.text));
ok(!!link, 'the confirmation email carries the link');
const token = link![1];
ok(!(await email.startEmail('ann', 'ann@example.com')).ok, 'asking again within a minute is refused');
await notify('ann', { kind: 'offer', text: '@bob offered you a trade.', tradeId: 't1' });
eq(mock.sent.length, 1, 'nothing else is sent before the address is confirmed');
ok(!(await email.confirmEmail(token + 'x')) && !(await email.confirmEmail('junk')), 'a forged token is refused');
ok(email.readConfirmToken(token, Date.now() + 25 * 3600 * 1000) === null, 'a token expires after 24 hours');
ok(await email.confirmEmail(token), 'the real token confirms');
eq((await email.getEmail('ann'))?.verifiedAt !== undefined, true, 'now confirmed');

// ── sending through notify(): gating and batching ──
mock.sent.length = 0;
await notify('ann', { kind: 'offer', text: '@bob offered you a trade.', tradeId: 't1' });
eq(mock.sent.length, 1, 'the first notice goes out');
const first = mock.sent[0].body as { subject: string; headers: Record<string, string>; to: string[]; tags: { name: string; value: string }[] };
eq(first.subject, 'New trade offer', 'subject');
ok(/api\/email\/unsubscribe\?t=/.test(first.headers['List-Unsubscribe']) && first.headers['List-Unsubscribe-Post'] === 'List-Unsubscribe=One-Click', 'List-Unsubscribe headers are present');
eq(first.tags, [{ name: 'viewer', value: 'ann' }], 'tagged with the viewer for the webhook');
await notify('ann', { kind: 'offer', text: 'second', tradeId: 't2' });
await notify('ann', { kind: 'declined', text: 'third', tradeId: 't3' });
await notify('ann', { kind: 'watch', text: 'not a ticked kind', tradeId: 't4' });
eq(mock.sent.length, 1, 'inside the 15 minute window nothing more goes out, and an unticked kind is never queued');
const { kv } = await import('../lib/db');
eq(((await kv.get('email:q:ann')) as unknown[]).length, 2, 'two notices wait in the queue');
eq(await email.flushEmail('ann'), 0, 'flushing inside the window sends nothing');
await kv.del('email:last:ann'); // the window passes
eq(await email.flushEmail('ann'), 2, 'when the window has passed the queue goes out');
eq(mock.sent.length, 2, 'as one email');
eq((mock.sent[1].body as { subject: string }).subject, '2 new notices on The Cheesy TCG', 'batched subject (an offer and a result)');
eq(await kv.get('email:q:ann'), null, 'the queue is empty again');
await kv.del('email:last:ann');
eq(await email.flushDueEmails(), 0, 'the daily flush has nothing left');
await notify('ann', { kind: 'offer', text: 'opens a window', tradeId: 't5' });
eq(mock.sent.length, 3, 'a notice with the window open goes straight out');
await notify('ann', { kind: 'offer', text: 'late', tradeId: 't5b' });
eq(mock.sent.length, 3, 'the next one waits');
await kv.del('email:last:ann');
eq(await email.flushDueEmails(), 1, 'and the daily flush sends it');
eq(mock.sent.length, 4, 'one more email');

// the bell switch still wins
const { saveUserSettings } = await import('../lib/user-settings-store');
await saveUserSettings('ann', { notifyOffers: false });
await kv.del('email:last:ann');
await notify('ann', { kind: 'offer', text: 'muted in the bell', tradeId: 't6' });
eq(mock.sent.length, 4, 'a kind switched off in the bell is not emailed either');
await saveUserSettings('ann', { notifyOffers: true });

// kinds can be changed
await email.setEmailKinds('ann', ['watch']);
await kv.del('email:last:ann');
await notify('ann', { kind: 'watch', text: 'a card was listed', tradeId: 't7' });
eq(mock.sent.length, 5, 'a newly ticked kind is emailed');
await email.setEmailKinds('ann', ['offers', 'results']);

// ── a failed send keeps the notices ──
await email.startEmail('zed', 'zed@fail.test').then(r => ok(!r.ok, 'a failing provider reports the failure'));
const zed = await email.getEmail('zed');
ok(zed && !zed.verifiedAt, 'and the address stays unconfirmed');
await kv.set('user:zed:email', { ...zed, verifiedAt: Date.now() });
await notify('zed', { kind: 'offer', text: 'x', tradeId: 'z1' });
eq(((await kv.get('email:q:zed')) as unknown[]).length, 1, 'a failed send keeps the notice queued');
ok(!(await kv.get('email:last:zed')), 'and opens the window again');

// ── unsubscribe ──
const unsub = email.unsubscribeToken('ann');
eq(email.readUnsubscribeToken(unsub), 'ann', 'unsubscribe token round-trips');
ok(email.readUnsubscribeToken(unsub + 'x') === null && email.readUnsubscribeToken(token) === null && email.readUnsubscribeToken('x.y') === null, 'forged or wrong-kind tokens are refused');
ok(email.readConfirmToken(unsub) === null, 'an unsubscribe token cannot confirm');
const { GET, POST } = await import('../app/api/email/unsubscribe/route');
const { NextRequest } = await import('next/server');
const res = await POST(new NextRequest(`http://localhost/api/email/unsubscribe?t=${unsub}`, { method: 'POST' }));
eq(res.status, 200, 'one-click POST works without a session');
eq((await email.getEmail('ann'))?.off, 'unsubscribed', 'email is off');
await kv.del('email:last:ann');
const before = mock.sent.length;
await notify('ann', { kind: 'offer', text: 'after unsubscribe', tradeId: 't8' });
eq(mock.sent.length, before, 'nothing is sent after unsubscribing');
eq((await GET(new NextRequest('http://localhost/api/email/unsubscribe?t=bad'))).headers.get('location')?.endsWith('/email-status?s=invalid'), true, 'a bad link lands on the invalid page');
// turning it on again needs a new confirmation
await kv.del('email:cfm:ann');
ok((await email.startEmail('ann', 'ann@example.com')).ok && !(await email.getEmail('ann'))?.off && !(await email.getEmail('ann'))?.verifiedAt, 're-adding starts the opt-in again');
// changing the address kills the old link
const oldToken = /confirm\?t=([A-Za-z0-9_.-]+)/.exec(String(mock.sent[mock.sent.length - 1].body.text))![1];
await kv.del('email:cfm:ann');
await email.startEmail('ann', 'new@example.com');
ok(!(await email.confirmEmail(oldToken)), 'a link for the old address no longer works');

// ── Resend webhook: signature and switch-off ──
const secret = 'whsec_' + Buffer.from('webhook-test-secret').toString('base64');
const sign = (id: string, ts: string, body: string) => 'v1,' + createHmac('sha256', Buffer.from('webhook-test-secret')).update(`${id}.${ts}.${body}`).digest('base64');
const now = String(Math.floor(Date.now() / 1000));
const bodyText = JSON.stringify({ type: 'email.bounced', data: { to: ['new@example.com'], tags: { viewer: 'ann' } } });
ok(email.verifyWebhook(bodyText, { id: 'm1', timestamp: now, signature: sign('m1', now, bodyText) }, secret), 'a good signature passes');
ok(!email.verifyWebhook(bodyText + ' ', { id: 'm1', timestamp: now, signature: sign('m1', now, bodyText) }, secret), 'an edited body fails');
ok(!email.verifyWebhook(bodyText, { id: 'm1', timestamp: String(Number(now) - 3600), signature: sign('m1', String(Number(now) - 3600), bodyText) }, secret), 'an old timestamp fails');
ok(!email.verifyWebhook(bodyText, { id: 'm1', timestamp: now, signature: sign('m1', now, bodyText) }, ''), 'no secret refuses everything');
process.env.RESEND_WEBHOOK_SECRET = secret;
const hook = await import('../app/api/webhooks/email/route');
const call = (b: string, sig?: string) => hook.POST(new NextRequest('http://localhost/api/webhooks/email', { method: 'POST', body: b, headers: { 'svix-id': 'm2', 'svix-timestamp': now, 'svix-signature': sig ?? sign('m2', now, b) } }));
eq((await call(bodyText, 'v1,AAAA')).status, 401, 'a bad signature is refused with 401');
await kv.set('user:ann:email', { ...(await email.getEmail('ann')), verifiedAt: Date.now() });
eq((await call(JSON.stringify({ type: 'email.bounced', data: { to: ['other@example.com'], tags: { viewer: 'ann' } } }))).status, 200, 'a bounce for another address is accepted but ignored');
ok(!(await email.getEmail('ann'))?.off, 'and does nothing');
eq((await call(bodyText)).status, 200, 'a signed bounce is accepted');
eq((await email.getEmail('ann'))?.off, 'bounced', 'a bounce switches email off');
await kv.set('user:ann:email', { ...(await email.getEmail('ann')), off: undefined, verifiedAt: Date.now() });
await call(JSON.stringify({ type: 'email.complained', data: { to: ['new@example.com'], tags: [{ name: 'viewer', value: 'ann' }] } }));
eq((await email.getEmail('ann'))?.off, 'complained', 'a complaint switches email off (tags as a list too)');
eq(await email.handleWebhookEvent({ type: 'email.delivered', data: {} }), 'ignored', 'other events are ignored');

// ── a sandbox never sends ──
const { runInSandbox } = await import('../lib/db');
await kv.set('user:dan:email', { address: 'dan@example.com', addedAt: 1, verifiedAt: 2, kinds: ['offers', 'results'] });
const sentBefore = mock.sent.length;
await runInSandbox('testbox', async () => {
  await kv.set('user:dan:email', { address: 'dan@example.com', addedAt: 1, verifiedAt: 2, kinds: ['offers', 'results'] });
  await notify('dan', { kind: 'offer', text: 'x', tradeId: 'd1' });
  await email.flushEmail('dan');
  await kv.del('email:cfm:dan');
  await email.startEmail('dan', 'dan@example.com');
});
eq(mock.sent.length, sentBefore, 'nothing reached Resend from a sandbox');

// ── the export and deletion ──
const { buildExport } = await import('../lib/user-export');
const ex = await buildExport('dan') as unknown as { email: { address: string; confirmedAt: string | null } | null };
eq(ex.email?.address, 'dan@example.com', 'the export includes the email record');
await email.deleteEmail('dan');
eq(await email.getEmail('dan'), null, 'deleting removes it');
const ex2 = await buildExport('dan') as unknown as { email: unknown };
eq(ex2.email, null, 'and the export no longer has it');

mock.stop();
console.log('email checks ok');
