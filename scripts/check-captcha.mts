// Checks the Turnstile gate's decisions (pure: every dependency is faked). Run: npx tsx scripts/check-captcha.mts
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const { captchaKeys, checkCaptcha, verifyTurnstile, captchaBody, PASS_SECONDS } = await import('../lib/captcha');

// Keys: both or nothing.
ok(captchaKeys({}) === null, 'no keys, no captcha');
ok(captchaKeys({ TURNSTILE_SITE_KEY: 'a' }) === null, 'a site key alone is not enough');
ok(captchaKeys({ TURNSTILE_SECRET_KEY: 'b' }) === null, 'a secret alone is not enough');
ok(captchaKeys({ TURNSTILE_SITE_KEY: ' a ', TURNSTILE_SECRET_KEY: ' b ' })?.site === 'a', 'both set (trimmed)');

const KEYS = { site: 'site-key', secret: 'secret-key' };
function deps(over: Partial<Parameters<typeof checkCaptcha>[1]> = {}) {
  const passes = new Set<string>();
  const calls: string[] = [];
  const d = {
    keys: KEYS, sandbox: false,
    hasPass: async (u: string) => passes.has(u),
    grantPass: async (u: string) => { passes.add(u); calls.push(`grant:${u}`); },
    verify: async (t: string) => { calls.push(`verify:${t}`); return t === 'good' ? 'valid' as const : t === 'down' ? 'unreachable' as const : 'invalid' as const; },
    ...over,
  };
  return { d, passes, calls };
}

// Off: no keys, or a sandbox.
ok((await checkCaptcha({ username: 'a' }, deps({ keys: null }).d)).ok, 'no keys: fails open');
ok((await checkCaptcha({ username: 'a' }, deps({ sandbox: true }).d)).ok, 'sandbox: fails open');

// Required, then passed, then remembered.
{
  const { d, passes, calls } = deps();
  const first = await checkCaptcha({ username: 'a' }, d);
  ok(!first.ok && first.reason === 'required' && first.siteKey === 'site-key', 'no token: the check is required, with the public key');
  ok(calls.length === 0, 'nothing is verified without a token');
  ok(!(await checkCaptcha({ username: 'a', token: 'x'.repeat(5000) }, d)).ok && calls.length === 0, 'an absurd token is not even sent to Cloudflare');
  const bad = await checkCaptcha({ username: 'a', token: 'bad' }, d);
  ok(!bad.ok && bad.reason === 'failed' && !passes.has('a'), 'a refused token fails and grants nothing');
  const good = await checkCaptcha({ username: 'a', token: 'good' }, d);
  ok(good.ok && good.via === 'token' && passes.has('a'), 'a good token passes and is remembered');
  const again = await checkCaptcha({ username: 'a' }, d);
  ok(again.ok && again.via === 'pass', 'the next action needs no token');
  const other = await checkCaptcha({ username: 'b' }, d);
  ok(!other.ok, 'the pass belongs to one viewer');
}

// Cloudflare down: let them through, but do not hand out a pass.
{
  const { d, passes } = deps();
  const r = await checkCaptcha({ username: 'a', token: 'down' }, d);
  ok(r.ok && r.via === 'unreachable' && !passes.has('a'), 'an unreachable verifier fails open without granting a pass');
}

// verifyTurnstile against a fake fetch.
{
  const reply = (status: number, body?: unknown) => (async () => new Response(body === undefined ? null : JSON.stringify(body), { status })) as unknown as typeof fetch;
  ok(await verifyTurnstile('t', 's', '1.2.3.4', reply(200, { success: true })) === 'valid', 'success: valid');
  ok(await verifyTurnstile('t', 's', undefined, reply(200, { success: false, 'error-codes': ['invalid-input-response'] })) === 'invalid', 'refused: invalid');
  ok(await verifyTurnstile('t', 's', undefined, reply(500)) === 'unreachable', 'a server error is unreachable');
  ok(await verifyTurnstile('t', 's', undefined, (async () => { throw new Error('network'); }) as unknown as typeof fetch) === 'unreachable', 'a network error is unreachable');
  let sent = '';
  await verifyTurnstile('tok', 'sec', '9.9.9.9', (async (_u: unknown, init?: RequestInit) => { sent = String(init?.body); return new Response(JSON.stringify({ success: true })); }) as unknown as typeof fetch);
  ok(sent.includes('secret=sec') && sent.includes('response=tok') && sent.includes('remoteip=9.9.9.9'), 'secret, token and IP are sent');
}

// What the page sees.
{
  const required = captchaBody({ ok: false, reason: 'required', siteKey: 'k' });
  ok(required.captcha === true && required.siteKey === 'k' && /quick check/i.test(required.error), 'the required response carries the flag and key');
  ok(/did not pass/i.test(captchaBody({ ok: false, reason: 'failed', siteKey: 'k' }).error), 'the failed response says so');
  ok(PASS_SECONDS === 900, 'a pass lasts 15 minutes');
}

console.log('captcha checks passed');
