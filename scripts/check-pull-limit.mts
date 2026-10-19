// Pull limits kept with each viewer (ROADMAP 12.4): their own base limit, temporary bonuses, and the paid-pull check using them.
// Mock KV: node scripts/mock-kv.cjs. Run: npx tsx scripts/check-pull-limit.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const c = await import('../lib/pull-limit-core');
const store = await import('../lib/pull-limit');
const mix = await import('../lib/mixitup');
const mc = await import('../lib/mixitup-core');

// ── Pure ──
const none = c.normalizePullLimit(null);
ok(none.limit === null && none.buffs.length === 0, 'nothing stored: follow the default, no bonuses');
ok(c.effectiveLimit(3, none).limit === 3 && !c.effectiveLimit(3, none).custom, 'the default applies');
const own = c.withBase(none, '5');
ok(c.effectiveLimit(3, own).limit === 5 && c.effectiveLimit(3, own).custom, "a viewer's own limit wins over the default");
ok(c.effectiveLimit(3, c.withBase(own, '0')).limit === 0, '0 means no limit');
ok(c.effectiveLimit(3, c.withBase(own, '')).limit === 3, 'empty goes back to the default');
const NOW = Date.UTC(2026, 9, 16, 12);
const b1 = c.withBuff(none, { id: 'a', amount: 2, hours: 3, source: 'card:x' }, NOW)!;
ok(c.effectiveLimit(3, b1, NOW).limit === 5 && c.effectiveLimit(3, b1, NOW).bonus === 2, 'a bonus adds to the base');
ok(c.effectiveLimit(3, b1, NOW + 3 * 3600_000 - 1).limit === 5 && c.effectiveLimit(3, b1, NOW + 3 * 3600_000).limit === 3, 'a bonus ends when its time is up');
const b2 = c.withBuff(b1, { id: 'b', amount: 1 }, NOW)!;
ok(c.effectiveLimit(3, b2, NOW).limit === 6 && b2.buffs[1].until === null, 'a bonus with no hours lasts until removed, and bonuses stack');
ok(c.effectiveLimit(0, b2, NOW).limit === 0 && c.effectiveLimit(3, c.withBase(b2, 0), NOW).limit === 0, 'no limit stays no limit whatever the bonuses');
ok(c.withBuff(none, { id: 'z', amount: 0 }) === null && c.withBuff(none, { id: 'z', amount: 'x' }) === null && c.withBuff(none, { id: 'z', amount: 1, hours: 'x' }) === null, 'unusable bonuses are refused');
ok(c.effectiveLimit(3, c.withoutBuff(b2, 'a'), NOW).limit === 4, 'a bonus can be removed');
ok(c.withBuff(c.withBuff(none, { id: 'p', amount: 1, hours: 1 }, NOW)!, { id: 'q', amount: 1 }, NOW + 2 * 3600_000)!.buffs.length === 1, 'ended bonuses are dropped when a new one is added');
ok(c.normalizePullLimit({ limit: 'x', buffs: [{ id: 'k', amount: -3 }, { amount: 2 }, { id: 'ok', amount: 2.9, until: 'soon' }] }).buffs.length === 1, 'junk is dropped on read');

// ── Stored with the viewer ──
await store.setUserBaseLimit('Ann', 4);
ok((await store.getUserPullLimit('ann')).limit === 4, 'the limit is stored under the viewer, whatever the case');
ok((await store.getUserPullLimit('bob')).limit === null, 'other viewers are untouched');
const added = await store.addUserPullBuff('ann', { amount: 2, hours: 1, note: 'buff card' });
ok(added && added.buffs.length === 1 && added.buffs[0].source === 'admin', 'a bonus is stored with the viewer');
ok((await store.addUserPullBuff('ann', { amount: 0 })) === null, 'a bad bonus is refused');
await store.removeUserPullBuff('ann', added!.buffs[0].id);
ok((await store.getUserPullLimit('ann')).buffs.length === 0, 'and removed');
await store.setUserBaseLimit('ann', null);
ok((await store.getUserPullLimit('ann')).limit === null, 'clearing everything leaves the default');

// ── The paid pull uses it ──
const fake: typeof fetch = async (_u, init) => new Response(JSON.stringify({ balance: 100000 }), { status: 200 });
const s = mc.normalizeMixItUp({ enabled: true, balanceUrl: 'https://hook.example/mix', cost: 10, limit: 2 });
const r = (u: string, id: string) => mix.reservePaidPull(s, u, id, fake);
ok((await r('cy', 'c1')).ok && (await r('cy', 'c2')).ok && !(await r('cy', 'c3')).ok, 'the default limit of 2 applies to a viewer with nothing set');
await store.setUserBaseLimit('di', 1);
ok((await r('di', 'd1')).ok && !(await r('di', 'd2')).ok, "a viewer's own limit of 1 is enforced");
const refused = await r('di', 'd3');
ok(!refused.ok && refused.reason === 'limit_reached' && /all 1 pulls/.test(refused.message), 'and the message names their limit');
await store.setUserBaseLimit('ed', 0);
ok((await r('ed', 'e1')).ok && (await r('ed', 'e2')).ok && (await r('ed', 'e3')).ok, 'a viewer with no limit pulls freely');
await store.addUserPullBuff('cy', { amount: 1, hours: 2 });
ok((await r('cy', 'c4')).ok && !(await r('cy', 'c5')).ok, 'a bonus gives a viewer one more pull this stream');
ok((await mix.pullsUsedThisStream('cy')) === 3, 'the admin page can show how many were used');

