// Checks staff roles: who counts as super admin, role resolution, who may manage whom, the signed staff cookie and the staff list.
// Needs the mock KV (node scripts/mock-kv.cjs) with KV_REST_API_URL / KV_REST_API_TOKEN pointing at it.
// Run: npx tsx scripts/check-staff.mts
process.env.KV_REST_API_URL ||= 'http://localhost:4111';
process.env.KV_REST_API_TOKEN ||= 'dev';
process.env.KV_URL ||= 'redis://dev';
process.env.SESSION_SECRET = 'a-test-secret-that-is-long-enough-123';
delete process.env.SUPER_ADMIN_TWITCH_IDS;

const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const core = await import('../lib/staff-core');
const tok = await import('../lib/staff-token');
const adminToken = await import('../lib/admin-token');

// ── the super admin is the owner, by Twitch ID ──
ok(core.SUPER_ADMINS.some(s => s.login === 'joshmiles'), 'joshmiles is a super admin');
const JOSH = core.SUPER_ADMINS.find(s => s.login === 'joshmiles')!.twitchId;
ok(core.isSuperAdmin({ twitchId: JOSH }), 'the owner\'s Twitch ID is the super admin');
ok(!core.isSuperAdmin({ twitchId: '1' }) && !core.isSuperAdmin({}) && !core.isSuperAdmin({ twitchId: null }), 'other accounts are not');
ok(core.resolveRole({ login: 'joshmiles', twitchId: JOSH }, null) === 'super', 'joshmiles is super with no staff record at all');
ok(core.resolveRole({ login: 'joshmiles', twitchId: '999' }, null) === null, 'the login name alone gives nothing (someone who took the name later is not super)');
ok(core.resolveRole({ login: 'renamed', twitchId: JOSH }, null) === 'super', 'the ID still counts if the account is renamed');
ok(core.isSuperAdmin({ twitchId: '777' }, { SUPER_ADMIN_TWITCH_IDS: '555, 777' }) && !core.isSuperAdmin({ twitchId: '778' }, { SUPER_ADMIN_TWITCH_IDS: '555, 777' }), 'extra super admin IDs come from the environment');
ok(!core.isSuperAdmin({ twitchId: 'abc' }, { SUPER_ADMIN_TWITCH_IDS: 'abc' }), 'a junk ID in the environment is ignored');

// ── role resolution from the staff list ──
const rec = (over: Partial<import('../lib/staff-core').StaffRecord> = {}) => ({ login: 'sam', role: 'mod' as const, addedBy: 'x', addedAt: 1, ...over });
ok(core.resolveRole({ login: 'sam', twitchId: '5' }, rec()) === 'mod', 'a listed mod (not yet bound to an ID)');
ok(core.resolveRole({ login: 'SAM', twitchId: '5' }, rec()) === 'mod', 'logins match regardless of case');
ok(core.resolveRole({ login: 'sam', twitchId: '5' }, rec({ twitchId: '5' })) === 'mod', 'bound and matching ID');
ok(core.resolveRole({ login: 'sam', twitchId: '6' }, rec({ twitchId: '5' })) === null, 'bound to another ID: a re-claimed name gets nothing');
ok(core.resolveRole({ login: 'other', twitchId: '5' }, rec()) === null, 'a record only matches its own login');
ok(core.resolveRole({ login: 'sam', twitchId: '5' }, null) === null, 'not on the list');
ok(core.resolveRole({ login: 'sam', twitchId: '5' }, rec({ role: 'admin' })) === 'admin', 'an admin');

// ── what each role may do ──
ok(core.roleCan('super', 'admin') && core.roleCan('super', 'mod') && core.roleCan('super', 'staff:admins') && core.roleCan('super', 'staff:mods'), 'super can do everything');
ok(core.roleCan('admin', 'admin') && core.roleCan('admin', 'mod') && core.roleCan('admin', 'staff:mods') && !core.roleCan('admin', 'staff:admins'), 'an admin cannot manage admins');
ok(core.roleCan('mod', 'mod') && !core.roleCan('mod', 'admin') && !core.roleCan('mod', 'staff:mods') && !core.roleCan('mod', 'staff:admins'), 'a mod only reaches the mod panel');
ok(!core.roleCan(null, 'mod') && !core.roleCan(undefined, 'admin'), 'no role, no access');
ok(core.canManage('super', 'admin') && core.canManage('super', 'mod'), 'super manages admins and mods');
ok(!core.canManage('super', 'super'), 'nobody manages the super admin');
ok(core.canManage('admin', 'mod') && !core.canManage('admin', 'admin') && !core.canManage('admin', 'super'), 'an admin manages only mods');
ok(!core.canManage('mod', 'mod') && !core.canManage(null, 'mod'), 'mods and strangers manage nobody');

