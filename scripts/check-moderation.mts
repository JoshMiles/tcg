// Checks the one moderation rule (canModerate, ROADMAP 47.2): the pure rule for every actor / target pair, then the real
// lookups and two actions that call it (cancelling an offer, reversing a trade). Needs the mock KV; refuses anything non-local.
// Run: npx tsx scripts/check-moderation.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
process.env.SESSION_SECRET = 'a-test-secret-that-is-long-enough-123';
delete process.env.SUPER_ADMIN_TWITCH_IDS;

const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const core = await import('../lib/staff-core');
const { canModerate } = core;
const SUPER = { login: 'joshmiles', role: 'super' as const };
const ADMIN = { login: 'ann', role: 'admin' as const };
const MOD = { login: 'sam', role: 'mod' as const };
const allowed = (a: core.ModActor, t: core.ModTarget, act: core.ModAction = 'flags') => canModerate(a, t, act).ok;

// ── the pure rule ──
ok(allowed(MOD, { login: 'viewer' }), 'a mod may moderate a plain viewer');
ok(allowed(ADMIN, { login: 'viewer' }) && allowed(SUPER, { login: 'viewer' }), 'admins and the super admin may too');
ok(!allowed({ login: 'x', role: null }, { login: 'viewer' }) && !allowed({ login: 'x', role: undefined }, { login: 'viewer' }), 'a non-staff actor may not');
for (const a of [MOD, ADMIN, SUPER]) ok(!allowed(a, { login: a.login }) && !allowed(a, { login: a.login.toUpperCase() }), `${a.role} may not moderate themselves`);
ok(allowed({ login: 'password', role: 'super', via: 'password' }, { login: 'password' }), 'the emergency login is not an account, so a viewer with that name is not "themselves"');
ok(!allowed(MOD, { login: 'other', role: 'mod' }) && !allowed(MOD, { login: 'ann', role: 'admin' }) && !allowed(MOD, { login: 'joshmiles', role: 'super' }), 'a mod may not moderate any staff');
ok(allowed(ADMIN, { login: 'other', role: 'mod' }), 'an admin may moderate a mod');
ok(!allowed(ADMIN, { login: 'ann2', role: 'admin' }) && !allowed(ADMIN, { login: 'joshmiles', role: 'super' }), 'an admin may not moderate another admin or the super admin');
ok(allowed(SUPER, { login: 'ann', role: 'admin' }) && allowed(SUPER, { login: 'other', role: 'mod' }), 'the super admin may moderate admins and mods');
ok(!allowed(SUPER, { login: 'other', role: 'super' }), 'nobody moderates the super admin');
ok(!allowed(MOD, { login: 'cheesygidds' }) && !allowed(ADMIN, { login: 'cheesygidds' }) && allowed(SUPER, { login: 'cheesygidds' }), 'the streamer is out of reach except for the super admin, staff or not');
ok(!allowed(MOD, { login: 'viewer', flagsByRole: 'admin' }, 'flags') && !allowed(MOD, { login: 'viewer', flagsByRole: 'super' }, 'block-trading'), 'a mod may not change restrictions an admin set');
ok(allowed(MOD, { login: 'viewer', flagsByRole: 'mod' }, 'flags') && allowed(MOD, { login: 'viewer', flagsByRole: null }, 'flags'), 'a mod may change restrictions a mod or nobody set');
ok(allowed(MOD, { login: 'viewer', flagsByRole: 'admin' }, 'tags') && allowed(MOD, { login: 'viewer', flagsByRole: 'admin' }, 'cancel-offer'), 'admin-set restrictions only guard the restriction actions');
ok(allowed(ADMIN, { login: 'viewer', flagsByRole: 'super' }, 'flags'), 'an admin may change restrictions the super admin set');
const refusal = canModerate(MOD, { login: 'sam' }, 'tags');
ok(!refusal.ok && refusal.error.length > 0, 'a refusal says why');

// ── the lookups, against the real staff list and profiles ──
const db = await import('../lib/db');
const kvLib = await import('../lib/kv');
const sbx = await import('../lib/sandbox');
const trades = await import('../lib/trades');
const staff = await import('../lib/staff');
const tradeCore = await import('../lib/trade-core');
const { encodeEntry } = await import('../lib/variants');
const E = (n: number) => encodeEntry(n, 'regular');

const u = Date.now().toString(36);
const modA = `moda_${u}`, modB = `modb_${u}`, adm = `adm_${u}`;
ok((await staff.addStaff(SUPER, adm, 'admin')).ok, 'seed: an admin');
ok((await staff.addStaff(SUPER, modA, 'mod')).ok && (await staff.addStaff(SUPER, modB, 'mod')).ok, 'seed: two mods');
const actMod = { login: modA, role: 'mod' as const }, actAdmin = { login: adm, role: 'admin' as const };

