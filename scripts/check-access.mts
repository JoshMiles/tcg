// Checks the closed alpha / beta gate (ROADMAP Track 16): canEnter, the signed access cookie, the middleware matcher's allow list,
// the gate decision (every exempt path passes, the Twitch extension's API is untouched), the real middleware against the mock KV, the
// testers list and the tester achievement. Needs the mock KV (node scripts/mock-kv.cjs).
// Run: npx tsx scripts/check-access.mts
process.env.KV_REST_API_URL ||= 'http://localhost:4111';
process.env.KV_REST_API_TOKEN ||= 'dev';
process.env.KV_URL ||= 'redis://dev';
process.env.SESSION_SECRET = 'a-test-secret-that-is-long-enough-123';

const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const core = await import('../lib/access-core');
const tok = await import('../lib/access-token');
const gate = await import('../lib/access-gate');
const edge = await import('../lib/access-edge');
const staffTok = await import('../lib/staff-token');

// ── canEnter ──
const { canEnter } = core;
ok(canEnter('open', null, false), 'open: a stranger');
ok(canEnter('beta', 'beta', false) && canEnter('beta', 'alpha', false) && !canEnter('beta', null, false), 'beta: both tiers, no strangers');
ok(canEnter('alpha', 'alpha', false) && !canEnter('alpha', 'beta', false) && !canEnter('alpha', null, false), 'alpha: alpha testers only');
ok(canEnter('alpha', null, true) && canEnter('beta', null, true), 'staff always');
ok(core.canEnterTier('alpha', 'staff') && !core.canEnterTier('alpha', 'beta') && core.canEnterTier('beta', 'beta'), 'canEnterTier splits staff from tiers');
ok(core.bestTier(true, 'beta') === 'staff' && core.bestTier(false, 'alpha') === 'alpha' && core.bestTier(false, null) === null, 'bestTier');

// ── settings and tester cleaning ──
ok(JSON.stringify(core.normalizeAccess(null)) === JSON.stringify({ mode: 'open', label: 'none', v: 0 }), 'default is open, no label');
ok(core.normalizeAccess({ mode: 'bogus', label: 'x', v: -3 }).mode === 'open', 'unknown mode falls back to open');
ok(core.normalizeAccess({ mode: 'beta', label: 'beta', message: '  hi  ', v: 4 }).message === 'hi', 'message trimmed');
ok(core.normalizeAccess({ message: 'x'.repeat(999) }).message!.length === core.MESSAGE_MAX, 'message capped');
ok(core.normalizeAccess(JSON.stringify({ mode: 'alpha', v: 2 })).mode === 'alpha', 'a stored JSON string is read');
ok(core.sanitizeTester({ login: 'Sam_1', tier: 'beta', addedBy: 'x', addedAt: 5 })?.login === 'sam_1', 'tester login lower-cased');
ok(core.sanitizeTester({ login: 'a', tier: 'beta' }) === null && core.sanitizeTester({ login: 'sam', tier: 'gold' }) === null, 'bad testers dropped');

// ── the signed cookie ──
const t0 = Date.parse('2026-10-16T12:00:00Z');
const signed = (await tok.signAccessToken({ login: 'sam', tier: 'beta', v: 3 }, t0))!;
ok(!!signed, 'signed');
const read = await tok.verifyAccessToken(signed, t0 + 1000);
ok(read?.login === 'sam' && read.tier === 'beta' && read.v === 3, 'verifies');
ok((await tok.verifyAccessToken(signed, t0 + 61 * 60 * 1000)) === null, 'expires after the hour');
ok((await tok.verifyAccessToken(signed + 'x', t0)) === null && (await tok.verifyAccessToken('junk', t0)) === null && (await tok.verifyAccessToken(undefined, t0)) === null, 'tampered and junk are refused');
const [payload, sig] = signed.split('.');
const forged = Buffer.from(JSON.stringify({ login: 'sam', tier: 'staff', v: 3, exp: Math.floor(t0 / 1000) + 3600 })).toString('base64url');
ok((await tok.verifyAccessToken(`${forged}.${sig}`, t0)) === null, 'a changed tier does not verify');
ok(payload.length > 0, 'payload present');
ok((await tok.signAccessToken({ login: 'sam', tier: 'beta', v: 3 }, t0, { SESSION_SECRET: 'short' })) === null, 'no secret, no cookie');
// A staff cookie (same secret) is never an access cookie.
const staffCookie = (await staffTok.signStaffToken({ u: 'sam', id: '1', dn: 'Sam', role: 'mod' }, t0))!;
ok((await tok.verifyAccessToken(staffCookie, t0)) === null, 'a staff cookie is not an access cookie');

