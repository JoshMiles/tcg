// Trainer card buffs and Buff Editor checks (ROADMAP 30.1):
// - Pure duration maths (hours, streams, season, pulls)
// - Stacking rules (refresh vs reject, MAX_BUFFS cap of 20)
// - Community buff stored once at `buffs:community` (not copied onto every user) and per-viewer pull tracking
// - Clamping caps (1..10 magnitude, 1..8760 hours, 1..30 streams, 1..100 pulls)
// - Delete refusal when a trainer card or achievement references the buff
// - Trainer cards forcing `upgradesEnabled: false` and never rolling a non-regular variant
// Needs the mock KV (npm run check starts it); refuses anything non-local. Run: npx tsx scripts/check-buffs.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';

const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const eq = (a: unknown, b: unknown, msg: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);

const core = await import('../lib/buffs-core');
const buffsStore = await import('../lib/buffs');
const kvLib = await import('../lib/kv');
const { kv } = await import('../lib/db');
const variants = await import('../lib/variants');
const draw = await import('../lib/draw');
const packCore = await import('../lib/pack-editor-core');
const { streamKey } = await import('../lib/mixitup-core');

// ── 1. Caps & validation ──────────────────────────────────
const clampedHigh = core.cleanBuffDefInput({
  id: 'b1', name: 'Big Pulls', type: 'extra-pulls', magnitude: 999,
  duration: { unit: 'hours', n: 99999 }, stack: 'refresh', scope: 'self',
});
ok(clampedHigh.ok && clampedHigh.def.magnitude === 10 && clampedHigh.def.duration.n === 8760, 'magnitude clamped to 10 and hours to 8760');

const clampedLow = core.cleanBuffDefInput({
  id: 'b2', name: 'Small Streams', type: 'extra-pack', magnitude: -5,
  duration: { unit: 'streams', n: 0 }, stack: 'reject', scope: 'community',
});
ok(clampedLow.ok && clampedLow.def.magnitude === 1 && clampedLow.def.duration.n === 1, 'magnitude and streams clamped to min 1');

const clampedStreamsMax = core.cleanBuffDefInput({
  id: 'b3', name: 'Many Streams', type: 'extra-pulls', magnitude: 5,
  duration: { unit: 'streams', n: 99 }, stack: 'refresh', scope: 'self',
});
ok(clampedStreamsMax.ok && clampedStreamsMax.def.duration.n === 30, 'streams clamped to 30');

const clampedPullsMax = core.cleanBuffDefInput({
  id: 'b4', name: 'Many Pulls', type: 'extra-pulls', magnitude: 3,
  duration: { unit: 'pulls', n: 500 }, stack: 'refresh', scope: 'self',
});
ok(clampedPullsMax.ok && clampedPullsMax.def.duration.n === 100, 'pulls clamped to 100');

const achBuff = core.cleanBuffDefInput({
  id: 'b5', name: 'Grant Master', type: 'grant-achievement', magnitude: 9,
  duration: { unit: 'hours', n: 10 }, stack: 'refresh', scope: 'community', achievementId: 'master',
});
ok(achBuff.ok && achBuff.def.scope === 'self' && achBuff.def.achievementId === 'master', 'grant-achievement forces scope self');

const badAch = core.cleanBuffDefInput({
  id: 'b6', name: 'Bad Ach', type: 'grant-achievement', achievementId: 'not-a-real-kind',
});
ok(!badAch.ok, 'unknown achievement kind is rejected');

const noName = core.cleanBuffDefInput({ id: 'b7', name: '   ', type: 'extra-pulls' });
ok(!noName.ok, 'blank name is rejected');

// ── 2. Duration maths (hours, streams, season, pulls) ─────
const now = 1_700_000_000_000;

// Hours
const hoursDef: import('../lib/buffs-core').BuffDef = {
  id: 'dur-h', name: 'Two Hours', type: 'extra-pulls', magnitude: 2,
  duration: { unit: 'hours', n: 2 }, stack: 'refresh', scope: 'self',
};
const activeH = core.createActiveBuff(hoursDef, { id: 'a1', now, source: 'card:1' })!;
eq(activeH.until, now + 2 * 3_600_000, 'hours duration sets until timestamp');
ok(core.isBuffActiveFor(activeH, { now: now + 3_600_000 }), 'active before until');
ok(!core.isBuffActiveFor(activeH, { now: now + 2 * 3_600_000 }), 'expired at until');

