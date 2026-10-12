// Checks profile achievements: the goals, progress, and that earned goals are remembered. Needs the mock KV for the store part.
// Run: node scripts/mock-kv.cjs & KV_REST_API_URL=http://localhost:4111 KV_REST_API_TOKEN=dev KV_URL=redis://dev npx tsx scripts/check-achievements.mts
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const eq = (a: unknown, b: unknown, msg: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
const a = await import('../lib/achievements');

const none = { regular: 0, reverse: 0, full: 0, shiny: 0 };
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
console.log('achievement checks passed');
process.exit(0);
