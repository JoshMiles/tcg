// Sanity checks for the variant / upgrade / value maths. Run: npx tsx scripts/check-upgrades.mts
import { encodeEntry, decodeEntry, rollVariant, removeEntries, countVariants, DEFAULT_VARIANT_WEIGHTS, DEFAULT_UPGRADE_COSTS, VARIANTS } from '../lib/variants';
import { variantMultipliers, computeSeasonValues, buildLeaderboard } from '../lib/leaderboard';
import type { Pack, Card } from '../lib/types';

function eq(a: unknown, b: unknown, msg: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
}

// Encoding: legacy numbers are Regular; large card numbers survive every variant.
eq(decodeEntry(25), { cardNumber: 25, variant: 'regular' }, 'legacy entry');
for (const n of [1, 40, 5000, 999_999]) for (const v of VARIANTS) eq(decodeEntry(encodeEntry(n, v)), { cardNumber: n, variant: v }, `roundtrip ${n} ${v}`);

// Variant roll hits roughly the configured odds.
const N = 200_000;
const hits = { regular: 0, reverse: 0, full: 0, shiny: 0 };
for (let i = 0; i < N; i++) hits[rollVariant(DEFAULT_VARIANT_WEIGHTS)]++;
const pct = (v: keyof typeof hits) => (hits[v] / N) * 100;
console.log('roll %:', Object.fromEntries(VARIANTS.map(v => [v, pct(v).toFixed(2)])));
if (Math.abs(pct('regular') - 76.6) > 1 || Math.abs(pct('reverse') - 19.1) > 1 || Math.abs(pct('shiny') - 0.8) > 0.3) throw new Error('roll odds off');
eq(rollVariant({ regular: 0, reverse: 0, full: 0, shiny: 0 }), 'regular', 'zero weights');

// Removing copies.
eq(removeEntries([1, 1, 2, 1], 1, 2), [2, 1], 'remove 2');
eq(removeEntries([1, 2], 1, 2), null, 'not enough');

// Counting.
const owned = [3, 3, encodeEntry(3, 'reverse'), encodeEntry(4, 'shiny')];
eq(countVariants(owned).get(3), { regular: 2, reverse: 1, full: 0, shiny: 0 }, 'countVariants');

// Values: an upgrade is always worth more than the copies it consumes, whatever the admin sets.
const pack = (over: Partial<Pack> = {}): Pack => ({
  id: 'p', name: 'p', coverImageUrl: '', active: true, weight: 1, accentColor: '', tearBorderColor: '', holoMinStars: 5,
  cardTime: 3, cooldownTime: 1, soundVolume: 1, createdAt: 0,
  upgradesEnabled: true, variantWeights: DEFAULT_VARIANT_WEIGHTS, upgradeCosts: DEFAULT_UPGRADE_COSTS, ...over,
});
for (const p of [pack(), pack({ upgradeCosts: { reverse: 2, full: 2, shiny: 2 } }), pack({ variantWeights: { regular: 1, reverse: 1, full: 1, shiny: 1 } }), pack({ upgradeCosts: { reverse: 10, full: 10, shiny: 10 } })]) {
  const m = variantMultipliers(p);
  const costs = [0, p.upgradeCosts.reverse, p.upgradeCosts.full, p.upgradeCosts.shiny];
  for (let i = 1; i < 4; i++) if (!(m[VARIANTS[i]] > m[VARIANTS[i - 1]] * costs[i])) throw new Error(`upgrade ${VARIANTS[i]} is not a net gain: ${JSON.stringify(m)}`);
}
console.log('multipliers (defaults):', variantMultipliers(pack()));
eq(variantMultipliers(pack({ upgradesEnabled: false })), { regular: 1, reverse: 1, full: 1, shiny: 1 }, 'upgrades off => flat');

// Leaderboard: rarer + scarcer cards score higher; variants count; deleted cards are ignored.
const cards: Card[] = [
  { id: 'a', number: 1, name: 'Common', imageUrl: '', probability: 90, stars: 1 },
  { id: 'b', number: 2, name: 'Rare', imageUrl: '', probability: 10, stars: 5 },
];
const collection = { alice: [1, 1, 1, 1, 1, encodeEntry(2, 'regular')], bob: [encodeEntry(2, 'reverse'), 99] };
const values = computeSeasonValues([{ pack: pack(), cards }], collection);
console.log('card values:', [...values.cards.values()].map(c => ({ n: c.number, scarcity: { reg: +c.scarcity.regular.toFixed(2), rh: +c.scarcity.reverse.toFixed(2) }, regular: c.values.regular, reverse: c.values.reverse })));
if (!(values.cards.get(2)!.values.regular > values.cards.get(1)!.values.regular)) throw new Error('rare should be worth more');
const rows = buildLeaderboard(values, collection);
console.log('rows:', rows.map(r => [r.username, r.score]));
eq(rows.find(r => r.username === 'bob')!.copies, 1, 'deleted card #99 ignored');
console.log('all checks passed');