// Streams (via streamKey)
const streamsDef: import('../lib/buffs-core').BuffDef = {
  id: 'dur-s', name: 'Two Streams', type: 'extra-pulls', magnitude: 3,
  duration: { unit: 'streams', n: 2 }, stack: 'refresh', scope: 'self',
};
const sk1 = streamKey(1000, now);
const sk2 = streamKey(2000, now);
const sk3 = streamKey(3000, now);
let activeS = core.createActiveBuff(streamsDef, { id: 'a2', now, streamKey: sk1, source: 'card:2' })!;
activeS = core.stepActiveBuff(activeS, { now, streamKey: sk1 })!;
ok(activeS && activeS.streamKeys?.length === 1, 'same stream key counts as 1 stream');
activeS = core.stepActiveBuff(activeS, { now, streamKey: sk2 })!;
ok(activeS && activeS.streamKeys?.length === 2, 'second stream key is within 2-stream cap');
const expiredS = core.stepActiveBuff(activeS, { now, streamKey: sk3 });
ok(expiredS === null, 'third stream key drops a 2-stream buff when read');

// Season
const seasonDef: import('../lib/buffs-core').BuffDef = {
  id: 'dur-season', name: 'Season Long', type: 'extra-pulls', magnitude: 1,
  duration: { unit: 'season' }, stack: 'refresh', scope: 'self',
};
const activeSeason = core.createActiveBuff(seasonDef, { id: 'a3', now, seasonId: 's1', source: 'card:3' })!;
ok(core.isBuffActiveFor(activeSeason, { now, seasonId: 's1' }), 'active while season matches');
ok(!core.isBuffActiveFor(activeSeason, { now, seasonId: 's2' }), 'expired when active season changes');

// Pulls (personal)
const pullsDef: import('../lib/buffs-core').BuffDef = {
  id: 'dur-p', name: 'Two Pulls', type: 'extra-pulls', magnitude: 2,
  duration: { unit: 'pulls', n: 2 }, stack: 'refresh', scope: 'self',
};
const activeP = core.createActiveBuff(pullsDef, { id: 'a4', now, source: 'card:4' })!;
let pList = [activeP];
pList = core.consumeBuffPull(pList, { now, username: 'alice' }).buffs;
eq(pList[0]?.pullsLeft, 1, 'first pull decrements pullsLeft to 1');
pList = core.consumeBuffPull(pList, { now, username: 'alice' }).buffs;
eq(pList.length, 0, 'second pull finishes the 2-pull buff and removes it');

// ── 3. Stacking rules (`refresh` vs `reject`, MAX_BUFFS = 20) ──
const refreshDef: import('../lib/buffs-core').BuffDef = {
  id: 'stack-ref', name: 'Refreshable', type: 'extra-pulls', magnitude: 3,
  duration: { unit: 'hours', n: 2 }, stack: 'refresh', scope: 'self',
};
const r1 = core.applyBuffToList([], refreshDef, { id: 'i1', now, source: 'card:10' });
ok(r1.ok && !r1.refreshed && r1.buffs.length === 1, 'first application adds the buff');
const later = now + 3_600_000;
const r2 = core.applyBuffToList(r1.buffs, refreshDef, { id: 'i2', now: later, source: 'card:10' });
ok(r2.ok && r2.refreshed && r2.buffs.length === 1, 'refresh keeps a single entry');
eq(r2.ok ? r2.buffs[0].magnitude : 0, 3, 'refresh does not double the magnitude');
eq(r2.ok ? r2.buffs[0].until : 0, later + 2 * 3_600_000, 'refresh moves expiry out');

const rejectDef: import('../lib/buffs-core').BuffDef = {
  ...refreshDef, id: 'stack-rej', stack: 'reject',
};
const j1 = core.applyBuffToList([], rejectDef, { id: 'j1', now, source: 'card:11' });
ok(j1.ok, 'first reject-mode buff applies');
const j2 = core.applyBuffToList(j1.buffs, rejectDef, { id: 'j2', now: later, source: 'card:11' });
ok(!j2.ok && j2.reason === 'already_active', 'reject refuses while that buff is still active');
const j3 = core.applyBuffToList(j1.buffs, rejectDef, { id: 'j3', now: now + 3 * 3_600_000, source: 'card:11' });
ok(j3.ok, 'reject allows re-applying after the previous one expired');