// ── the allow list ──
const EXEMPT = [
  '/closed', '/login', '/auth/twitch', '/auth/access', '/auth/staff', '/auth/logout', '/auth/error', '/admin', '/admin/settings', '/mod', '/mod/users',
  '/privacy', '/terms', '/api/twitch/user', '/api/twitch/leaderboard', '/api/version', '/api/webhooks/pull', '/api/webhooks/queue', '/api/cron/backup', '/api/overlay/config',
  '/api/overlay/heartbeat', '/api/collection', '/api/seasons/active', '/api/auth/login', '/api/admin/activity', '/api/upload', '/api/account/deletion', '/api/account/export',
  '/overlay.html', '/widget.js', '/widget.css', '/sw.js', '/robots.txt', '/sitemap.xml', '/manifest.webmanifest', '/assets/sounds/1.mp3', '/brand/icon.png',
  '/icons/x.png', '/twitch-panel/panel.js', '/_next/static/x.js', '/apple-touch-icon.png', '/icon.png'
];
const GATED = [
  '/', '/leaderboard', '/leaderboard/s1', '/cards', '/cards/12', '/collection', '/collection/sam', '/u/sam', '/account', '/settings', '/trade', '/trade/new', '/trade/abc',
  '/notifications', '/feedback', '/stats', '/changelog', '/install', '/p/x', '/c/1', '/copy/1', '/offline-not',
  '/api/trades', '/api/trades/holdings', '/api/trades/abc', '/api/account/settings', '/api/account/push', '/api/account/upgrade', '/api/notifications', '/api/feedback',
  '/api/search', '/api/live', '/api/recent-pulls',
];
for (const p of EXEMPT.filter(p => !/\.[a-z0-9]+$/i.test(p))) ok(core.isExemptPath(p), `exempt: ${p}`);
for (const p of EXEMPT.filter(p => /\.[a-z0-9]+$/i.test(p))) ok(core.isExemptPath(p), `exempt (file): ${p}`);
for (const p of GATED) ok(!core.isExemptPath(p), `gated: ${p}`);
ok(!core.isExemptPath('/faq-not') && !core.isExemptPath('/privacyx') && !core.isExemptPath('/admins') && !core.isExemptPath('/closedx'), 'prefixes match whole segments only');

// ── the matcher: static files never reach the middleware; everything the gate must see does ──
const mw = await import('../middleware');
const matcher = new RegExp('^' + mw.config.matcher[0] + '$');
for (const p of ['/overlay.html', '/widget.js', '/sw.js', '/robots.txt', '/_next/static/chunk.js', '/assets/sounds/1.mp3', '/brand/icon.png', '/twitch-panel/panel.html', '/icons/a.png']) ok(!matcher.test(p), `matcher skips static: ${p}`);
for (const p of [...GATED.filter(p => p !== '/'), '/admin', '/admin/settings', '/mod', '/api/twitch/user', '/api/twitch/collection', '/api/version', '/closed', '/faq', '/auth/access', '/api/webhooks/pull']) ok(matcher.test(p), `matcher catches: ${p}`);
ok(matcher.test('/'), 'matcher catches the home page');

// ── the gate decision ──
const open = { mode: 'open' as const, label: 'none' as const, v: 1 };
const beta = { mode: 'beta' as const, label: 'beta' as const, v: 5 };
const alpha = { mode: 'alpha' as const, label: 'alpha' as const, v: 5 };
const tokenOf = (tier: 'alpha' | 'beta' | 'staff', v = 5) => ({ login: 'sam', tier, v, exp: 9e9 });
const d = (pathname: string, settings: typeof beta | null, o: { access?: ReturnType<typeof tokenOf> | null; staffCookie?: boolean; hasSession?: boolean } = {}) =>
  gate.gateDecision({ pathname, settings, access: o.access ?? null, staffCookie: !!o.staffCookie, hasSession: !!o.hasSession });
ok(d('/cards', open as never) === 'pass' && d('/api/trades', open as never) === 'pass', 'open: everything passes');
ok(d('/cards', null) === 'pass', 'a database error fails open');
for (const p of EXEMPT) ok(d(p, alpha) === 'pass', `alpha mode: exempt path passes (${p})`);
ok(d('/cards', beta) === 'closed' && d('/cards', beta, { hasSession: true }) === 'refresh', 'beta: strangers to /closed, signed-in to /auth/access');
ok(d('/api/trades', beta) === 'forbidden' && d('/api/trades', beta, { hasSession: true }) === 'forbidden', 'beta: gated APIs answer 403');
ok(d('/cards', beta, { access: tokenOf('beta') }) === 'pass' && d('/cards', beta, { access: tokenOf('alpha') }) === 'pass', 'beta: both tiers pass');
ok(d('/cards', alpha, { access: tokenOf('beta'), hasSession: true }) === 'refresh', 'alpha: a beta tester is sent back to be checked');
ok(d('/cards', alpha, { access: tokenOf('alpha') }) === 'pass' && d('/cards', alpha, { access: tokenOf('staff') }) === 'pass', 'alpha: alpha and staff pass');
ok(d('/cards', alpha, { access: tokenOf('alpha', 4), hasSession: true }) === 'refresh', 'an old settings version is re-checked');
ok(d('/cards', alpha, { access: tokenOf('alpha', 6) }) === 'pass', 'a newer cookie than our copy passes');
ok(d('/cards', alpha, { staffCookie: true }) === 'pass', 'a staff cookie passes');

