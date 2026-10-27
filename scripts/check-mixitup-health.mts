// Mix It Up connection health (ROADMAP 55.1a): incoming secrets recorded per route, outgoing results per address, and the status chips.
// Run against the mock KV (node scripts/mock-kv.cjs): npx tsx scripts/check-mixitup-health.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const h = await import('../lib/mixitup-health');
const m = await import('../lib/mixitup');
const w = await import('../lib/webhooks');
const c = await import('../lib/mixitup-core');

// ── Incoming: the right secret sets okAt, a wrong one sets badAt and keeps okAt ──
const secret = (await w.getWebhookSettings()).incomingSecret;
const wait = () => new Promise(r => setTimeout(r, 150)); // the recording is fire-and-forget
ok(await w.incomingSecretValid(secret, '/api/webhooks/pull'), 'the right secret is accepted');
await wait();
let seen = (await h.readMixItUpHealth()).seen['/api/webhooks/pull'];
ok(seen?.okAt && !seen.badAt, 'the right secret sets okAt only');
ok(!(await w.incomingSecretValid('nope', '/api/webhooks/pull')), 'a wrong secret is refused');
await wait();
const after = (await h.readMixItUpHealth()).seen['/api/webhooks/pull'];
ok(after.okAt === seen.okAt && !!after.badAt, 'a wrong secret sets badAt and keeps okAt');
await w.incomingSecretValid('', '/api/webhooks/stream');
await w.incomingSecretValid(undefined, '/api/webhooks/stream');
await w.incomingSecretValid(secret, '/api/other');
await wait();
const all = (await h.readMixItUpHealth()).seen;
ok(!all['/api/webhooks/stream'] && !all['/api/other'], 'a missing secret, or a route outside /api/webhooks, records nothing');

// ── Outgoing: the last result per address; a test message is not tracked ──
let status = 500;
const fake: typeof fetch = async () => new Response('{}', { status });
const s = c.normalizeMixItUp({ enabled: true, balanceUrl: 'https://hook.example/mix', viewersUrl: 'https://hook.example/v', secret: 's' });
await m.fetchBalance(s, 'ann', fake);
let out = (await h.readMixItUpHealth()).out;
ok(out.balance && !out.balance.ok && out.balance.detail === 'HTTP 500', 'a failing balance call records ok:false with the reason');
status = 200;
await m.fetchBalance(s, 'ann', fake);
await m.fetchChatViewers(s, fake);
out = (await h.readMixItUpHealth()).out;
ok(out.balance?.ok && out.balance.detail === 'HTTP 200' && out.viewers?.ok, 'a call that gets an answer records ok:true');
await m.fetchBalance(s, 'ann', async () => { throw new Error('connect ECONNREFUSED'); });
out = (await h.readMixItUpHealth()).out;
ok(!out.balance?.ok && /ECONNREFUSED/.test(out.balance!.detail), 'an unreachable address records the reason in words');
await m.sendTest(s, fake);
ok(!(await h.readMixItUpHealth()).out.deduct, 'a test message is not recorded as a deduct');

// ── The status chips (pure) ──
const now = 1_000_000_000;
const ago = (at: number, n: number) => `${Math.round((n - at) / 60000)} min ago`;
const urls = { balance: 'https://b', deduct: '', add: '', viewers: 'https://v' };
const none = h.healthChips({ seen: {}, out: {} }, urls, now, ago).map(x => x.text);
ok(none[0] === 'Mix It Up has not reached the site yet', 'nothing seen yet');
ok(none.includes('Balance address: set, not used yet') && none.includes('Deduct address: uses the balance address, not used yet') && none.includes('Add address: not set'), 'unused, fallback and empty addresses');
const none2 = h.healthChips({ seen: {}, out: {} }, { ...urls, balance: '' }, now, ago).map(x => x.text);
ok(none2.includes('Deduct address: not set'), 'no deduct and no balance address is not set');
const full = h.healthChips({
  seen: { '/api/webhooks/pull': { okAt: now - 3 * 60000 }, '/api/webhooks/command': { okAt: now - 60000, badAt: now - 120000 }, '/api/webhooks/stream': { okAt: now - 600000, badAt: now - 60000 } },
  out: { balance: { at: now - 120000, ok: true, detail: 'HTTP 200' }, viewers: { at: now - 60000, ok: false, detail: 'HTTP 500' } },
}, urls, now, ago);
ok(full[0].text === 'Mix It Up last reached the site 1 min ago (chat commands)' && full[0].tone === 'ok', 'the newest okAt wins, with a friendly route name');
ok(full.filter(x => x.tone === 'warn').length === 1 && full.some(x => x.text === 'Mix It Up reached stream start/end with the wrong secret 1 min ago'), 'only a badAt newer than okAt warns');
ok(full.some(x => x.text === 'Balance address: working (2 min ago)' && x.tone === 'ok'), 'a good last result is working');
ok(full.some(x => x.text === 'Chat viewers address: failing, HTTP 500 (1 min ago)' && x.tone === 'bad'), 'a bad last result is failing with the detail');

console.log('mixitup-health checks passed');