// ── names, destinations ──
ok(core.cleanLogin(' @Sam_99 ') === 'sam_99' && core.cleanLogin('ab') === null && core.cleanLogin('has space') === null && core.cleanLogin('x'.repeat(26)) === null && core.cleanLogin(5) === null, 'Twitch logins');
ok(core.homePath('mod') === '/mod' && core.homePath('admin') === '/admin' && core.homePath('super') === '/admin', 'where each role lands');
ok(core.staffReturnTo('/admin/users', 'admin') === '/admin/users' && core.staffReturnTo('/admin/users', 'mod') === '/mod', 'a mod is never sent to an admin page');
ok(core.staffReturnTo('/mod/trades', 'mod') === '/mod/trades' && core.staffReturnTo('/mod/trades', 'admin') === '/mod/trades', 'mod pages are open to everyone on staff');
ok(core.staffReturnTo('//evil.com', 'admin') === '/admin' && core.staffReturnTo('https://evil.com', 'admin') === '/admin' && core.staffReturnTo('/account', 'admin') === '/admin' && core.staffReturnTo(null, 'mod') === '/mod' && core.staffReturnTo('/admin\nx', 'admin') === '/admin', 'only panel paths are allowed as a destination');
ok(core.sanitizeStaffRecord({ login: 'Sam', role: 'god' }) === null && core.sanitizeStaffRecord({ login: 'sam', role: 'super' }) === null && core.sanitizeStaffRecord('x') === null, 'a stored record can never be super or have an unknown role');
ok(core.sanitizeStaffRecord({ login: 'sam', role: 'mod', twitchId: 'nope', addedBy: 'a', addedAt: 3 })?.twitchId === undefined, 'a junk Twitch ID is dropped');

// ── the signed cookie ──
const t = await tok.signStaffToken({ u: 'sam', id: '5', dn: 'Sam', role: 'mod' }, 1_000_000_000_000);
ok(t && t.split('.').length === 2, 'a token is signed');
const back = await tok.verifyStaffToken(t!, 1_000_000_000_000 + 1000);
ok(back?.u === 'sam' && back.id === '5' && back.role === 'mod', 'it verifies and carries the identity');
ok(await tok.verifyStaffToken(t!, 1_000_000_000_000 + (tok.STAFF_TTL_S + 5) * 1000) === null, 'it expires after an hour');
// sliding renewal and the 12-hour cap
const T0 = 1_000_000_000_000;
ok(back?.iat === Math.floor(T0 / 1000), 'a token records when it was first issued');
ok(!tok.shouldRenewStaffToken(back!, T0 + 10 * 60_000), 'not renewed with 50 minutes left');
ok(tok.shouldRenewStaffToken(back!, T0 + 31 * 60_000), 'renewed with under 30 minutes left');
const renewed = await tok.renewStaffToken(back!, 'admin', T0 + 40 * 60_000);
const rb = await tok.verifyStaffToken(renewed!, T0 + 40 * 60_000);
ok(rb?.role === 'admin' && rb.iat === back!.iat && rb.exp > back!.exp, 'a renewal takes the live role, keeps iat and extends exp');
ok(await tok.renewStaffToken(back!, 'mod', T0 + 5 * 60_000) === null, 'no renewal when not due');
const issuedAt = T0 + 11 * 3600_000; // first issued at T0, last renewed an hour before the cap
const late = await tok.signStaffToken({ u: 'sam', id: '5', dn: 'Sam', role: 'mod', iat: Math.floor(T0 / 1000) }, issuedAt);
const lateT = await tok.verifyStaffToken(late!, issuedAt);
ok(lateT && tok.shouldRenewStaffToken(lateT, issuedAt + 40 * 60_000), 'still renewed just inside 12 hours');
ok(!tok.shouldRenewStaffToken(lateT!, T0 + 12 * 3600_000 + 1000), 'never renewed after 12 hours since the first issue');
const [payload, sig] = t!.split('.');
const forged = Buffer.from(JSON.stringify({ u: 'sam', id: '5', dn: 'Sam', role: 'super', exp: 9_999_999_999 })).toString('base64url');
ok(await tok.verifyStaffToken(`${forged}.${sig}`, 1_000_000_000_000) === null, 'a forged role is rejected');
ok(await tok.verifyStaffToken(`${payload}.${sig.slice(0, -2)}xx`, 1_000_000_000_000) === null, 'a changed signature is rejected');
ok(await tok.verifyStaffToken(undefined) === null && await tok.verifyStaffToken('garbage') === null && await tok.verifyStaffToken('a.b.c') === null && await tok.verifyStaffToken('.') === null, 'junk is rejected');
ok(await tok.verifyStaffToken(t!, 1_000_000_000_000, { SESSION_SECRET: 'a-different-secret-that-is-long-1' }) === null, 'a different secret is rejected');
ok(await tok.signStaffToken({ u: 'sam', id: '5', dn: 'Sam', role: 'mod' }, Date.now(), { SESSION_SECRET: 'short' }) === null, 'no token is made without a proper secret');
const roleless = await tok.signStaffToken({ u: 'sam', id: '5', dn: 'Sam', role: 'root' as never }, 1_000_000_000_000);
ok(await tok.verifyStaffToken(roleless!, 1_000_000_000_000) === null, 'a token with an unknown role is rejected');