// Two different buffs both apply, up to MAX_BUFFS (20)
let many: import('../lib/buffs-core').ActiveBuff[] = [];
for (let i = 0; i < core.MAX_BUFFS; i++) {
  const d: import('../lib/buffs-core').BuffDef = { ...refreshDef, id: `b-${i}`, name: `Buff ${i}`, magnitude: 1 };
  const res = core.applyBuffToList(many, d, { id: `inst-${i}`, now, source: `card:${i}` });
  ok(res.ok, `buff ${i + 1} of ${core.MAX_BUFFS} applies`);
  if (res.ok) many = res.buffs;
}
eq(many.length, 20, '20 distinct buffs active');
const overflow = core.applyBuffToList(many, { ...refreshDef, id: 'b-overflow', name: 'Overflow' }, { id: 'inst-over', now, source: 'card:99' });
ok(!overflow.ok && overflow.reason === 'max_buffs', '21st distinct buff is refused at MAX_BUFFS');

// ── 4. Community buffs: stored once at `buffs:community`, per-viewer pull tracking ──
const commPullsDef: import('../lib/buffs-core').BuffDef = {
  id: 'comm-pulls', name: 'Town Party', type: 'extra-pulls', magnitude: 2,
  duration: { unit: 'pulls', n: 2 }, stack: 'refresh', scope: 'community',
};
const cApplied = core.applyBuffToList([], commPullsDef, { id: 'c1', now, source: 'card:50' });
ok(cApplied.ok, 'community buff created');
await buffsStore.saveCommunityBuffs(cApplied.ok ? cApplied.buffs : []);

const storedComm = await kv.get<unknown[]>('buffs:community');
ok(Array.isArray(storedComm) && storedComm.length === 1, 'community buff is stored once at buffs:community');
ok((await kv.get('user:alice:pulllimit')) === null && (await kv.get('user:bob:pulllimit')) === null, 'community buff is never copied onto user keys');

let commList = await buffsStore.getCommunityBuffs();
eq(core.totalExtraPullsFromBuffs([], commList, { now, username: 'alice' }), 2, 'alice gets +2 extra pulls from community buff');
eq(core.totalExtraPullsFromBuffs([], commList, { now, username: 'bob' }), 2, 'bob also gets +2 extra pulls from the same community buff');

// Alice uses 2 pulls; Bob has used 0
commList = core.consumeBuffPull(commList, { now, username: 'alice' }).buffs;
commList = core.consumeBuffPull(commList, { now, username: 'alice' }).buffs;
eq(core.totalExtraPullsFromBuffs([], commList, { now, username: 'alice' }), 0, 'alice exhausted her 2 pulls on the community buff');
eq(core.totalExtraPullsFromBuffs([], commList, { now, username: 'bob' }), 2, 'bob still has his 2 pulls on the community buff');

// ── 5. KV CRUD & delete refusal when referenced by a card or achievement ──
await buffsStore.upsertBuffDef(hoursDef);
await buffsStore.upsertBuffDef(commPullsDef);
eq((await buffsStore.getBuffDefs()).length, 2, 'saved two buff definitions');

const pack = {
  id: 'p-train', name: 'Trainer Pack', coverImageUrl: '', active: true, status: 'published' as const,
  weight: 1, accentColor: '', tearBorderColor: '', holoMinStars: 5, cardTime: 3, cooldownTime: 1, soundVolume: 1,
  createdAt: 1, upgradesEnabled: true, variantWeights: variants.DEFAULT_VARIANT_WEIGHTS, upgradeCosts: variants.DEFAULT_UPGRADE_COSTS,
};
await kvLib.savePack(pack as never);
await kvLib.savePackCards('p-train', [
  { id: 'tc1', number: 1, name: 'Coach Brie', imageUrl: '/a/1.png', probability: 10, stars: 3, kind: 'trainer', buffId: 'dur-h', upgradesEnabled: true },
]);

const refusedByCard = await buffsStore.deleteBuffDef('dur-h');
ok(!refusedByCard.ok && refusedByCard.message.includes('Coach Brie'), 'delete is refused while a trainer card references the buff');

await kv.set('achievements:settings', { master: { on: true, title: '', detail: '', buffId: 'comm-pulls' } });
const refusedByAch = await buffsStore.deleteBuffDef('comm-pulls');
ok(!refusedByAch.ok && refusedByAch.message.includes('Master set'), 'delete is refused while an achievement references the buff');

// Once unlinked, deletion succeeds
await kvLib.savePackCards('p-train', [
  { id: 'tc1', number: 1, name: 'Coach Brie', imageUrl: '/a/1.png', probability: 10, stars: 3, kind: 'collector' },
]);
const delOk = await buffsStore.deleteBuffDef('dur-h');
ok(delOk.ok && (await buffsStore.getBuffDefs()).length === 1, 'delete succeeds once no card or achievement references the buff');

