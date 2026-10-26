// Emergency admin cookie, legacy import, collection dump and trade holdings.
// A leaked ADMIN_SECRET must not mint a cookie, the cookie expires on the server, GET /api/collection is not a
// public dump, and GET /api/trades/holdings does not hand out a private profile.
// Needs the mock KV (node scripts/mock-kv.cjs). Run: npx tsx scripts/check-auth-privacy.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url;
process.env.KV_REST_API_TOKEN ??= 'dev';
process.env.KV_URL ??= 'redis://dev';
process.env.VERCEL_ENV = 'development';
process.env.ADMIN_COOKIE_SECRET = 'cookie-signing-key-not-the-admin-secret';
process.env.ADMIN_PASSWORD = 'pw';
process.env.ADMIN_SECRET = 'leaked-admin-secret-value';
delete process.env.ADMIN_PASSWORD_LOGIN;

const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const { readFileSync } = await import('node:fs');

const token = await import('../lib/admin-token');
const cookieStore = await import('../lib/admin-cookie');
const edge = await import('../lib/admin-auth-edge');
const access = await import('../lib/holdings-access');
const { NextRequest } = await import('next/server');
const kvLib = await import('../lib/kv');
const settingsStore = await import('../lib/user-settings-store');
const overlay = await import('../lib/overlay-key');
const login = await import('../app/api/auth/login/route');
const legacy = await import('../app/api/admin/import-legacy/route');
const collection = await import('../app/api/collection/route');
const holdings = await import('../app/api/trades/holdings/route');

const KEY = process.env.ADMIN_COOKIE_SECRET;
const LEAKED = process.env.ADMIN_SECRET!;
const now = 1_700_000_000_000;

// ── the cookie is not a function of ADMIN_SECRET, and it expires ──
ok(token.adminCookieKey() === KEY && token.adminCookieKey({ ADMIN_SECRET: LEAKED }) === null, 'the cookie key is ADMIN_COOKIE_SECRET');
const minted = await token.signAdminCookie(KEY, 1, now);
ok(minted && !minted.includes(LEAKED) && !minted.includes(KEY), 'the cookie value holds neither secret');
ok(await token.isValidAdminToken(minted!, KEY, 1, now), 'a fresh cookie is accepted');
ok(!(await token.isValidAdminToken(await token.signAdminCookie(LEAKED, 1, now), KEY, 1, now)), 'signing with the leaked secret does not produce a valid cookie');
ok(!(await token.isValidAdminToken(LEAKED, KEY, 1, now)), 'the leaked secret itself is not a cookie');
ok(!(await token.isValidAdminToken(minted!, KEY, 1, now + token.ADMIN_COOKIE_TTL_S * 1000 + 1000)), 'the server rejects an expired cookie');
ok(!(await token.isValidAdminToken(minted!, KEY, 2, now)), 'the wrong generation is rejected');

// ── generation lives in KV, and sign-out bumps it ──
ok(await cookieStore.ensureAdminGen() === 1, 'the first generation is 1');
ok(await edge.readAdminGenEdge() === 1, 'middleware reads the same generation');
await cookieStore.bumpAdminGen();
ok(await cookieStore.currentAdminGen() === 2 && await edge.readAdminGenEdge() === 2, 'a sign-out moves the generation, including for middleware');
ok(!(await token.isValidAdminToken(minted!, KEY, (await cookieStore.currentAdminGen())!, now)), 'a cookie from before the sign-out is dead');

// ── password login issues that cookie, and does not need ADMIN_SECRET ──
const signedIn = await login.POST(new NextRequest('http://localhost/api/auth/login', {
  method: 'POST', body: JSON.stringify({ password: 'pw' }), headers: { 'content-type': 'application/json' },
}));
ok(signedIn.status === 200, 'the right password signs in');
const issued = signedIn.cookies.get(token.AUTH_COOKIE)?.value;
const gen = await cookieStore.currentAdminGen();
ok(!!issued && !!gen && await token.isValidAdminToken(issued, KEY, gen), 'the login cookie matches the live generation');
ok(!issued!.includes(LEAKED), 'the issued cookie does not contain ADMIN_SECRET');
const logout = await import('../app/api/auth/logout/route');
const signedOut = await logout.POST(new NextRequest('http://localhost/api/auth/logout', {
  method: 'POST', headers: { cookie: `${token.AUTH_COOKIE}=${issued}` },
}));
ok(signedOut.status === 303 && (await cookieStore.currentAdminGen()) === gen! + 1, 'signing out bumps the generation');
ok(!(await token.isValidAdminToken(issued, KEY, (await cookieStore.currentAdminGen())!)), 'the cookie from before sign-out no longer matches');
const genBefore = await cookieStore.currentAdminGen();
await logout.POST(new NextRequest('http://localhost/api/auth/logout', { method: 'POST', headers: { cookie: `${token.AUTH_COOKIE}=junk` } }));
ok((await cookieStore.currentAdminGen()) === genBefore, 'a junk emergency cookie does not sign everyone out');

