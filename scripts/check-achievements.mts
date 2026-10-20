// Checks profile achievements: the goals, progress, and that earned goals are remembered. Needs the mock KV for the store part.
// Run: node scripts/mock-kv.cjs & KV_REST_API_URL=http://localhost:4111 KV_REST_API_TOKEN=dev KV_URL=redis://dev npx tsx scripts/check-achievements.mts
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const eq = (a: unknown, b: unknown, msg: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
const a = await import('../lib/achievements');

const none = { regular: 0, reverse: 0, full: 0, shiny: 0, golden: 0 };
const V = (o: Partial<typeof none>) => ({ ...none, ...o });
const R: ('regular' | 'reverse' | 'full' | 'shiny')[] = ['regular', 'reverse', 'full', 'shiny'];
const cards = [
  { number: 1, stars: 1, variants: R }, { number: 2, stars: 1, variants: R }, { number: 3, stars: 3, variants: R }, { number: 4, stars: 5, variants: ['regular' as const] },
];
const season = (counts: [number, Partial<typeof none>][]) => ({ seasonId: 's1', seasonName: 'Season 1', cards, counts: new Map(counts.map(([n, c]) => [n, V(c)])) });
const by = (list: ReturnType<typeof a.evaluateSeason>, id: string) => list.find(x => x.id === `s1:${id}`)!;

// Owns every card once in Regular, plus a Reverse of cards 1 and 2.
const half = a.evaluateSeason(season([[1, { regular: 1, reverse: 1 }], [2, { regular: 2, reverse: 1 }], [3, { regular: 1 }], [4, { regular: 1 }]]));
ok(by(half, 'complete').earned && by(half, 'complete').title === 'Completed Season 1', 'owning one of everything completes the season');
ok(by(half, 'tier-1').earned && by(half, 'tier-3').earned && by(half, 'tier-5').earned, 'every rarity tier is complete');
ok(!half.some(x => x.id === 's1:tier-2' || x.id === 's1:tier-4'), 'a rarity with no cards has no goal');
eq([by(half, 'all-reverse').have, by(half, 'all-reverse').need, by(half, 'all-reverse').earned], [2, 3, false], 'All Reverse Holo counts only cards that can be Reverse (card 4 cannot)');
eq(by(half, 'all-shiny').have, 0, 'no shinies yet');
eq([by(half, 'master').have, by(half, 'master').need], [6, 13], 'master set needs every card in every version it can be pulled in (4+4+4+1 = 13)');
ok(!by(half, 'master').earned, 'not a master set yet');

const partial = a.evaluateSeason(season([[1, { regular: 1 }], [3, { regular: 1 }]]));
ok(!by(partial, 'complete').earned && by(partial, 'complete').have === 2 && by(partial, 'complete').need === 4, 'half way to completing');
ok(by(partial, 'tier-1').have === 1 && !by(partial, 'tier-1').earned, 'one of two Commons');

const noUpgrades = a.evaluateSeason({ seasonId: 's1', seasonName: 'Season 1', cards: cards.map(c => ({ ...c, variants: ['regular' as const] })), counts: new Map() });
ok(!noUpgrades.some(x => x.id.includes('all-') || x.id.includes('master')), 'a season without upgrades has no version goals');

const full = a.evaluateSeason(season(cards.flatMap(c => [[c.number, Object.fromEntries(c.variants.map(v => [v, 1]))] as [number, Partial<typeof none>]])));
ok(by(full, 'master').earned && by(full, 'all-shiny').earned && by(full, 'all-full').earned, 'every version of every card earns the master set');

const switchedOff = a.evaluateSeason(season(cards.flatMap(c => [[c.number, Object.fromEntries(c.variants.map(v => [v, 1]))] as [number, Partial<typeof none>]])), new Set(['complete']));
ok(!switchedOff.some(x => x.id.endsWith(':complete')) && switchedOff.some(x => x.id.endsWith(':master')), 'a switched-off kind is absent from a fresh evaluation');

const settingsLib = await import('../lib/achievement-settings');
const cleaned = settingsLib.normalizeAchievementSettings({
  complete: { on: true, title: '  Hi  ', detail: '' },
  nope: { on: false, title: 'no' },
  master: { on: true, title: '', detail: '' },
  'tier-1': { on: false, title: 'x'.repeat(200), detail: 'y'.repeat(400) },
});
eq(cleaned.complete, { on: true, title: 'Hi', detail: '' }, 'a custom title is kept and trimmed');
ok(!('nope' in cleaned) && !('master' in cleaned), 'unknown kinds and all-default rows are dropped');
ok(cleaned['tier-1'].on === false && cleaned['tier-1'].title.length === 80 && cleaned['tier-1'].detail.length === 200, 'off is kept and text is capped');

const sorted = a.sortAchievements([{ earned: false, have: 1, need: 4 }, { earned: true, have: 2, need: 2, earnedAt: 5 }, { earned: true, have: 3, need: 3, earnedAt: 9 }, { earned: false, have: 3, need: 4 }]);
eq(sorted.map(x => [x.earned, x.have]), [[true, 3], [true, 2], [false, 3], [false, 1]], 'earned first (newest first), then closest to done');

// ── serial milestones (need numbered copies) ──
{
  const { encodeEntry } = await import('../lib/variants');
  const withHeld = (held: [number, number[]][], cutoff = 20) => ({ ...season([]), held: new Map(held), bonusCutoff: cutoff });
  ok(!a.evaluateSeason(season([])).some(x => x.id.includes('first-') || x.id.includes('early')), 'no serial goals until the copies are numbered');
  const none2 = a.evaluateSeason(withHeld([[encodeEntry(1, 'regular'), [7, 9]]]));
  ok(!by(none2, 'first-edition').earned && !by(none2, 'first-shiny').earned && !by(none2, 'five-firsts').earned, 'no edition #1 held: nothing earned');
  ok(by(none2, 'early-bird').earned, 'edition #7 is inside the bonus cutoff of 20: Early bird');
  ok(!by(a.evaluateSeason(withHeld([[encodeEntry(1, 'regular'), [21]]])), 'early-bird').earned, 'edition #21 is not');
  ok(!a.evaluateSeason(withHeld([], 0)).some(x => x.id === 's1:early-bird'), 'no bonus cutoff, no Early bird goal');
  const one = a.evaluateSeason(withHeld([[encodeEntry(2, 'regular'), [1, 4]]]));
  ok(by(one, 'first-edition').earned && !by(one, 'first-shiny').earned, 'holding edition #1 of a Regular is a first edition, not a first shiny');
  eq([by(one, 'five-firsts').have, by(one, 'five-firsts').need], [1, 4], 'five firsts is capped by the number of cards (4 here) and counts different cards');
  const shiny = a.evaluateSeason(withHeld([[encodeEntry(3, 'shiny'), [1]], [encodeEntry(1, 'regular'), [1]], [encodeEntry(2, 'regular'), [1]], [encodeEntry(4, 'regular'), [1]]]));
  ok(by(shiny, 'first-shiny').earned && by(shiny, 'five-firsts').earned && by(shiny, 'first-edition').earned, 'a #1 Shiny and four different firsts');
  ok(a.evaluateSeason({ ...withHeld([[encodeEntry(1, 'regular'), [1]]]), cards: cards.map(c => ({ ...c, variants: ['regular' as const] })) }).every(x => x.id !== 's1:first-shiny'), 'no shiny goal in a season without shinies');
}

// ── the store: a goal, once earned, stays ──
if (!process.env.KV_REST_API_URL?.includes('localhost')) throw new Error('Refusing to run against a non-local KV');
const kvLib = await import('../lib/kv');
const store = await import('../lib/achievements-store');
await kvLib.seedSeason1();
const season1 = (await kvLib.listSeasons())[0];
const nums = (await kvLib.getPackCards((await kvLib.getPacksForSeason(season1))[0].id)).map(c => c.number);
await kvLib.saveCollection(season1.collectionName, { amy: [...nums], ben: [nums[0]] });
const serials = await import('../lib/serials');
await serials.backfillSerials(season1.collectionName, await kvLib.getCollection(season1.collectionName));
const amy = await store.syncAchievements('amy', 1000);
ok(amy.earned.some(x => x.id === `${season1.id}:first-edition`) || amy.earned.some(x => x.id === `${season1.id}:early-bird`), 'numbered copies earn serial milestones (first copies made are #1 / early numbers)');
ok(amy.earned.some(x => x.id === `${season1.id}:complete`), 'owning every card earns the completion achievement');
ok(amy.earned.every(x => x.earnedAt === 1000), 'the first time it is seen earned is remembered');
const ben = await store.syncAchievements('ben');
ok(!ben.earned.some(x => x.id.endsWith(':complete')) && ben.next.some(x => x.id.endsWith(':complete')), 'one card is progress, not earned');
// Amy trades most of her cards away: the achievement stays, with its original date.
await kvLib.saveCollection(season1.collectionName, { amy: [nums[0]], ben: [nums[0]] });
const later = await store.syncAchievements('amy', 9000);
const kept = later.earned.find(x => x.id === `${season1.id}:complete`);
ok(kept && kept.earnedAt === 1000, 'a goal is never taken back, and keeps its date');
ok(later.earned.some(x => x.id.endsWith(':first-edition')), 'a first edition stays earned after the copy is traded away');

await settingsLib.saveAchievementSettings(settingsLib.normalizeAchievementSettings({
  complete: { on: false, title: 'Season finished', detail: 'You finished it.' },
}));
const renamed = await store.syncAchievements('amy', 12000);
const shown = renamed.earned.find(x => x.id === `${season1.id}:complete`);
ok(!!shown && shown.earnedAt === 1000 && shown.title === 'Season finished' && shown.detail === 'You finished it.', 'a stored earned row stays, and the custom words show');
await kvLib.saveCollection(season1.collectionName, { amy: [nums[0]], ben: [...nums] });
const benFull = await store.syncAchievements('ben', 13000);
ok(!benFull.earned.some(x => x.id.endsWith(':complete')), 'a switched-off kind is not newly earned');
ok(!benFull.next.some(x => x.id.endsWith(':complete')), 'a switched-off kind is not listed as next');
await settingsLib.saveAchievementSettings({});
const restored = await store.syncAchievements('amy', 14000);
const back = restored.earned.find(x => x.id === `${season1.id}:complete`);
ok(!!back && back.title.startsWith('Completed ') && back.detail.startsWith('Own at least one') && back.earnedAt === 1000, 'clearing the override brings back the built-in words');

// ── achievement bonuses (ROADMAP 27.5) ──
const withBuffOnly = settingsLib.normalizeAchievementSettings({
  master: { on: true, title: '', detail: '', buffId: 'ach-bonus' },
});
eq(withBuffOnly.master, { on: true, title: '', detail: '', buffId: 'ach-bonus' }, 'row with buffId is kept even if title and detail are empty');

const buffsLib = await import('../lib/buffs');
await buffsLib.saveBuffDefs([
  {
    id: 'ach-bonus',
    name: 'Champion bonus',
    type: 'extra-pulls',
    magnitude: 2,
    duration: { unit: 'hours', n: 48 },
    stack: 'refresh',
    scope: 'self',
  },
]);

await settingsLib.saveAchievementSettings(settingsLib.normalizeAchievementSettings({
  complete: { on: true, title: '', detail: '', buffId: 'ach-bonus' },
}));

const existingColl = await kvLib.getCollection(season1.collectionName);
await kvLib.saveCollection(season1.collectionName, {
  ...existingColl,
  cora: [...nums],
});

const coraBuffsBefore = await buffsLib.getUserBuffs('cora');
eq(coraBuffsBefore.length, 0, 'cora starts with no buffs');

const coraFirst = await store.syncAchievements('cora', 20000);
ok(coraFirst.earned.some(x => x.id === `${season1.id}:complete`), 'cora earns complete');
const coraBuffsAfter = await buffsLib.getUserBuffs('cora');
eq(coraBuffsAfter.length, 1, 'a new earn writes 1 buff');
eq(coraBuffsAfter[0].buffId, 'ach-bonus', 'the written buff matches the achievement bonus');
eq(coraBuffsAfter[0].source, `achievement:${season1.id}:complete`, 'source is achievement:<id>');
eq(coraBuffsAfter[0].magnitude, 2, 'magnitude matches buff definition');

// Second sync does not write another buff (stored achievements are never re-awarded)
await store.syncAchievements('cora', 25000);
const coraBuffsResync = await buffsLib.getUserBuffs('cora');
eq(coraBuffsResync.length, 1, 'second sync does not write another buff');

// A goal stored before the bonus existed (eve earned it with no bonus set) pays out once, on the first sync after, never twice
await settingsLib.saveAchievementSettings({});
await kvLib.saveCollection(season1.collectionName, { ...(await kvLib.getCollection(season1.collectionName)), eve: [...nums] });
await store.syncAchievements('eve', 26000);
await settingsLib.saveAchievementSettings(settingsLib.normalizeAchievementSettings({
  complete: { on: true, title: '', detail: '', buffId: 'ach-bonus' },
}));
eq((await buffsLib.getUserBuffs('eve')).length, 0, 'eve has no buff before a bonus is set');
await store.syncAchievements('eve', 27000);
eq((await buffsLib.getUserBuffs('eve')).length, 1, 'an old stored goal pays its bonus on the first sync');
await store.syncAchievements('eve', 28000);
eq((await buffsLib.getUserBuffs('eve')).length, 1, 'and only once');

// A disabled kind grants nothing new
await settingsLib.saveAchievementSettings(settingsLib.normalizeAchievementSettings({
  complete: { on: false, title: '', detail: '', buffId: 'ach-bonus' },
}));
const collWithDan = await kvLib.getCollection(season1.collectionName);
await kvLib.saveCollection(season1.collectionName, {
  ...collWithDan,
  dan: [...nums],
});
await store.syncAchievements('dan', 30000);
const danBuffs = await buffsLib.getUserBuffs('dan');
eq(danBuffs.length, 0, 'a disabled kind grants nothing new');

// ── Achievement Editor (ROADMAP 33.2) ──
{
  const { kv } = await import('../lib/db');
  // Placeholders
  eq(a.fillText('{season}: {need} of {rarity} {nope}', { season: 'S1', need: 3, rarity: 'Rare' }), 'S1: 3 of Rare {nope}', 'placeholders fill, unknown words stay as typed');
  const live = by(half, 'tier-3');
  eq(a.achVars(live).rarity, live.title.replace('All ', ''), 'the rarity word comes from the kind');
  ok(!!live.title && !live.title.includes('{'), 'built-in text has no placeholders left');
  const early = by(a.evaluateSeason({ ...season([]), held: new Map(), bonusCutoff: 20 }), 'early-bird');
  ok(early.detail.includes('#20 or lower'), 'Early bird fills the cutoff');
  // Default equals blank
  const def = a.defaultText('complete');
  eq(settingsLib.normalizeAchievementSettings({ complete: { on: true, title: def.title, detail: def.detail } }), {}, 'saving the default words stores nothing');
  eq(Object.keys(settingsLib.normalizeAchievementSettings({ complete: { on: true, title: def.title, detail: 'Mine' } }).complete), ['on', 'title', 'detail'], 'one changed field keeps the row');
  await settingsLib.saveAchievementSettings(settingsLib.normalizeAchievementSettings({ complete: { on: true, title: 'Done: {season} ({need})', detail: '' } }));
  const stored = await store.syncAchievements('amy', 40000);
  eq(stored.earned.find(x => x.id.endsWith(':complete'))!.title, 'Done: ' + season1.name + ' (' + nums.length + ')', 'an override on a stored row is filled on the way out');
  await settingsLib.saveAchievementSettings({});

  // Custom rules at N-1 and N
  const g = (type: string, n: number, extra: object = {}) => a.normalizeCustomGoals([{ id: 'g1', title: 'Goal {n} {rarity} {version}', icon: 'star', rule: { type, n, ...extra } }]);
  const ev = (goals: ReturnType<typeof g>, s: ReturnType<typeof season>) => a.evaluateSeason(s, undefined, goals).find(x => x.id === 's1:custom-g1');
  const own3 = season([[1, { regular: 1 }], [2, { regular: 1 }], [3, { regular: 2, shiny: 1 }]]);
  ok(!ev(g('unique', 4), own3)!.earned && ev(g('unique', 3), own3)!.earned, 'unique: 3 different cards earns N=3, not N=4');
  eq(ev(g('unique', 99), own3)!.need, 4, 'N is capped at the qualifying cards');
  ok(!ev(g('editions', 6), own3)!.earned && ev(g('editions', 5), own3)!.earned, 'editions: duplicates count (5 held)');
  ok(!ev(g('rarity', 2, { stars: 1 }), season([[1, { regular: 1 }]]))!.earned && ev(g('rarity', 2, { stars: 1 }), own3)!.earned, 'rarity: two different 1-star cards');
  ok(!ev(g('rarity', 2, { stars: 1 }), own3)!.title.includes('{n}') && ev(g('rarity', 2, { stars: 1 }), own3)!.title.startsWith('Goal 2 '), 'custom text fills placeholders');
  ok(ev(g('rarity', 1, { stars: 2 }), own3) === undefined, 'a rarity with no cards leaves the goal out');
  ok(!ev(g('version', 2, { variant: 'shiny' }), own3)!.earned && ev(g('version', 1, { variant: 'shiny' }), own3)!.earned, 'version: one shiny card');
  ok(ev(g('firsts', 1), own3) === undefined, 'firsts needs numbered copies');
  const { encodeEntry } = await import('../lib/variants');
  const heldS = (list: number[][]) => ({ ...season([]), held: new Map(list.map((l, i) => [encodeEntry(i + 1, 'regular'), l] as [number, number[]])) });
  ok(!ev(g('firsts', 2), heldS([[1], [2]]))!.earned && ev(g('firsts', 2), heldS([[1], [1]]))!.earned, 'firsts: print #1 of 2 different cards');
  ok(!ev(g('trades', 2), own3), 'a trades goal is not evaluated per season');
  ok(a.normalizeCustomGoals([{ id: 'x', title: 't', rule: { type: 'bogus', n: 1 } }, { id: 'y', title: 't', rule: { type: 'rarity', n: 1 } }]).length === 0, 'unknown rules (and a rarity goal with no rarity) are dropped');

  // Stats: once per goal, even with concurrent syncs
  await kv.del('achievements:earned'); await kv.del('achievements:recent');
  await settingsLib.saveCustomGoals(g('unique', 1));
  await kvLib.saveCollection(season1.collectionName, { ...(await kvLib.getCollection(season1.collectionName)), fay: [nums[0]] });
  await Promise.all([store.syncAchievements('fay', 50000), store.syncAchievements('fay', 50001), store.syncAchievements('fay', 50002)]);
  await store.syncAchievements('fay', 50003);
  const st = await store.getAchievementStats();
  eq(st.counts['custom-g1'], 1, 'a goal is counted once for a player, even with concurrent syncs');
  ok(st.recent.filter(r => r.username === 'fay' && r.id.endsWith(':custom-g1')).length === 1, 'and listed once in recent');
  await store.recountAchievements();
  ok((await store.getAchievementStats()).counts['custom-g1'] >= 1, 'Recount rebuilds counts from the stored rows');
  // A deleted custom goal stays earned
  await settingsLib.saveCustomGoals([]);
  ok((await store.syncAchievements('fay', 60000)).earned.some(x => x.id.endsWith(':custom-g1')), 'a deleted custom goal stays on the profile');

  // Trade goals
  const { completedTradeCount } = await import('../lib/trades');
  const t = (status: string, from: string, to?: string, resolvedBy?: string) => ({ id: Math.random().toString(36), status, from, to, resolvedBy });
  const history = [t('accepted', 'gus', 'hal'), t('accepted', 'gus', 'hal'), t('cancelled', 'gus', 'hal'), t('declined', 'gus', 'hal'), t('accepted', 'ivy', undefined, 'gus')];
  await kv.set('trades:history', history);
  eq([await completedTradeCount('gus'), await completedTradeCount('HAL'), await completedTradeCount('ivy')], [3, 2, 1], 'both sides count, resolvedBy stands in for a listing taker, other statuses do not');
  const tg = (n: number, goals: ReturnType<typeof g> = []) => a.tradingGoals(n, new Set(), goals);
  const tid = (list: ReturnType<typeof tg>, k: string) => list.find(x => x.id === 'trading:' + k)!;
  ok(!tid(tg(0), 'first-trade').earned && tid(tg(1), 'first-trade').earned, 'first trade is earned at 1');
  ok(!tid(tg(9), 'ten-trades').earned && tid(tg(10), 'ten-trades').earned, 'ten trades at 9 vs 10');
  ok(!tid(tg(2, g('trades', 3)), 'custom-g1').earned && tid(tg(3, g('trades', 3)), 'custom-g1').earned, 'custom trades rule at N-1 and N');
  ok(!a.tradingGoals(1, new Set(['first-trade'])).some(x => x.id.endsWith('first-trade')), 'a switched-off trade goal is absent');
  eq(tid(tg(0), 'ten-trades').detail, 'Complete 10 trades.', 'trade text fills {need}');
  const gus = await store.syncAchievements('gus', 70000);
  const gusFirst = gus.earned.find(x => x.id === 'trading:first-trade');
  ok(!!gusFirst && gusFirst.seasonName === 'Trading', 'syncAchievements stores trade goals');
  ok(gus.next.some(x => x.id === 'trading:ten-trades' && x.have === 3), 'trade progress is listed as next');
  await kv.set('trades:history', []); // every trade reversed or gone
  ok((await store.syncAchievements('gus', 71000)).earned.some(x => x.id === 'trading:first-trade'), 'a trade goal stays earned when the trades are gone');
}

console.log('achievement checks passed');
process.exit(0);
