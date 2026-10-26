// The shared rate limiter (lib/rate-limit.ts): allowed up to the max, refused after, a fresh window resets it, callers are counted
// separately, the login limit keeps its numbers, and the webhook and panel routes answer 429 with a JSON { error }.
// Needs the mock KV (node scripts/mock-kv.cjs). Run: npx tsx scripts/check-rate-limit.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url;
process.env.KV_REST_API_TOKEN ??= 'dev';
process.env.KV_URL ??= 'redis://dev';
process.env.VERCEL_ENV = 'development';

const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const { NextRequest } = await import('next/server');
const { rateLimit, rateCount, limitWebhook, limitTwitch } = await import('../lib/rate-limit');
const login = await import('../lib/login-limit');

// ── the helper ──
for (let i = 1; i <= 5; i++) ok(await rateLimit('t', 'a', 5, 60), `call ${i} of 5 is allowed`);
ok(!(await rateLimit('t', 'a', 5, 60)), 'the 6th call in the window is refused');
ok(!(await rateLimit('t', 'a', 5, 60)), 'and so is the 7th');
ok(await rateLimit('t', 'b', 5, 60), 'another key has its own count');
ok(await rateLimit('u', 'a', 5, 60), 'another name has its own count');
ok(await rateCount('t', 'a') === 7 && await rateCount('t', 'zzz') === 0, 'rateCount reads without counting');

for (let i = 0; i < 3; i++) ok(await rateLimit('w', 'a', 3, 1), 'the short window starts allowed');
ok(!(await rateLimit('w', 'a', 3, 1)), 'the short window is full');
await sleep(1300);
ok(await rateLimit('w', 'a', 3, 1), 'a new window allows calls again');

// ── the login limit keeps its numbers ──
ok(login.MAX_FAILS === 10 && login.WINDOW_S === 900 && login.MAX_FAILS_PER_HOUR === 20, 'the login limits are unchanged');
for (let i = 0; i < login.MAX_FAILS - 1; i++) await login.recordLoginFail('10.9.0.1');
ok(!(await login.loginLocked('10.9.0.1')), 'nine wrong passwords do not lock an address');
await login.recordLoginFail('10.9.0.1');
ok(await login.loginLocked('10.9.0.1') && !(await login.loginLocked('10.9.0.2')), 'the tenth locks that address only');
for (let i = 0; i < login.MAX_FAILS_PER_HOUR - login.MAX_FAILS; i++) await login.recordLoginFail(`10.9.1.${i}`);
ok(await login.loginLocked('10.9.0.3'), 'twenty wrong passwords in an hour lock every address');

// ── the routes ──
const from = (ip: string, path: string, init?: RequestInit) => new NextRequest(`http://localhost${path}`, { ...init, headers: { 'x-real-ip': ip, 'content-type': 'application/json' } });
const stream = await import('../app/api/webhooks/stream/route');
const pull = await import('../app/api/webhooks/pull/route');
const user = await import('../app/api/twitch/user/route');
const hit = () => stream.POST(from('10.8.0.1', '/api/webhooks/stream', { method: 'POST', body: JSON.stringify({ secret: 'x', event: 'live' }) }));

for (let i = 0; i < 600; i++) ok((await hit()).status === 401, 'a webhook call within the limit reaches the secret check');
const blocked = await hit();
ok(blocked.status === 429 && typeof (await blocked.json()).error === 'string', 'the 601st webhook call from one address is a 429 with an error');
ok((await pull.POST(from('10.8.0.1', '/api/webhooks/pull', { method: 'POST', body: '{}' }))).status === 429, 'the limit covers every webhook route');
ok((await stream.POST(from('10.8.0.2', '/api/webhooks/stream', { method: 'POST', body: JSON.stringify({ secret: 'x', event: 'live' }) }))).status === 401, 'another address is not limited');

for (let i = 0; i < 300; i++) ok((await user.GET(from('10.7.0.1', '/api/twitch/user'))).status === 400, 'a panel call within the limit is answered');
const panel = await user.GET(from('10.7.0.1', '/api/twitch/user'));
ok(panel.status === 429 && typeof (await panel.json()).error === 'string', 'the 301st panel call from one address is a 429 with an error');
ok((await user.GET(from('10.7.0.2', '/api/twitch/user'))).status === 400, 'another address is not limited');
ok(await limitWebhook(from('10.6.0.1', '/')) === null && await limitTwitch(from('10.6.0.1', '/')) === null, 'a first call passes both guards');

console.log('rate limit checks passed');
