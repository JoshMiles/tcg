// Checks that each signed value has its own key (lib/signing.ts) and that secrets are compared in constant time:
// a value signed with one purpose's key (or with the bare SESSION_SECRET, as before) is refused everywhere else, and safeEqual
// compares whole values whatever their length. Needs the mock KV (node scripts/mock-kv.cjs).
// Run: npx tsx scripts/check-signing-keys.mts
process.env.KV_REST_API_URL ||= 'http://localhost:4111';
process.env.KV_REST_API_TOKEN ||= 'dev';
process.env.KV_URL ||= 'redis://dev';
const SECRET = 'a-test-secret-that-is-long-enough-123';
process.env.SESSION_SECRET = SECRET;

import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';

const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const { signingKey, safeEqual } = await import('../lib/signing');
const session = await import('../lib/session');
const staffTok = await import('../lib/staff-token');
const accessTok = await import('../lib/access-token');
const sandboxTok = await import('../lib/sandbox-token');
const jwt = await import('../lib/twitch-jwt');

// ── one key per purpose ──
const purposes = ['session', 'staff', 'access', 'sandbox-entry', 'mock-ext'] as const;
const keys = purposes.map(p => signingKey(p));
ok(keys.every(k => typeof k === 'string' && k.includes(SECRET) && k !== SECRET), 'every key is derived, never the bare secret');
ok(new Set(keys).size === purposes.length, 'every purpose has a different key');
ok(signingKey('staff', { SESSION_SECRET: 'short' }) === null && signingKey('staff', {}) === null, 'a missing or short secret gives no key');
ok(signingKey('staff', { SESSION_SECRET: SECRET }) === signingKey('staff'), 'the key is a function of the secret and the purpose');

// ── a value signed under another purpose's key (or the bare secret) is refused ──
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const signWith = (key: string, payload: string) => `${payload}.${createHmac('sha256', key).update(payload).digest('base64url')}`;
const nowS = Math.floor(Date.now() / 1000);

const sessionPayload = b64({ username: 'sam', twitchId: '1', displayName: 'Sam', exp: nowS + 600 });
ok(session.verifySession(signWith(signingKey('session')!, sessionPayload))?.username === 'sam', 'a session signed with the session key verifies');
ok(session.verifySession(signWith(SECRET, sessionPayload)) === null, 'a session signed with the bare secret is refused');
ok(session.verifySession(signWith(signingKey('staff')!, sessionPayload)) === null, 'a session signed with the staff key is refused');
ok(session.verifySession(session.signSession({ username: 'sam', twitchId: '1', displayName: 'Sam' })!)?.username === 'sam', 'signSession round-trips');

const staffPayload = b64({ u: 'sam', id: '1', dn: 'Sam', role: 'super', exp: nowS + 600 });
ok((await staffTok.verifyStaffToken(signWith(signingKey('staff')!, staffPayload)))?.role === 'super', 'a staff cookie signed with the staff key verifies');
ok((await staffTok.verifyStaffToken(signWith(SECRET, staffPayload))) === null, 'a staff cookie signed with the bare secret is refused');
ok((await staffTok.verifyStaffToken(signWith(signingKey('session')!, staffPayload))) === null, 'a staff cookie signed with the session key is refused');
ok((await staffTok.verifyStaffToken(signWith(signingKey('access')!, staffPayload))) === null, 'a staff cookie signed with the access key is refused');

const accessPayload = b64({ login: 'sam', tier: 'staff', v: 1, exp: nowS + 600 });
ok((await accessTok.verifyAccessToken(signWith(signingKey('access')!, accessPayload)))?.tier === 'staff', 'an access cookie signed with the access key verifies');
ok((await accessTok.verifyAccessToken(signWith(SECRET, accessPayload))) === null, 'an access cookie signed with the bare secret is refused');
ok((await accessTok.verifyAccessToken(signWith(signingKey('staff')!, accessPayload))) === null, 'an access cookie signed with the staff key is refused');
ok((await accessTok.verifyAccessToken((await staffTok.signStaffToken({ u: 'sam', id: '1', dn: 'Sam', role: 'mod' }))!)) === null, 'a real staff cookie is not an access cookie');
ok((await staffTok.verifyStaffToken((await accessTok.signAccessToken({ login: 'sam', tier: 'staff', v: 1 }))!)) === null, 'a real access cookie is not a staff cookie');

const sandboxToken = sandboxTok.signSandboxId('box1')!;
ok(sandboxTok.verifySandboxToken(sandboxToken) === 'box1', 'a sandbox token verifies');
const forgedBox = `box1.${createHmac('sha256', signingKey('session')!).update('box1').digest('base64url')}`;
ok(sandboxTok.verifySandboxToken(forgedBox) === null, 'a sandbox token signed with the session key is refused');

const mock = jwt.signMockTwitchJwt({ opaque_user_id: 'Umock', user_id: '1', channel_id: '1', role: 'viewer', sandbox: 'box1', login: 'sam' })!;
const [h, p] = mock.split('.');
const forgedMock = `${h}.${p}.${createHmac('sha256', signingKey('session')!).update(`${h}.${p}`).digest('base64url')}`;
ok((await jwt.verifyExtensionAuth(forgedMock)) === null, 'a fake Twitch token signed with the session key is refused');

// ── constant-time compares ──
ok(await safeEqual('abc', 'abc') && await safeEqual('', ''), 'equal strings match');
ok(!(await safeEqual('abc', 'abd')), 'a different last character does not match');
ok(!(await safeEqual('abc', 'abcd')) && !(await safeEqual('abcd', 'abc')) && !(await safeEqual('', 'a')), 'a different length does not match');
ok(await safeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3])) && !(await safeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2]))), 'bytes compare whole');

// No hand-rolled `^` loop or plain === on a secret is left in the signing code.
for (const f of ['lib/staff-token.ts', 'lib/access-token.ts', 'lib/admin-token.ts', 'app/api/auth/login/route.ts']) {
  const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
  ok(!/\^\s*b\[i\]|\^=\s/.test(src) && src.includes('safeEqual'), `${f} compares through safeEqual`);
}

// ── sign out everywhere: a cookie older than the viewer's stored generation is refused ──
ok(!session.sessionRevoked(undefined, undefined), 'no generation anywhere still works');
ok(!session.sessionRevoked(undefined, 0) && !session.sessionRevoked(2, '2') && !session.sessionRevoked(3, 2), 'a current or newer cookie works');
ok(session.sessionRevoked(undefined, 1) && session.sessionRevoked(1, '2'), 'an older cookie, or one with no generation, is refused after a bump');
{
  const g0 = await session.currentSessionGen('gen-check');
  ok(g0 === 0, 'a viewer never bumped is at generation 0');
  await session.bumpSessionGen('gen-check');
  const g1 = await session.currentSessionGen('gen-check');
  ok(g1 === 1 && session.sessionRevoked(g0, g1), 'a bump raises the generation and revokes a cookie stamped before it');
}

console.log('signing keys: all checks passed');
