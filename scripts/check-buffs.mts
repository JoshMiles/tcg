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

console.log('trainer buff checks passed');