// ── the real middleware against the mock KV ──
const { NextRequest } = await import('next/server');
const kvUrl = process.env.KV_REST_API_URL!;
const setSettings = async (v: unknown) => { await fetch(kvUrl, { method: 'POST', headers: { Authorization: 'Bearer dev' }, body: JSON.stringify(['SET', 'access:settings', JSON.stringify(v)]) }); edge.resetAccessCache(); };
const run = async (path: string, cookies = '', headers: Record<string, string> = {}) => mw.middleware(new NextRequest(`http://localhost:3112${path}`, { headers: { ...headers, ...(cookies ? { cookie: cookies } : {}) } }));
const location = (r: Response) => r.headers.get('location') ?? '';

await setSettings({ mode: 'open', label: 'none', v: 1 });
ok((await run('/cards')).status === 200, 'middleware: open passes a page');
await setSettings({ mode: 'beta', label: 'beta', v: 5 });
let r = await run('/cards');
ok(r.status === 307 && location(r).endsWith('/closed'), 'middleware: a stranger goes to /closed');
r = await run('/cards?x=1', 'tcg_session=anything');
ok(r.status === 307 && location(r).includes('/auth/access?returnTo=' + encodeURIComponent('/cards?x=1')), 'middleware: a signed-in viewer goes to /auth/access');
r = await run('/api/trades');
ok(r.status === 403 && (await r.json()).error === 'closed', 'middleware: a gated API answers 403 closed');
r = await run('/privacy');
ok(r.status === 200 && r.headers.get('x-middleware-request-x-tcg-path') === '/privacy', 'middleware: /privacy passes and carries its path for the layouts');
r = await run('/faq');
ok(r.status === 307 && location(r).endsWith('/closed'), 'middleware: the FAQ is closed to strangers too');
ok(!core.isExemptPath('/faq'), 'the FAQ is not on the allow list');
const good = await tok.signAccessToken({ login: 'sam', tier: 'beta', v: 5 });
r = await run('/cards', `tcg_access=${good}`);
ok(r.status === 200, 'middleware: a valid beta cookie passes in beta mode');
await setSettings({ mode: 'alpha', label: 'alpha', v: 6 });
r = await run('/cards', `tcg_access=${good}; tcg_session=s`);
ok(r.status === 307 && location(r).includes('/auth/access'), 'middleware: the beta cookie no longer passes in alpha mode');
// The extension's API keeps exactly its CORS behaviour and is never gated.
r = await run('/api/twitch/user', '', { origin: 'https://abc123.ext-twitch.tv' });
ok(r.status === 200 && r.headers.get('access-control-allow-origin') === 'https://abc123.ext-twitch.tv', 'middleware: /api/twitch keeps its CORS answer in alpha mode');
r = await mw.middleware(new NextRequest('http://localhost:3112/api/twitch/user', { method: 'OPTIONS', headers: { origin: 'https://abc123.ext-twitch.tv' } }));
ok(r.status === 204, 'middleware: /api/twitch preflight unchanged');
r = await run('/api/twitch/user', '', { origin: 'https://evil.example' });
ok(r.status === 200 && !r.headers.get('access-control-allow-origin'), 'middleware: other origins still get no CORS header');
r = await run('/api/webhooks/pull');
ok(r.status === 200, 'middleware: webhooks pass in alpha mode');
// A stale cache: the cookie is newer than our remembered copy, so the settings are looked up again (no redirect loop).
const rawSet = async (v: unknown) => { await fetch(kvUrl, { method: 'POST', headers: { Authorization: 'Bearer dev' }, body: JSON.stringify(['SET', 'access:settings', JSON.stringify(v)]) }); };
await setSettings({ mode: 'beta', label: 'beta', v: 7 });
await run('/privacy'); // our copy is now beta v7
await rawSet({ mode: 'alpha', label: 'alpha', v: 8 }); // changed behind our back
const alphaCookie = await tok.signAccessToken({ login: 'sam', tier: 'alpha', v: 8 });
r = await run('/cards', `tcg_access=${alphaCookie}`);
ok(r.status === 200, 'middleware: a newer cookie makes it refresh the remembered settings');
await setSettings({ mode: 'open', label: 'none', v: 9 });