// ── 6. Trainer card forces upgrades off and never rolls non-regular variants ──
await kvLib.savePackCards('p-train', [
  { id: 'tc1', number: 1, name: 'Coach Brie', imageUrl: '/a/1.png', probability: 10, stars: 3, kind: 'trainer', buffId: 'comm-pulls', upgradesEnabled: true },
]);
const loadedTrainer = (await kvLib.getPackCards('p-train'))[0];
ok(loadedTrainer.kind === 'trainer' && loadedTrainer.upgradesEnabled === false, 'normalizeCard forces upgradesEnabled: false on trainer cards');
ok(!variants.upgradesAllowed(pack, loadedTrainer), 'upgradesAllowed is false for trainer cards even when pack has upgradesEnabled');
eq(variants.allowedVariants(pack, loadedTrainer), ['regular'], 'allowedVariants returns only regular for trainer cards');
eq(variants.upgradeStep(pack, loadedTrainer, 'regular'), null, 'upgradeStep returns null for trainer cards');

// Pack editor cleanCard also forces upgradesEnabled: false on trainer cards
const applied = packCore.applyChanges(pack as never, [], {
  pack: {},
  add: [packCore.newWorkCard('w-tr', { name: 'Gym Leader', imageUrl: '/a/2.png', stars: 4, probability: 5, kind: 'trainer', buffId: 'comm-pulls', upgradesEnabled: true })],
  update: {},
  remove: [],
});
eq(applied.problems.length, 0, 'valid trainer card has no problems');
ok(applied.cards[0].kind === 'trainer' && applied.cards[0].upgradesEnabled === false && applied.cards[0].buffId === 'comm-pulls', 'applyChanges stores kind: trainer, buffId, and forces upgradesEnabled: false');

const missingBuff = packCore.applyChanges(pack as never, [], {
  pack: {},
  add: [packCore.newWorkCard('w-bad', { name: 'No Buff Trainer', imageUrl: '/a/3.png', stars: 2, probability: 5, kind: 'trainer', buffId: '' })],
  update: {},
  remove: [],
});
ok(missingBuff.problems.length === 1 && missingBuff.problems[0].messages.some(m => m.includes('Choose a buff')), 'trainer card without a buffId reports a problem');

// rollDraw never rolls a non-regular variant for a trainer card even when Regular weight is 0 and Shiny weight is 100
const shinyOnlyPack = {
  ...pack,
  upgradesEnabled: true,
  variantWeights: { regular: 0, reverse: 50, full: 50, shiny: 100 },
};
for (let i = 0; i < 30; i++) {
  const rolled = draw.rollDraw([{ pack: shinyOnlyPack as never, cards: [loadedTrainer] }], () => 0.99);
  ok(rolled && rolled.variant === 'regular', 'rollDraw always returns regular for a trainer card');
}

// ── 7. ROADMAP 30.2: Use trainer card (consume, buff, audit, activity) ──
const sId = 's-train-test';
const cName = 'train_test';
await kvLib.saveSeason({
  id: sId, name: 'Trainer Season', collectionName: cName, active: true,
  packIds: ['p-train'], startDate: '2026-01-01', endDate: '2026-12-31',
} as never);

// Add trainer cards:
// Card 10: Extra Pack Credit buff ('t-pk')
const extraPkDef: import('../lib/buffs-core').BuffDef = {
  id: 't-pk', name: 'Pack Surge', type: 'extra-pack', magnitude: 1,
  duration: { unit: 'streams', n: 1 }, stack: 'refresh', scope: 'self',
};
await buffsStore.upsertBuffDef(extraPkDef);

// Card 11: Reject stack buff ('t-rej')
const rejectTrainerDef: import('../lib/buffs-core').BuffDef = {
  id: 't-rej', name: 'Reject Shield', type: 'extra-pulls', magnitude: 1,
  duration: { unit: 'hours', n: 5 }, stack: 'reject', scope: 'self',
};
await buffsStore.upsertBuffDef(rejectTrainerDef);

// Card 12: Pulls-duration buff ('t-pulls')
const pullsTrainerDef: import('../lib/buffs-core').BuffDef = {
  id: 't-pulls', name: 'Two Extra Pulls', type: 'extra-pulls', magnitude: 2,
  duration: { unit: 'pulls', n: 2 }, stack: 'refresh', scope: 'self',
};
await buffsStore.upsertBuffDef(pullsTrainerDef);

