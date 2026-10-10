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
console.log('card values:', [...values.cards.values()].map(c => ({ n: c.number, scarcity: +c.scarcity.toFixed(2), regular: c.values.regular, reverse: c.values.reverse })));
if (!(values.cards.get(2)!.values.regular > values.cards.get(1)!.values.regular)) throw new Error('rare should be worth more');
const rows = buildLeaderboard(values, collection);
console.log('rows:', rows.map(r => [r.username, r.score]));
eq(rows.find(r => r.username === 'bob')!.copies, 1, 'deleted card #99 ignored');
console.log('all checks passed');