await kvLib.seedSeason1();
const box = await sbx.createSandbox({ name: 'Moderation check', source: 'config' });
await db.runInSandbox(box.id, async () => {
  const season = (await kvLib.listSeasons())[0];
  const coll = season.collectionName;
  const serials = await import('../lib/serials');

  const t = await staff.moderationTarget(modB);
  ok(t.role === 'mod' && t.flagsByRole === null, 'a staff member is looked up by their role');
  ok((await staff.moderationTarget('joshmiles')).role === 'super' && (await staff.moderationTarget('plainviewer')).role === null, 'the super admin is found, a viewer has no role');
  ok((await staff.moderationTarget('password')).role === null, 'a viewer named "password" is not the emergency login');
  ok(!(await staff.checkModerate(actMod, [modA], 'tags')).ok && !(await staff.checkModerate(actMod, [modB], 'tags')).ok && !(await staff.checkModerate(actMod, ['plainviewer', adm], 'tags')).ok, 'a mod is refused for themselves, another mod and an admin');
  ok((await staff.checkModerate(actMod, ['plainviewer'], 'tags')).ok, 'a mod is allowed for a viewer');
  ok((await staff.checkModerate(actAdmin, [modB], 'flags')).ok && !(await staff.checkModerate(actAdmin, [adm], 'flags')).ok, 'an admin may act on a mod but not themselves');

  // Restrictions: set by an admin, then a mod tries to clear them (the saveFlagsAction path) and an admin does.
  await kvLib.saveUserProfile({ username: 'flagged', displayName: 'flagged', createdAt: 1, flags: { noTrading: true, reason: 'x', at: 1, by: adm } });
  ok((await staff.moderationTarget('flagged')).flagsByRole === 'admin', 'who set the restrictions is looked up');
  ok(!(await staff.checkModerate(actMod, ['flagged'], 'flags')).ok && !(await staff.checkModerate(actMod, ['flagged'], 'block-trading')).ok, 'a mod may not change an admin-set restriction');
  ok((await staff.checkModerate(actAdmin, ['flagged'], 'flags')).ok, 'an admin may');
  await kvLib.saveUserProfile({ username: 'flagged2', displayName: 'flagged2', createdAt: 1, flags: { noTrading: true, reason: 'x', at: 1, by: 'password' } });
  ok((await staff.moderationTarget('flagged2')).flagsByRole === 'super' && !(await staff.checkModerate(actMod, ['flagged2'], 'flags')).ok, 'restrictions set by the emergency login count as the super admin');

  // Action 1: cancelling an offer. A mod's offer and the streamer's can't be cancelled by a mod; a viewer's can.
  await trades.saveTradeSettings({ ...tradeCore.DEFAULT_TRADE_SETTINGS, cooldownSeconds: 0, maxOpenPerUser: 20 });
  await kvLib.saveCollection(coll, { [modB]: [E(3), E(3)], vic: [E(4), E(4)], ha: [E(5)], hb: [E(6)], [modA]: [E(7), E(7)], hc: [E(8)] });
  await serials.backfillSerials(coll, await kvLib.getCollection(coll));
  const sk = (cardNumber: number) => ({ cardNumber, variant: 'regular' as const, count: 1 });
  const offer = async (from: string, give: number, get: number) => {
    const o = await trades.createTrade({ seasonId: season.id, from, kind: 'listing', give: [sk(give)], get: [sk(get)] });
    if (!o.ok) throw new Error('offer failed: ' + o.error);
    return o.trade.id;
  };
  const isOpen = async (id: string) => (await trades.listOpenTrades()).some(x => x.id === id);
  const modsOffer = await offer(modB, 3, 9);
  const viewersOffer = await offer('vic', 4, 9);
  const refused = await trades.cancelTrade(modsOffer, 'admin', { admin: true, reason: 'x', actor: actMod });
  ok(!refused.ok && refused.status === 403 && await isOpen(modsOffer), "a mod can't cancel another mod's offer, and it stays open with its escrow");
  const okCancel = await trades.cancelTrade(viewersOffer, 'admin', { admin: true, reason: 'x', actor: actMod });
  ok(okCancel.ok && !(await isOpen(viewersOffer)), "a mod can cancel a viewer's offer");
  const byAdmin = await trades.cancelTrade(modsOffer, 'admin', { admin: true, reason: 'x', actor: actAdmin });
  ok(byAdmin.ok && !(await isOpen(modsOffer)), "an admin can cancel a mod's offer");
  const own = await offer(modA, 7, 9);
  ok(!(await trades.cancelTrade(own, 'admin', { admin: true, actor: actMod })).ok && await isOpen(own), 'staff cannot cancel their own offer through the staff path');

  // Action 2: reversing a trade. Not by someone who was in it, nor when a mod was in it; fine between two viewers.
  const swap = async (a: string, b: string, g: number, w: number) => {
    const o = await trades.createTrade({ seasonId: season.id, from: a, kind: 'direct', to: b, give: [sk(g)], get: [sk(w)] });
    if (!o.ok) throw new Error('offer failed: ' + o.error);
    const acc = await trades.acceptTrade(o.trade.id, b);
    if (!acc.ok) throw new Error('accept failed: ' + acc.error);
    return acc.trade;
  };
  const mine = await swap(modA, 'hc', 7, 8);
  const r1 = await trades.reverseTrade(mine.id, actMod, 'mine');
  ok(!r1.ok && r1.status === 403, 'a mod cannot reverse a trade they were in');
  const withMod = await swap('ha', modB, 5, 3);
  const r2 = await trades.reverseTrade(withMod.id, actMod, 'other mod');
  ok(!r2.ok && r2.status === 403, 'a mod cannot reverse a trade another mod was in');
  ok((await trades.reverseTrade(withMod.id, actAdmin, 'admin does')).ok, 'an admin can reverse a trade a mod was in');
  const plain = await swap('ha', 'hb', 5, 6);
  ok((await trades.reverseTrade(plain.id, actMod, 'viewers')).ok, 'a mod can reverse a trade between two viewers');
  const adminsTrade = await swap('hb', 'hc', 6, 7);
  const adminSelf = await trades.reverseTrade(adminsTrade.id, { login: 'hb', role: 'admin' }, 'self');
  ok(!adminSelf.ok && adminSelf.status === 403, 'an admin cannot reverse a trade they were in either');
});
await sbx.deleteSandbox(box.id);
console.log('moderation checks passed');