// ── the testers list and the achievement ──
const acc = await import('../lib/access');
ok((await acc.getAccessSettings()).mode === 'open', 'settings read back');
let res = await acc.saveAccessSettings('josh', { mode: 'beta', label: 'beta', message: 'Welcome testers' });
const saved = await acc.getAccessSettings();
ok(res.ok && saved.mode === 'beta' && saved.v === 10 && saved.message === 'Welcome testers', 'saving raises v by one');
res = await acc.saveAccessSettings('josh', { mode: 'open', label: 'none' });
ok((await acc.getAccessSettings()).v === 11, 'every save raises v');
ok((await acc.getAccessLog()).length >= 2, 'changes are logged');

ok(!(await acc.setTester('josh', 'x', 'beta')).ok, 'short login refused');
ok(!(await acc.setTester('josh', 'sam_t', 'gold')).ok, 'bad tier refused');
ok((await acc.setTester('josh', '@Sam_T', 'beta', 'friend')).ok, 'add a beta tester');
ok((await acc.getTester('sam_t'))?.tier === 'beta' && (await acc.getTester('SAM_T'))?.note === 'friend', 'stored and read case-insensitively');
const achKey = (u: string) => `user:${u}:ach`;
const { kv } = await import('../lib/db');
ok(!!(await kv.hget(achKey('sam_t'), 'special:beta-tester')), 'the beta achievement is written');
ok((await acc.setTester('josh', 'sam_t', 'alpha')).ok, 'move to alpha');
ok(!!(await kv.hget(achKey('sam_t'), 'special:alpha-tester')) && !!(await kv.hget(achKey('sam_t'), 'special:beta-tester')), 'both achievements kept after moving up');
ok((await acc.getTester('sam_t'))?.addedBy === 'josh', 'addedBy kept');
ok((await acc.tierFor({ username: 'sam_t', twitchId: '5' })) === 'alpha', 'tierFor: a tester');
ok((await acc.tierFor({ username: 'nobody1', twitchId: '6' })) === null, 'tierFor: a stranger');
ok((await acc.tierFor({ username: 'sam_t', twitchId: '5', sandbox: 'x' })) === null, 'tierFor: a sandbox login is nobody');
ok((await acc.tierFor({ username: 'joshmiles', twitchId: '36094918' })) === 'staff', 'tierFor: staff (the super admin)');
ok((await acc.listTesters()).length === 1, 'listed');
const { syncAchievements } = await import('../lib/achievements-store');
const view = await syncAchievements('sam_t');
ok(view.earned.length === 2 && view.earned.every(a => a.seasonId === 'special'), 'syncAchievements keeps the stored special entries');
ok(view.earned[0].seasonName === 'Special', 'listed with the Special season name');
ok((await acc.removeTester('josh', 'sam_t')).ok && !(await acc.getTester('sam_t')), 'removed');
ok(!!(await kv.hget(achKey('sam_t'), 'special:alpha-tester')), 'the achievement outlives the removal');
ok(!(await acc.removeTester('josh', 'sam_t')).ok, 'removing twice is refused');
await acc.setTester('josh', 'gone_user', 'beta');
await acc.deleteTesterRecord('gone_user');
ok(!(await acc.getTester('gone_user')), 'deleteTesterRecord (account deletion)');

// ── a database outage keeps the last good settings rather than opening the site ──
await setSettings({ mode: 'alpha', label: 'alpha', v: 9 });
ok((await edge.readAccessSettings(true))?.mode === 'alpha', 'outage: the settings are read');
const liveUrl = process.env.KV_REST_API_URL;
process.env.KV_REST_API_URL = 'http://127.0.0.1:1';
ok((await edge.readAccessSettings(true))?.mode === 'alpha', 'outage: the last good copy stands in');
edge.resetAccessCache();
ok((await edge.readAccessSettings(true)) === null, 'outage: with no earlier copy there is nothing to go on');
process.env.KV_REST_API_URL = liveUrl;
ok((await edge.readAccessSettings(true))?.mode === 'alpha', 'outage: reads recover');

// ── SEO ──
const seo = await import('../lib/seo');
const closedMap = seo.buildSitemap('https://x.test', [{ id: 's1' }], new Date(0), true).map(e => e.url);
ok(closedMap.length === 2 && closedMap.every(u => /\/(privacy|terms)$/.test(u)), 'closed sitemap lists only privacy and terms');
ok(seo.buildSitemap('https://x.test', [{ id: 's1' }]).length > 3, 'open sitemap unchanged');

console.log('check-access: all passed');
process.exit(0);