// ── the emergency password switch ──
ok(adminToken.isPasswordLoginEnabled({}) && adminToken.isPasswordLoginEnabled({ ADMIN_PASSWORD_LOGIN: 'on' }), 'password login is on by default');
ok(['off', 'OFF', 'false', '0', 'no', ' off '].every(v => !adminToken.isPasswordLoginEnabled({ ADMIN_PASSWORD_LOGIN: v })), 'and can be switched off');

// ── the staff list ──
const staff = await import('../lib/staff');
const SUPER = { login: 'joshmiles', role: 'super' as const };
const ADMIN = { login: 'ann', role: 'admin' as const };
const MOD = { login: 'sam', role: 'mod' as const };
const unique = Date.now().toString(36);
const mod1 = `mod_${unique}`, mod2 = `modb_${unique}`, adm1 = `adm_${unique}`;

ok(!(await staff.addStaff(MOD, mod1, 'mod')).ok, 'a mod cannot add staff');
ok((await staff.addStaff(ADMIN, mod1, 'mod')).ok, 'an admin can add a mod');
ok(!(await staff.addStaff(ADMIN, adm1, 'admin')).ok && (await staff.getStaffRecord(adm1)) === null, 'an admin cannot add an admin');
ok((await staff.addStaff(SUPER, adm1, 'admin')).ok, 'the super admin can add an admin');
ok(!(await staff.addStaff(SUPER, mod1, 'mod')).ok, 'adding someone twice is refused');
ok(!(await staff.addStaff(SUPER, 'joshmiles', 'admin')).ok, 'the super admin cannot be added as staff');
ok(!(await staff.addStaff(SUPER, 'no', 'mod')).ok && !(await staff.addStaff(SUPER, mod2, 'root' as never)).ok, 'bad names and roles are refused');
const m1 = await staff.getStaffRecord(mod1);
ok(m1?.role === 'mod' && m1.addedBy === 'ann' && !m1.twitchId, 'the record notes who added it (no ID yet: they have not played)');

// Role changes and removal obey the same rules.
ok(!(await staff.setStaffRole(ADMIN, mod1, 'admin')).ok && (await staff.getStaffRecord(mod1))?.role === 'mod', 'an admin cannot promote a mod to admin');
ok(!(await staff.setStaffRole(ADMIN, adm1, 'mod')).ok && (await staff.getStaffRecord(adm1))?.role === 'admin', 'an admin cannot demote an admin');
ok(!(await staff.removeStaff(ADMIN, adm1)).ok && (await staff.getStaffRecord(adm1)) !== null, 'an admin cannot remove an admin');
ok(!(await staff.setStaffRole(MOD, mod1, 'mod')).ok && !(await staff.removeStaff(MOD, mod1)).ok, 'a mod cannot change or remove anyone');
ok((await staff.setStaffRole(SUPER, mod1, 'admin')).ok && (await staff.getStaffRecord(mod1))?.role === 'admin', 'the super admin can promote');
ok((await staff.setStaffRole(SUPER, mod1, 'mod')).ok && (await staff.getStaffRecord(mod1))?.role === 'mod', 'and demote');
ok(!(await staff.setStaffRole(SUPER, 'nobody_here', 'mod')).ok && !(await staff.removeStaff(SUPER, 'nobody_here')).ok, 'unknown people cannot be changed or removed');