// ── panel Log out sticks: the site login alone does not bring the staff cookie back ──
const { STAFF_COOKIE, STAFF_OUT_COOKIE } = await import('../lib/staff-token');
const marker = signedOut.cookies.get(STAFF_OUT_COOKIE)?.value;
ok(!!marker && signedOut.headers.get('location')?.endsWith('/login?out=1') === true, 'panel Log out sets the marker and lands on the sign-in page');
const staffRoute = await import('../app/auth/staff/route');
const outCookie = { cookie: `${STAFF_OUT_COOKIE}=1` };
const again = await staffRoute.GET(new NextRequest('http://localhost/auth/staff?returnTo=%2Fmod', { headers: outCookie }));
ok(again.status === 307 && (again.headers.get('location') ?? '').includes('/login?returnTo=%2Fmod') && !again.cookies.get(STAFF_COOKIE)?.value, 'after Log out, the next panel visit asks to sign in instead of re-issuing the staff cookie');
const silentAgain = await staffRoute.GET(new NextRequest('http://localhost/auth/staff?silent=1', { headers: outCookie }));
ok(silentAgain.status === 401, 'the silent renewal is refused too');
process.env.SESSION_SECRET ??= 'session-secret-for-the-check-only';
process.env.TWITCH_CLIENT_ID ??= 'id';
process.env.TWITCH_CLIENT_SECRET ??= 'secret';
const twitchStart = await import('../app/auth/twitch/route');
const start = await twitchStart.GET(new NextRequest('http://localhost/auth/twitch?returnTo=%2Fmod', { headers: outCookie }));
const cleared = start.headers.getSetCookie().find(c => c.startsWith(`${STAFF_OUT_COOKIE}=`)) ?? '';
ok(/Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(cleared), '"Log in with Twitch" clears the marker');
const saved = process.env.ADMIN_COOKIE_SECRET;
delete process.env.ADMIN_COOKIE_SECRET;
const unconfigured = await login.POST(new NextRequest('http://localhost/api/auth/login', {
  method: 'POST', body: JSON.stringify({ password: 'pw' }), headers: { 'content-type': 'application/json' },
}));
ok(unconfigured.status === 503, 'password login fails closed without the cookie key');
process.env.ADMIN_COOKIE_SECRET = saved;