await kvLib.savePackCards('p-train', [
  { id: 'c10', number: 10, name: 'Pack Surge Card', imageUrl: '/a/10.png', probability: 5, stars: 3, kind: 'trainer', buffId: 't-pk' },
  { id: 'c11', number: 11, name: 'Reject Shield Card', imageUrl: '/a/11.png', probability: 5, stars: 3, kind: 'trainer', buffId: 't-rej' },
  { id: 'c12', number: 12, name: 'Pulls Card', imageUrl: '/a/12.png', probability: 5, stars: 3, kind: 'trainer', buffId: 't-pulls' },
]);

// 1. Cannot use if viewer holds 0 copies
const noCopies = await buffsStore.useTrainerCard('dan', 10, sId);
ok(!noCopies.ok && noCopies.error.includes('do not hold a Regular copy'), 'refused when viewer holds no copy');

// 2. Set up alice with 2 regular copies of card 10
await kvLib.saveCollection(cName, { alice: [variants.encodeEntry(10, 'regular'), variants.encodeEntry(10, 'regular')] });
const ser = await import('../lib/serials');
await ser.backfillSerials(cName, await kvLib.getCollection(cName));
ok(await ser.isTracking(cName), 'tracking enabled for season');

// 3. Favourite 1 copy: only 1 spendable
const aliceCopies = await ser.getOwnerCopies(cName, 'alice');
eq(aliceCopies.length, 2, 'alice has 2 copies');
const userSettings = await import('../lib/user-settings-store');
const favsMod = await import('../lib/favourites');
const curSettings = await userSettings.getUserSettings('alice');
await userSettings.saveUserSettings('alice', { ...curSettings, favourites: [aliceCopies[0].uid!] });
const favs = await favsMod.favouriteIdsOf(cName, 'alice');
ok(favs.has(aliceCopies[0].id), 'copy 0 is favourite');

// If both were favourited, useTrainerCard would fail
await userSettings.saveUserSettings('alice', { ...curSettings, favourites: [aliceCopies[0].uid!, aliceCopies[1].uid!] });
const allFav = await buffsStore.useTrainerCard('alice', 10, sId);
ok(!allFav.ok && allFav.error.includes('favourite'), 'refused when all copies are favourited');

// Leave only copy 0 favourited so copy 1 is spendable
await userSettings.saveUserSettings('alice', { ...curSettings, favourites: [aliceCopies[0].uid!] });

// 4. Use trainer card: consumes 1 copy, applies buff
const usedRes = await buffsStore.useTrainerCard('alice', 10, sId);
ok(usedRes.ok && usedRes.message.includes('Pack Surge is now active'), 'useTrainerCard succeeds');

const aliceCollAfter = await kvLib.getCollection(cName);
eq(aliceCollAfter.alice.length, 1, '1 copy consumed from collection');
const aliceCopiesAfter = await ser.getOwnerCopies(cName, 'alice');
eq(aliceCopiesAfter.length, 1, '1 copy remains in ledger');
ok(aliceCopiesAfter[0].id === aliceCopies[0].id, 'favourited copy was preserved, non-favourite consumed');

// Check extra-pack credit is active
ok(await buffsStore.hasExtraPackCredit('alice'), 'alice has extra pack credit');

// 5. reservePaidPull bypasses limits and fee when viewer has credit
const mixSettings = { enabled: true, cost: 50, pullLimitPerStream: 1, command: '!pack' };
const paidRes = await (await import('../lib/mixitup')).reservePaidPull(mixSettings, 'alice', 'pay-test-1');
ok(paidRes.ok, 'reservePaidPull succeeds for viewer with credit');
const claimed = await (await import('../lib/mixitup')).claimPaidPull('pay-test-1', 'alice');
ok(claimed && claimed.amount === 0 && claimed.credit === true, 'credit pull is 0 cost with credit: true');

// 6. consumePullOnSave consumes credit
await buffsStore.consumePullOnSave('alice', { wasCredit: true, seasonId: sId });
ok(!(await buffsStore.hasExtraPackCredit('alice')), 'credit consumed on save');

// 7. Reject stack trainer card
await kvLib.addCollectionEntryWithSerial(cName, 'alice', variants.encodeEntry(11, 'regular'), 'pull');
await kvLib.addCollectionEntryWithSerial(cName, 'alice', variants.encodeEntry(11, 'regular'), 'pull');
const useRej1 = await buffsStore.useTrainerCard('alice', 11, sId);
ok(useRej1.ok, 'first use of reject buff succeeds');
const useRej2 = await buffsStore.useTrainerCard('alice', 11, sId);
ok(!useRej2.ok && useRej2.error.includes('already active'), 'second use of reject buff refused while active');