// ── Roles and the this-stream bonus (ROADMAP 28.1) ──
const fresh = mc.normalizeMixItUp(null);
ok(mc.PULL_ROLES.every(role => fresh.roleLimits[role] === 0), 'every role starts at no limit');
ok(mc.normalizeMixItUp({ limit: 4 }).roleLimits.moderator === 4, 'a missing role uses the old single limit');
const partial = mc.normalizeMixItUp({ limit: 4, roleLimits: { subscriber: 1 } });
ok(partial.roleLimits.subscriber === 1 && partial.roleLimits.regular === 4, 'a saved role stays, and the others fall back');
ok(mc.pullRole('VIP', 'alice') === 'vip' && mc.pullRole('founder', 'alice') === 'regular' && mc.pullRole(undefined, 'alice') === 'regular', 'an unknown or missing role counts as regular');
ok(mc.pullRole('subscriber', 'Cheesygidds') === 'broadcaster', 'the channel login is always the broadcaster');
const buffOn = { amount: 2, streamKey: 's1', by: 'a', at: 1 };
ok(c.streamBuffAmount(buffOn, 's1') === 2 && c.streamBuffAmount(buffOn, 's2') === 0 && c.streamBuffAmount(null, 's1') === 0, 'a stream bonus counts only while its stream key matches');
ok(c.effectiveLimit(2, none, NOW, 3).limit === 5 && c.effectiveLimit(0, none, NOW, 3).limit === 0 && c.effectiveLimit(2, c.withBase(none, 0), NOW, 3).limit === 0, 'a stream bonus adds on top, and a limit of 0 stays unlimited');

const roles = mc.normalizeMixItUp({
  enabled: true, balanceUrl: 'https://hook.example/mix', cost: 10, limit: 9,
  roleLimits: { regular: 2, subscriber: 1, vip: 0, moderator: 4, broadcaster: 0 },
});
const pull = (u: string, id: string, role?: string) => mix.reservePaidPull(roles, u, id, fake, role);
ok((await pull('reg', 'rg1')).ok && (await pull('reg', 'rg2')).ok && !(await pull('reg', 'rg3')).ok, 'a missing role uses the regular limit');
ok((await pull('sub', 'sb1', 'subscriber')).ok && !(await pull('sub', 'sb2', 'subscriber')).ok, 'a subscriber uses the subscriber limit');
ok((await pull('vip', 'vp1', 'vip')).ok && (await pull('vip', 'vp2', 'vip')).ok && (await pull('vip', 'vp3', 'vip')).ok, 'a role set to 0 has no limit');
ok((await pull('mod', 'md1', 'moderator')).ok && (await pull('mod', 'md2', 'moderator')).ok && (await pull('mod', 'md3', 'moderator')).ok && (await pull('mod', 'md4', 'moderator')).ok && !(await pull('mod', 'md5', 'moderator')).ok, 'a moderator stops at 4');
ok((await pull('cheesygidds', 'bc1', 'subscriber')).ok && (await pull('cheesygidds', 'bc2', 'subscriber')).ok, 'the channel login ignores a sent role and uses the broadcaster limit');
ok(mc.pullRole('nope', 'zed') === 'regular' && (await pull('zed', 'zd1', 'nope')).ok && (await pull('zed', 'zd2', 'nope')).ok && !(await pull('zed', 'zd3', 'nope')).ok, 'an unknown role counts as regular');
await store.setUserBaseLimit('sub', 3);
ok((await pull('sub', 'sb3', 'subscriber')).ok && (await pull('sub', 'sb4', 'subscriber')).ok, 'a personal limit replaces the role limit');
await store.addUserPullBuff('reg', { amount: 1, hours: 2 });
ok((await pull('reg', 'rg4')).ok && !(await pull('reg', 'rg5')).ok, 'a personal bonus adds to the role limit');
const stream = await mix.currentStreamKey();
await store.setStreamPullBuff(1, stream, 'password');
ok((await pull('one', 'on1', 'subscriber')).ok && (await pull('one', 'on2', 'subscriber')).ok && !(await pull('one', 'on3', 'subscriber')).ok, 'the stream bonus gives everyone one more pull');
await store.setStreamPullBuff(1, 's-other', 'password');
ok((await pull('two', 'tw1', 'subscriber')).ok && !(await pull('two', 'tw2', 'subscriber')).ok, 'a stream bonus for a different stream is ignored');
ok((await store.setStreamPullBuff(0, stream, 'password')) === null && (await store.getStreamBuff()) === null, '0 clears the stream bonus');

console.log('pull limit checks passed');