// ── legacy import: no secret in the URL, no write without an admin session ──
const importSrc = readFileSync(new URL('../app/api/admin/import-legacy/route.ts', import.meta.url), 'utf8');
ok(!importSrc.includes('ADMIN_SECRET') && !/searchParams\.get\(\s*['"]secret['"]\s*\)/.test(importSrc), 'the import route does not read a secret');
const peeked = await legacy.GET();
ok(peeked.status === 405, 'GET is not the import');
const sneaky = await legacy.POST(new NextRequest(`http://localhost/api/admin/import-legacy?secret=${encodeURIComponent(LEAKED)}&overwrite=1`, { method: 'POST' }));
ok((sneaky.status === 401 || sneaky.status === 500) && !(await kvLib.getCollection('CheesyStarterDeck')).angrymactavish, 'a leaked secret does not import, and nothing is written');

// ── collection dump ──
await kvLib.saveCollection('privdump', { pat: [4242], sam: [4343] });
await settingsStore.saveUserSettings('pat', { privateProfile: true });
const open = await collection.GET(new NextRequest('http://localhost/api/collection?name=privdump'));
const openBody = await open.text();
ok(open.status === 401 && !openBody.includes('pat') && !openBody.includes('4242') && !openBody.includes('sam'), 'the collection is not public');
ok(open.headers.get('cache-control') === 'no-store', 'the refusal is not cached');
const key = await overlay.getOverlayKey();
const wrong = await collection.GET(new NextRequest('http://localhost/api/collection?name=privdump', { headers: { 'x-overlay-key': 'nope' } }));
ok(wrong.status === 401, 'a wrong overlay key is refused');
const keyed = await collection.GET(new NextRequest('http://localhost/api/collection?name=privdump', { headers: { 'x-overlay-key': key } }));
const keyedBody = await keyed.json() as Record<string, number[]>;
ok(keyed.status === 200 && keyedBody.pat?.[0] === 4242 && keyedBody.sam?.[0] === 4343, 'the overlay key can read the collection, including a private profile');
ok(keyed.headers.get('cache-control') === 'no-store', 'the collection response is not cached');

// ── holdings ──
ok(!access.mayReadHoldings('pat', null, { privateProfile: true, staff: false }), 'a stranger cannot read a private profile');
ok(!access.mayReadHoldings('pat', 'sam', { privateProfile: true, staff: false }), 'another viewer cannot read a private profile');
ok(access.mayReadHoldings('pat', 'pat', { privateProfile: true, staff: false }), 'the owner can read their private profile');
ok(access.mayReadHoldings('pat', null, { privateProfile: true, staff: true }), 'staff can read a private profile');
ok(!access.mayReadHoldings('sam', null, { privateProfile: false, staff: false }), 'a public profile still needs a session');
ok(access.mayReadHoldings('sam', 'sam', { privateProfile: false, staff: false }), 'a signed-in viewer can read a public profile');
await kvLib.seedSeason1();
await kvLib.saveCollection('CheesyStarterDeck', { pat: [4242], sam: [4343] });
const held = await holdings.GET(new NextRequest('http://localhost/api/trades/holdings?username=pat&season=season1'));
const heldBody = await held.text();
ok(held.status === 401 && !heldBody.includes('4242') && !heldBody.includes('holdings') && !heldBody.includes('prints'), 'holdings are not a public dump of a private profile');
const pub = await holdings.GET(new NextRequest('http://localhost/api/trades/holdings?username=sam&season=season1'));
const pubBody = await pub.text();
ok(pub.status === 401 && !pubBody.includes('4343'), 'a public profile is not dumped without a session either');

// ── wrong passwords are counted site-wide, per caller address and per hour ──
const { prodKv, runInSandbox } = await import('../lib/db');
const limits = await import('../lib/login-limit');
const tryPw = (password: string, headers: Record<string, string> = {}) => login.POST(new NextRequest('http://localhost/api/auth/login', {
  method: 'POST', body: JSON.stringify({ password }), headers: { 'content-type': 'application/json', ...headers },
}));
const resetHour = () => prodKv.del(limits.hourFailKey());

ok(limits.clientIp(new Headers({ 'x-forwarded-for': 'spoofed, 10.0.0.9', 'x-real-ip': '10.0.0.8' })) === '10.0.0.8', 'the address comes from x-real-ip when the platform sets it');
ok(limits.clientIp(new Headers({ 'x-forwarded-for': 'spoofed, 10.0.0.9' })) === '10.0.0.9', 'without it, the right-most forwarded entry is used');
ok(limits.clientIp(new Headers()) === 'unknown', 'no address header gives one shared bucket');

// A wrong password counts the same inside a sandbox namespace, or with a junk sandbox id, as outside one.
const A = { 'x-forwarded-for': '10.0.0.1' };
await tryPw('nope', A);
await runInSandbox('side-test', () => tryPw('nope', A));
await runInSandbox('__missing__', () => tryPw('nope', A));
ok(Number(await prodKv.get(limits.ipFailKey('10.0.0.1'))) === 3, 'wrong passwords in a sandbox or junk namespace count toward the same counter');
for (let i = 0; i < limits.MAX_FAILS - 3; i++) await runInSandbox('side-test', () => tryPw('nope', A));
ok((await tryPw('pw', A)).status === 429, 'a locked address is refused even with the right password');
ok((await runInSandbox('__missing__', () => tryPw('pw', A))).status === 429, 'a junk sandbox id does not unlock it');
await resetHour();

// A forged left-most X-Forwarded-For does not get a fresh counter.
for (let i = 0; i < limits.MAX_FAILS; i++) await tryPw('nope', { 'x-forwarded-for': `203.0.113.${i}, 10.0.0.2` });
ok((await tryPw('pw', { 'x-forwarded-for': '203.0.113.99, 10.0.0.2' })).status === 429, 'changing the left-most forwarded entry does not reset the count');
await resetHour();

// The hourly cap locks every address, with the right password too.
for (let i = 0; i < limits.MAX_FAILS_PER_HOUR; i++) await tryPw('nope', { 'x-forwarded-for': `10.1.0.${i}` });
ok((await tryPw('pw', { 'x-forwarded-for': '10.2.0.1' })).status === 429, 'after the hourly cap a fresh address is refused too');
await resetHour();
ok((await tryPw('pw', { 'x-forwarded-for': '10.2.0.1' })).status === 200, 'and the password works again once the hour is over');

// The password login can be switched off.
process.env.ADMIN_PASSWORD_LOGIN = 'off';
ok((await tryPw('pw', { 'x-forwarded-for': '10.3.0.1' })).status === 403, 'ADMIN_PASSWORD_LOGIN=off refuses the password login');
delete process.env.ADMIN_PASSWORD_LOGIN;

console.log('auth privacy checks passed');