// 8. Pulls-duration buff decremented on save
await kvLib.addCollectionEntryWithSerial(cName, 'alice', variants.encodeEntry(12, 'regular'), 'pull');
const usePulls = await buffsStore.useTrainerCard('alice', 12, sId);
ok(usePulls.ok, 'use pulls-duration trainer card succeeds');
let uBuffs = await buffsStore.getUserBuffs('alice');
eq(uBuffs.find(b => b.buffId === 't-pulls')?.pullsLeft, 2, 'pullsLeft starts at 2');
await buffsStore.consumePullOnSave('alice', { seasonId: sId });
uBuffs = await buffsStore.getUserBuffs('alice');
eq(uBuffs.find(b => b.buffId === 't-pulls')?.pullsLeft, 1, 'pullsLeft decremented to 1 on pull save');
await buffsStore.consumePullOnSave('alice', { seasonId: sId });
uBuffs = await buffsStore.getUserBuffs('alice');
ok(!uBuffs.some(b => b.buffId === 't-pulls'), 'pulls-duration buff finished and removed after 2 pulls');

// 9. Activity recorded with type: 'buff'
const act = await (await import('../lib/activity')).getActivity({ limit: 10 });
const buffAct = act.events.find(a => a.type === 'buff' && a.username === 'alice' && a.cardNumber === 12);
ok(buffAct && buffAct.cardName === 'Pulls Card' && buffAct.buffName === 'Two Extra Pulls', 'buff activity recorded correctly');

// 10. Audit log recorded
const audits = await (await import('../lib/audit')).getUserAudit('alice', 10);
ok(audits.some(a => a.action === 'Trainer card used' && a.detail?.includes('Pack Surge Card')), 'audit recorded for trainer card use');

// ── 8. ROADMAP 32.1: credits are spent, held per queued pull, and extra pulls count ──
await buffsStore.saveCommunityBuffs([]); // section 3 left a community +2 pulls buff behind
const mixitup = await import('../lib/mixitup');
const { normalizeMixItUp } = await import('../lib/mixitup-core');
const fakeMix: typeof fetch = async () => new Response(JSON.stringify({ balance: 100000 }), { status: 200 });
const mix = normalizeMixItUp({ enabled: true, balanceUrl: 'https://hook.example/mix', cost: 10, limit: 1, secret: 's' });
const limitOf1 = { ...mix, limit: 1, roleLimits: { regular: 1, subscriber: 1, vip: 1, moderator: 1, broadcaster: 1 } };

// A season-scoped credit is stored with the season id (sId), which differs from the collection name (cName).
ok(sId !== cName, 'the season id and its collection name differ in this check');
await buffsStore.upsertBuffDef({ id: 't-season', name: 'Season Pack', type: 'extra-pack', magnitude: 1, duration: { unit: 'season' }, stack: 'refresh', scope: 'self' });
ok((await buffsStore.applyBuff('erin', 't-season', { seasonId: sId })).ok, 'season-scoped credit applied');
ok(await buffsStore.hasExtraPackCredit('erin', { seasonId: sId }), 'credit is live in its own season');
ok(!(await buffsStore.hasExtraPackCredit('erin', { seasonId: 'another-season' })), 'credit is not live in another season');
await buffsStore.consumePullOnSave('erin', { wasCredit: true, seasonId: sId });
ok(!(await buffsStore.hasExtraPackCredit('erin', { seasonId: sId })), 'a season-scoped credit is spent by the save, not kept forever');

// Two pulls queued before either is saved share one credit: only one gets it.
ok((await buffsStore.applyBuff('frank', 't-pk', { seasonId: sId })).ok, 'frank holds one credit');
const reserved = await Promise.all(['par-1', 'par-2'].map(id => mixitup.reservePaidPull(limitOf1, 'frank', id, fakeMix)));
const claims = await Promise.all(['par-1', 'par-2'].map(id => mixitup.claimPaidPull(id, 'frank')));
eq(claims.filter(c => c?.credit).length, 1, 'two pulls reserved in parallel take only one credit');
eq(reserved.filter(r => r.ok).length, 2, 'the other pull is a normal paid pull');
await buffsStore.consumePullOnSave('frank', { wasCredit: true, seasonId: sId });
ok(!(await buffsStore.hasExtraPackCredit('frank', { seasonId: sId })), 'frank spent his credit');

