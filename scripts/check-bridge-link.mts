// Sign in to TCG Bridge with Twitch, the site side (ROADMAP 58.0): a link request is single-use and expires, a wrong secret gets nothing, a
// non-staff account is refused, mods get only the mod panel's actions, a role removed on the site revokes at the next guarded call after the
// cache window, and old paired tokens (with the admin's staff switch) still work. Against the mock KV (node scripts/mock-kv.cjs).
// Run: npx tsx scripts/check-bridge-link.mts
import { readFileSync } from 'node:fs';
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
process.env.SESSION_SECRET = 'a-test-secret-that-is-long-enough-123';
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const b = await import('../lib/bridge');
const core = await import('../lib/bridge-core');
const link = await import('../lib/bridge-link');
const staff = await import('../lib/staff');
const bs = await import('../lib/bridge-staff');
const { kv } = await import('../lib/db');
const linkRoute = await import('../app/api/bridge/link/route');
const pollRoute = await import('../app/api/bridge/link/poll/route');

const post = (route: { POST: (r: Request) => Promise<Response> }, path: string, body: unknown) =>
  route.POST(new Request(`http://localhost/api/bridge/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
const guardReq = (token: string) => new Request('http://localhost/api/bridge/staff', { headers: { authorization: `Bearer ${token}` } });
const tokens = async () => Object.keys((await kv.hgetall('bridge:tokens')) ?? {}).length;
const root = { login: 'joshmiles', role: 'super' as const };

// ── A request: shape, secret kept only as a hash ──
const made = (await (await post(linkRoute, 'link', { name: '  Stream PC  ' })).json()) as { id: string; code: string; secret: string; url: string; expiresAt: number };
ok(/^[A-Za-z0-9_-]{22}$/.test(made.id) && /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/.test(made.code) && made.secret.length >= 43, 'id, a 6 character easy-to-read code and a secret');
ok(made.url.endsWith(`/bridge/link?id=${made.id}`) && !made.url.includes(made.secret) && made.expiresAt > Date.now() + 590_000, 'the page address carries only the id; it expires in 10 minutes');
const stored = JSON.stringify(await kv.get(`bridge:link:${made.id}`));
ok(!stored.includes(made.secret) && (await link.readLink(made.id))?.name === 'Stream PC' && (await link.readLink(made.id))?.code === made.code, 'the secret is not stored in the clear; the page can read the name and code');
ok((await link.pollLink(made.id, made.secret)).status === 'pending', 'a fresh request is pending');

// ── A wrong secret gets nothing, and looks like an expired request ──
for (const s of ['nope', '', undefined, 42, made.secret + 'x']) ok((await link.pollLink(made.id, s)).status === 'expired', `a wrong secret (${String(s)}) looks expired`);
ok((await link.pollLink('short', made.secret)).status === 'expired' && (await link.pollLink(undefined, undefined)).status === 'expired', 'a bad id looks expired');
ok((await (await post(pollRoute, 'link/poll', { id: made.id, secret: 'wrong' })).json() as { status: string }).status === 'expired', 'the poll route answers expired for a wrong secret');

// ── Allow: a staff account gets a token, once ──
await staff.addStaff(root, 'cheesymod', 'mod');
await staff.addStaff(root, 'cheesyadmin', 'admin');
const before = await tokens();
ok((await staff.liveRole('joshmiles', '36094918')) === 'super' && (await staff.liveRole('cheesymod', '111')) === 'mod' && (await staff.liveRole('nobody', '9')) === null, 'roles are read live from the staff list');
ok((await link.decideLink(made.id, { userId: '222', login: 'cheesyadmin', role: 'admin' }, true)) === 'allowed', 'a staff account can allow');
ok((await link.decideLink(made.id, { userId: '222', login: 'cheesyadmin', role: 'admin' }, true)) === 'gone' && (await link.decideLink(made.id, { userId: '222', login: 'x', role: 'admin' }, false)) === 'gone', 'a request is decided once');
ok((await link.pollLink(made.id, 'wrong')).status === 'expired' && (await tokens()) === before + 1, 'a wrong secret still gets nothing after the allow');
const got = (await (await post(pollRoute, 'link/poll', { id: made.id, secret: made.secret })).json()) as { status: string; token: string; login: string; role: string };
ok(got.status === 'allowed' && got.login === 'cheesyadmin' && got.role === 'admin' && got.token.length >= 43, 'the app is handed the token, login and role');
ok((await link.pollLink(made.id, made.secret)).status === 'expired', 'the token is handed out once, then the request is gone');
const rec = (await kv.hget<Record<string, unknown>>('bridge:tokens', core.hashToken(got.token)))!;
ok(rec && rec.userId === '222' && rec.login === 'cheesyadmin' && rec.role === 'admin' && rec.name === 'Stream PC' && !JSON.stringify(await kv.hgetall('bridge:tokens')).includes(got.token), 'only the hash is stored, with the account on the record');
const adminToken = got.token;

// ── Expiry, deny, and a non-staff account ──
const old = await link.createLink('Old PC');
await kv.del(`bridge:link:${old.id}`); // what the 10 minute expiry does
ok((await link.pollLink(old.id, old.secret)).status === 'expired' && (await link.decideLink(old.id, { userId: '222', login: 'cheesyadmin', role: 'admin' }, true)) === 'gone' && (await link.readLink(old.id)) === null, 'an expired request cannot be allowed or polled');
const denied = await link.createLink('Denied PC');
ok((await link.decideLink(denied.id, { userId: '222', login: 'cheesyadmin', role: 'admin' }, false)) === 'denied', 'Deny works');
const d = await link.pollLink(denied.id, denied.secret);
ok(d.status === 'denied' && (await link.pollLink(denied.id, denied.secret)).status === 'expired', 'the app hears the denial once');
const stranger = await link.createLink('Viewer PC');
const t0 = await tokens();
ok((await link.decideLink(stranger.id, { userId: '333', login: 'viewer', role: await staff.liveRole('viewer', '333') }, true)) === 'no-role', 'a non-staff account is refused at Allow');
const s = await link.pollLink(stranger.id, stranger.secret);
ok(s.status === 'denied' && s.message === 'This account has no staff role on the TCG site' && (await tokens()) === t0, 'the request is marked denied with the plain message and no token exists');

// ── The role decides what the PC may do ──
const modLink = await link.createLink('Mod PC');
await link.decideLink(modLink.id, { userId: '111', login: 'cheesymod', role: 'mod' }, true);
const modToken = ((await link.pollLink(modLink.id, modLink.secret)) as { token: string }).token;
const pcOf = async (t: string) => (await kv.hget<import('../lib/bridge').BridgeToken>('bridge:tokens', core.hashToken(t)))!;
const adminPc = await pcOf(adminToken); const modPc = await pcOf(modToken);
const src = readFileSync(new URL('../lib/bridge-staff.ts', import.meta.url), 'utf8');
const names = [...src.matchAll(/^\s+case '([a-z-]+)':/gm)].map(m => m[1]);
ok(names.length >= 15 && names.every(n => n in core.STAFF_CAPABILITY), `every staff action and read is in the capability map (${names.filter(n => !(n in core.STAFF_CAPABILITY)).join(', ')})`);
const modMay = ['trading', 'block', 'unblock', 'scene', 'state', 'users', 'activity', 'viewer'];
for (const n of names) {
  ok(core.staffRefusal(adminPc, n) === null && core.staffRefusal({ ...adminPc, role: 'super' }, n) === null, `an admin or the super admin may ${n}`);
  ok((core.staffRefusal(modPc, n) === null) === modMay.includes(n), `a mod ${modMay.includes(n) ? 'may' : 'may not'} ${n}`);
}
ok(core.staffRefusal(modPc, 'something-new') !== null && core.staffRefusal(adminPc, 'something-new') === null, 'an action that is not mapped needs an admin');
const refused = await bs.runStaffAction(modPc, { action: 'gift', username: 'someone', count: 1 });
ok(!refused.ok && /needs an admin/.test(refused.message), 'a mod PC is told plainly that gifting needs an admin');
ok(/cannot do that/.test(String((await bs.runStaffRead(modPc, 'cards', 'x')).error)), 'a mod PC cannot read the admin card search either');
ok((await bs.runStaffRead(adminPc, 'viewer', 'bad name!')).error === 'Type a valid Twitch name (letters, numbers and underscores).', 'an admin PC reaches the read');
ok((await b.bridgeStaffGuard(guardReq(modToken))).ok && (await b.bridgeStaffGuard(guardReq(adminToken))).ok, 'a linked PC has the staff tools from its role, no switch');

// ── The role is re-read at most once a minute; a lost role revokes ──
const age = async (t: string, ms: number) => kv.hset('bridge:tokens', { [core.hashToken(t)]: { ...(await pcOf(t)), roleCheckedAt: Date.now() - ms } });
await staff.setStaffRole(root, 'cheesymod', 'admin');
ok((await b.bridgeGuard(guardReq(modToken))).ok && (await pcOf(modToken)).role === 'mod', 'inside the cache window the role is not re-read');
await age(modToken, 61_000);
const g1 = await b.bridgeGuard(guardReq(modToken));
ok(g1.ok && g1.pc.role === 'admin' && (await pcOf(modToken)).role === 'admin' && core.staffRefusal(g1.pc, 'gift') === null, 'a changed role is saved on the record and applies');
await staff.removeStaff(root, 'cheesymod');
ok((await b.bridgeGuard(guardReq(modToken))).ok, 'a removed role still passes inside the cache window');
await age(modToken, 61_000);
const gone = await b.bridgeGuard(guardReq(modToken));
ok(!gone.ok && gone.response.status === 401 && ((await gone.response.json()) as { error: string }).error === 'Unknown token', 'after the window a removed role gets the same answer as an unlink');
ok((await kv.hget('bridge:tokens', core.hashToken(modToken))) === null && !(await b.bridgeStaffGuard(guardReq(modToken))).ok, 'the token is deleted');
ok(await pcOf(adminToken).then(p => !!p), 'other PCs are untouched');

// ── Old paired tokens still work, with the admin's switch ──
const code = await b.createPairCode('josh');
const paired = (await b.pairBridge(code.code, 'Old PC'))!;
const oldGuard = await b.bridgeGuard(guardReq(paired.token));
ok(oldGuard.ok && oldGuard.pc.userId === undefined && !core.isStaffPc(oldGuard.pc), 'an old paired token works, staff tools off');
const off = await b.bridgeStaffGuard(guardReq(paired.token));
ok(!off.ok && off.response.status === 403, 'its staff tools are off until an admin switches them on');
await b.setBridgeStaff(oldGuard.ok ? oldGuard.pc.id : '', true);
const on = await b.bridgeStaffGuard(guardReq(paired.token));
ok(on.ok && core.staffRefusal(on.pc, 'gift') === null && core.staffRefusal(on.pc, 'backup') === null, 'switched on, it may do every staff action as before');
ok(core.bridgeAccount(on.ok ? on.pc : {}) === '' && core.bridgeAccount(adminPc) === 'cheesyadmin (Admin)', 'the Connection tab shows the account only for a linked PC');

// ── The routes are rate limited ──
let limited = 0;
for (let i = 0; i < 12; i++) if ((await post(linkRoute, 'link', { name: 'x' })).status === 429) limited++;
ok(limited >= 1, 'link requests are rate limited per address');

console.log('bridge link checks passed');
