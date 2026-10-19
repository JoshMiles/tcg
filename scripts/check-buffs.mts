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

console.log('trainer buff checks passed');