// Scarcity is per variant: spending Regulars makes the Regulars you keep worth more, and adds to the Reverse count.
import { projectUpgradeGain, scoreFor, computeSeasonValues as csv } from '../lib/leaderboard';
const big: Record<string, number[]> = { a: [1, 1, 1, 1, 1, 1, 2, 2, 2, 2], b: [1, 2, 2, 2] };
const packs = [{ pack: pack(), cards }];
const beforeV = csv(packs, big);
const afterV = csv(packs, { ...big, a: [1, encodeEntry(1, 'reverse'), 2, 2, 2, 2] }); // a upgraded card 1: 5 Regular -> 1 Reverse
const c1b = beforeV.cards.get(1)!, c1a = afterV.cards.get(1)!;
console.log('card 1 regular scarcity', +c1b.scarcity.regular.toFixed(2), '->', +c1a.scarcity.regular.toFixed(2), '| value', c1b.values.regular, '->', c1a.values.regular);
if (!(c1a.scarcity.regular > c1b.scarcity.regular)) throw new Error('spending regulars should make that version scarcer');
if (!(c1a.variantCopies.reverse === 1 && c1b.variantCopies.reverse === 0)) throw new Error('reverse count should rise');
// Another card's Regular value is unaffected by card 1's Reverse (different version), but does move with the Regular average.
const gain = projectUpgradeGain(packs, big, 'a', 1, 'regular', 'reverse', 5);
console.log('projected gain for a:', gain, '(before', scoreFor(beforeV, big.a), 'after', scoreFor(afterV, [1, encodeEntry(1, 'reverse'), 2, 2, 2, 2]), ')');
if (gain === null || gain !== scoreFor(afterV, [1, encodeEntry(1, 'reverse'), 2, 2, 2, 2]) - scoreFor(beforeV, big.a)) throw new Error('projection should equal a full recompute');
if (projectUpgradeGain(packs, big, 'b', 1, 'regular', 'reverse', 5) !== null) throw new Error('not enough copies should return null');
console.log('per-variant scarcity checks passed');

// ── Collection bonuses ──
import { collectionBonuses, COMPLETION_BONUS_RATE, COMPLETE_SET_BONUS_RATE, buildLeaderboard as bl } from '../lib/leaderboard';
const setCards: Card[] = [1, 2, 3, 4].map(n => ({ id: 's' + n, number: n, name: 'C' + n, imageUrl: '', probability: 10, stars: 1 }));
const sets = { full: [1, 2, 3, 4], half: [1, 2], dupes: [1, 1, 1, 1, 1, 1, 1, 1] };
const sv = csv([{ pack: pack({ upgradesEnabled: false }), cards: setCards }], sets);
const bFull = collectionBonuses(sv, 4), bHalf = collectionBonuses(sv, 2), bNone = collectionBonuses(sv, 0), bOne = collectionBonuses(sv, 1);
console.log('set value', sv.setValue, '| full', bFull, '| half', bHalf);
if (!(bFull.complete && bFull.set === Math.round(sv.setValue * COMPLETE_SET_BONUS_RATE))) throw new Error('complete set bonus');
if (bFull.completion !== Math.round(sv.setValue * COMPLETION_BONUS_RATE)) throw new Error('completion bonus at 100%');
if (bHalf.set !== 0 || bHalf.complete) throw new Error('half set must not get the complete bonus');
if (bHalf.completion !== Math.round(sv.setValue * COMPLETION_BONUS_RATE * 0.5)) throw new Error('completion bonus should be proportional');
if (bNone.completion !== 0 || bNone.set !== 0) throw new Error('no cards, no bonus');
if (!(bOne.completion < bHalf.completion && bHalf.completion < bFull.completion)) throw new Error('bonus should grow with completion');
const brows = bl(sv, sets);
const full = brows.find(r => r.username === 'full')!, dupes = brows.find(r => r.username === 'dupes')!;
if (!full.complete || full.setBonus <= 0 || full.score !== full.cardPoints + full.completionBonus + full.setBonus) throw new Error('row totals');
if (dupes.complete || dupes.setBonus !== 0) throw new Error('duplicates of one card are not a complete collection');
console.log('rows:', brows.map(r => [r.username, r.cardPoints, r.completionBonus, r.setBonus, r.score]));
console.log('collection bonus checks passed');