// First sign-in binds the account's Twitch ID, once.
await staff.touchStaffLogin(mod1, '4242', 'Mod One');
const bound = await staff.getStaffRecord(mod1);
ok(bound?.twitchId === '4242' && bound.displayName === 'Mod One' && !!bound.lastLogin, 'the first sign-in binds the Twitch ID and notes the time');
await staff.touchStaffLogin(mod1, '9999', 'Impostor');
ok((await staff.getStaffRecord(mod1))?.twitchId === '4242', 'a different account signing in as that name does not rebind it');
ok(core.resolveRole({ login: mod1, twitchId: '9999' }, await staff.getStaffRecord(mod1)) === null && core.resolveRole({ login: mod1, twitchId: '4242' }, await staff.getStaffRecord(mod1)) === 'mod', 'so only the real account gets the role');

// Listing, log and removal.
const list = await staff.listStaff();
ok(list.some(r => r.login === mod1) && list.some(r => r.login === adm1), 'both are listed');
ok(list.findIndex(r => r.login === adm1) < list.findIndex(r => r.login === mod1), 'admins are listed before mods');
ok((await staff.removeStaff(ADMIN, mod1)).ok && (await staff.getStaffRecord(mod1)) === null, 'an admin can remove a mod');
ok((await staff.removeStaff(SUPER, adm1)).ok && (await staff.getStaffRecord(adm1)) === null, 'the super admin can remove an admin');
const log = await staff.getStaffLog(50);
ok(log.some(l => l.action === 'added' && l.login === mod1 && l.by === 'ann') && log.some(l => l.action === 'removed' && l.login === adm1 && l.by === 'joshmiles') && log.some(l => l.action === 'role' && l.login === mod1), 'every change is logged with who made it');
ok(staff.listSuperAdmins().some(s => s.login === 'joshmiles'), 'the super admin is shown');

// ── what staff did is attributed ──
{
  const act = await import('../lib/activity');
  const view = await import('../lib/activity-view');
  const ev = (e: object) => e as import('../lib/activity').NewActivity;
  ok(act.isStaffAction(ev({ type: 'grant', source: 'admin', username: 'a', cardNumber: 1 })), 'an admin grant is a staff action');
  ok(!act.isStaffAction(ev({ type: 'grant', source: 'webhook', username: 'a', cardNumber: 1 })), 'a webhook grant is not');
  ok(act.isStaffAction(ev({ type: 'remove', username: 'a', cardNumber: 1 })) && act.isStaffAction(ev({ type: 'reset', scope: 'season', username: 'a' })) && act.isStaffAction(ev({ type: 'delete', username: 'a' })), 'removals, resets and deletes are');
  ok(act.isStaffAction(ev({ type: 'trigger', kind: 'pull', source: 'admin', username: 'a' })) && !act.isStaffAction(ev({ type: 'trigger', kind: 'pull', source: 'webhook', username: 'a' })), 'a gifted pack is, a webhook trigger is not');
  ok(act.isStaffAction(ev({ type: 'trade', action: 'cancelled', by: 'admin', kind: 'direct', give: [], get: [], givePts: 0, getPts: 0, username: 'a' })), 'an admin cancel of an offer is');
  ok(!act.isStaffAction(ev({ type: 'trade', action: 'cancelled', by: 'a', kind: 'direct', give: [], get: [], givePts: 0, getPts: 0, username: 'a' })), 'a viewer withdrawing their own offer is not');
  ok(!act.isStaffAction(ev({ type: 'pull', username: 'a', cardNumber: 1, cardName: 'x', stars: 1, packName: 'p', isNew: true, copies: 1, uniqueOwned: 1 })) && !act.isStaffAction(ev({ type: 'upgrade', username: 'a', cardNumber: 1, cardName: 'x', from: 'regular', to: 'reverse', cost: 5 })), 'a viewer\'s own pull or upgrade never is, even if the viewer is staff');
  const base = { seq: 1, at: 1, username: 'viewer1', type: 'remove', cardNumber: 7 };
  const noStaff = view.plainText(base as never, () => 'Cheese');
  const withStaff = view.plainText({ ...base, staff: 'sam' } as never, () => 'Cheese');
  ok(!noStaff.includes('(by') && withStaff === `${noStaff} (by sam)`, 'the sentence names the staff member');
}

console.log('staff checks passed');