// A reservation that is released hands the credit back.
ok((await buffsStore.applyBuff('gwen', 't-pk', { seasonId: sId })).ok, 'gwen holds one credit');
ok((await mixitup.reservePaidPull(limitOf1, 'gwen', 'rel-1', fakeMix)).ok, 'gwen reserves with her credit');
await mixitup.releasePaidPull('rel-1');
ok(await buffsStore.reserveExtraPackCredit('gwen', { seasonId: sId }), 'releasing the reservation gave the credit back');

// An extra-pulls buff raises the limit.
ok((await mixitup.reservePaidPull(limitOf1, 'hank', 'xp-1', fakeMix)).ok, 'hank is under a limit of 1');
ok(!(await mixitup.reservePaidPull(limitOf1, 'hank', 'xp-2', fakeMix)).ok, 'hank is stopped at 1');
await buffsStore.upsertBuffDef({ id: 't-xp', name: 'Two More', type: 'extra-pulls', magnitude: 2, duration: { unit: 'hours', n: 5 }, stack: 'refresh', scope: 'self' });
ok((await buffsStore.applyBuff('hank', 't-xp', { seasonId: sId })).ok, 'hank gets +2 pulls');
ok((await mixitup.reservePaidPull(limitOf1, 'hank', 'xp-3', fakeMix)).ok && (await mixitup.reservePaidPull(limitOf1, 'hank', 'xp-4', fakeMix)).ok, 'the buff lets hank pull twice more');
ok(!(await mixitup.reservePaidPull(limitOf1, 'hank', 'xp-5', fakeMix)).ok, 'and no further than 1 + 2');

// Buff lists written in parallel do not lose updates.
await Promise.all(['t-rej', 't-xp'].map(id => buffsStore.applyBuff('ivy', id, { seasonId: sId })));
eq((await buffsStore.getUserBuffs('ivy')).length, 2, 'two buffs applied at once are both kept');

// ── 9. Buff types: rarity-boost, score-bonus, currency-grant ──
// Earlier sections leave a community +2 pulls buff in KV: clear the list so the checks below start from nothing.
await buffsStore.saveCommunityBuffs([]);
const mk = (type: 'rarity-boost' | 'extra-pulls', magnitude: number, id: string) =>
  core.createActiveBuff({ id: 'x', name: id, type, magnitude, duration: { unit: 'season' }, stack: 'refresh', scope: 'self' }, { id, now: 1, seasonId: sId, source: 't' })!;
eq(core.rarityBoostFactor([mk('rarity-boost', 5, 'a'), mk('extra-pulls', 9, 'b')], [], { now: 1, seasonId: sId, username: 'x' }), 1.5, 'rarity boost: +10% per point, other buff types ignored');
eq(core.rarityBoostFactor([], [], { now: 1, username: 'x' }), 1, 'no boost is a factor of 1');
eq([core.boostedWeight(10, 2, 2), core.boostedWeight(10, 3, 2)], [10, 20], 'only 3+ star cards gain weight');
{
  const cards = [{ number: 1, stars: 1, probability: 50 }, { number: 2, stars: 3, probability: 50 }] as never[];
  const pk = [{ pack: { id: 'bp', weight: 1 } as never, cards }];
  const seq = (...v: number[]) => { let i = 0; return () => v[i++] ?? 0; };
  eq(draw.rollDraw(pk, seq(0, 0.4))!.card.number, 1, 'without a boost 0.4 lands on the common card');
  eq(draw.rollDraw(pk, seq(0, 0.4), 2)!.card.number, 2, 'a x2 boost moves the same roll to the 3 star card');
}
// the editor input is clamped and instant types ignore duration and stack
const inst = core.cleanBuffDefInput({ name: 'Pts', type: 'score-bonus', points: 999999, duration: { unit: 'hours', n: 5 }, stack: 'reject', scope: 'community' }, 'i1');
ok(inst.ok && inst.def.points === 10000 && inst.def.duration.unit === 'season' && inst.def.stack === 'refresh' && inst.def.scope === 'community', 'score-bonus: points clamped, duration and stack fixed');
const instLow = core.cleanBuffDefInput({ name: 'Pts', type: 'currency-grant', points: 0 }, 'i2');
ok(instLow.ok && instLow.def.points === 1, 'currency-grant: points clamped to at least 1');

// rarity-boost through the store: applied, and its pulls duration is spent per saved pull
await buffsStore.upsertBuffDef({ id: 't-rb', name: 'Lucky', type: 'rarity-boost', magnitude: 3, duration: { unit: 'pulls', n: 1 }, stack: 'refresh', scope: 'self' });
ok((await buffsStore.applyBuff('rita', 't-rb', { seasonId: sId })).ok, 'rarity-boost applied');
eq(await buffsStore.rarityBoostFor('rita'), 1.3, 'rita draws with a x1.3 boost');
await buffsStore.consumePullOnSave('rita', { seasonId: sId });
eq(await buffsStore.rarityBoostFor('rita'), 1, 'the boost ends with its pull');

// score-bonus: self and community, shown on the leaderboard, kept by a recompute
const lb = await import('../lib/leaderboard');
const sb = await import('../lib/score-bonus');
await kvLib.saveCollection(cName, { ...(await kvLib.getCollection(cName)), sam: [variants.encodeEntry(10, 'regular')], nobody: [] });
const season = (await kvLib.getSeason(sId))!;
const rowOf = async (u: string) => (await lb.getSeasonLeaderboard(season)).rows.find(r => r.username === u);
const before = (await rowOf('sam'))!;
await buffsStore.upsertBuffDef({ id: 't-sb', name: 'Plus 100', type: 'score-bonus', magnitude: 1, duration: { unit: 'season' }, stack: 'refresh', scope: 'self', points: 100 });
ok((await buffsStore.applyBuff('sam', 't-sb', { seasonId: sId })).ok, 'score-bonus applied to self');
const after = (await rowOf('sam'))!;
eq([after.score - before.score, after.bonusPoints], [100, 100], 'the leaderboard row gains the 100 points');
ok((await buffsStore.applyBuff('sam', 't-sb', { seasonId: sId })).ok, 'a score-bonus can be applied again');
eq((await rowOf('sam'))!.bonusPoints, 200, 'bonuses add up');
eq((await buffsStore.getUserBuffs('sam')).length, 0, 'a score-bonus stores no active buff');
await buffsStore.upsertBuffDef({ id: 't-sbc', name: 'Plus 10 all', type: 'score-bonus', magnitude: 1, duration: { unit: 'season' }, stack: 'refresh', scope: 'community', points: 10 });
ok((await buffsStore.applyBuff('sam', 't-sbc', { seasonId: sId })).ok, 'community score-bonus applied');
const bonuses = await sb.getScoreBonuses(cName);
eq([bonuses.sam, bonuses.alice, bonuses.nobody], [210, 10, undefined], 'every current-season player with cards gets it, empty collections do not');
ok(!(await buffsStore.applyBuff('sam', 't-sbc', { seasonId: sId, disallowCommunity: true })).ok, 'community score-bonus is refused where community is not allowed');

// currency-grant: needs Mix It Up on with an add address
await buffsStore.upsertBuffDef({ id: 't-cg', name: 'Bucks', type: 'currency-grant', magnitude: 1, duration: { unit: 'season' }, stack: 'refresh', scope: 'self', points: 50 });
const noMix = await buffsStore.applyBuff('sam', 't-cg', { seasonId: sId });
ok(!noMix.ok && noMix.reason === 'mixitup_off', 'currency-grant fails clearly while Mix It Up is off');
await mixitup.saveMixItUpSettings(normalizeMixItUp({ enabled: true, balanceUrl: 'https://hook.example/mix', addUrl: 'https://hook.example/add', secret: 's' }));
ok((await buffsStore.applyBuff('sam', 't-cg', { seasonId: sId, dryRun: true })).ok, 'currency-grant passes the dry run once an add address is saved');
{
  let sent: Record<string, unknown> | null = null;
  const addFetch: typeof fetch = async (_u, init) => { sent = JSON.parse(String(init?.body)); return new Response('{"ok":true}', { status: 200 }); };
  const s = await mixitup.getMixItUpSettings();
  eq((await mixitup.grantCurrency(s, 'sam', 50, addFetch)).applied, true, 'the add address is called');
  eq([sent!.action, sent!.username, sent!.amount, sent!.secret], ['add', 'sam', 50, 's'], 'the add request carries action, username, amount and secret');
  const refuse: typeof fetch = async () => new Response('{"ok":false}', { status: 200 });
  eq((await mixitup.grantCurrency(s, 'sam', 50, refuse)).applied, false, 'a refusal from Mix It Up is a failure');
}
eq(normalizeMixItUp({ addUrl: ' https://a.example/x ' }).addUrl, 'https://a.example/x', 'addUrl is kept by the normalizer');
await buffsStore.saveCommunityBuffs([]);

console.log('trainer buff checks passed');

