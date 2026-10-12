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

// Leaderboard: rarer cards score higher; variants count; deleted cards are ignored.
const cards: Card[] = [
  { id: 'a', number: 1, name: 'Common', imageUrl: '', probability: 90, stars: 1 },
  { id: 'b', number: 2, name: 'Rare', imageUrl: '', probability: 10, stars: 5 },
];
const collection = { alice: [1, 1, 1, 1, 1, encodeEntry(2, 'regular')], bob: [encodeEntry(2, 'reverse'), 99] };
const values = computeSeasonValues([{ pack: pack(), cards }], collection);
console.log('card values:', [...values.cards.values()].map(c => ({ n: c.number, regular: c.values.regular, reverse: c.values.reverse })));
if (!(values.cards.get(2)!.values.regular > values.cards.get(1)!.values.regular)) throw new Error('rare should be worth more');
const rows = buildLeaderboard(values, collection);
console.log('rows:', rows.map(r => [r.username, r.score]));
eq(rows.find(r => r.username === 'bob')!.copies, 1, 'deleted card #99 ignored');
console.log('all checks passed');

// Serial bonus: the first copies of a card (per version) earn a multiplier that fades to nothing after the cutoff.
import { projectUpgradeGain, scoreFor, pointsFor, computeSeasonValues as csv } from '../lib/leaderboard';
import { serialMultiplier } from '../lib/scoring-core';
import { buildSerialIndex } from '../lib/serials-core';
const SB = { serialBonusMax: 3, serialBonusCutoff: 20 };
eq(serialMultiplier(1, SB), 3, 'copy #1 gets the full bonus');
eq(serialMultiplier(21, SB), 1, 'past the cutoff there is no bonus');
eq(serialMultiplier(undefined, SB), 1, 'no serial, no bonus');
eq(serialMultiplier(1, { serialBonusMax: 3, serialBonusCutoff: 0 }), 1, 'cutoff 0 switches it off');
for (let n = 1; n < 20; n++) if (!(serialMultiplier(n, SB) > serialMultiplier(n + 1, SB))) throw new Error('bonus should shrink with every serial');
if (!(serialMultiplier(20, SB) > 1 && serialMultiplier(20, SB) < 1.2)) throw new Error('last serial before the cutoff is a tiny bonus');
const packs = [{ pack: pack(), cards }];
const big: Record<string, number[]> = { a: [1, 1, 1, 1, 1, 1, 2, 2, 2, 2], b: [1, 2, 2, 2] };
// Ledger: a holds Regular #1 #2 #3 #4 #5 #30 of card 1 (30 were made), b holds #6; four card-2 Regulars each.
const idx = buildSerialIndex({
  '1.0.1': 'a', '1.0.2': 'a', '1.0.3': 'a', '1.0.4': 'a', '1.0.5': 'a', '1.0.30': 'a', '1.0.6': 'b',
  '2.0.1': 'a', '2.0.2': 'a', '2.0.3': 'a', '2.0.4': 'a', '2.0.5': 'b', '2.0.6': 'b', '2.0.7': 'b', '2.0.8': 'escrow:t1',
}, new Map([[encodeEntry(1, 'regular'), 30], [encodeEntry(2, 'regular'), 8]]));
if (idx.held.has('escrow:t1')) throw new Error('escrowed copies are not held by anyone');
const withSerials = csv(packs, big, DEFAULT_SCORING, idx);
const without = csv(packs, big, DEFAULT_SCORING, null);
const plain = pointsFor(without, big.a, 'a');
const bonus = pointsFor(withSerials, big.a, 'a');
console.log('a: plain', plain.points, 'with serial bonus', bonus.points, '(+' + bonus.serialPoints + ')');
if (!(bonus.points > plain.points) || bonus.points - plain.points !== bonus.serialPoints) throw new Error('serial bonuses should add points, and report them');
if (plain.serialPoints !== 0) throw new Error('no ledger, no bonus');
const c1 = withSerials.cards.get(1)!;
eq(pointsFor(withSerials, [1], 'b').points, Math.max(1, Math.round(c1.maths.raw.regular * serialMultiplier(6, DEFAULT_SCORING))), "b's #6 is worth its serial multiple");
eq(pointsFor(withSerials, [1], 'nobody').points, c1.values.regular, 'a viewer the ledger does not know gets plain values');
// Nobody else's copies change a card's value any more.
eq(withSerials.cards.get(1)!.values, csv(packs, { ...big, b: [] }, DEFAULT_SCORING, idx).cards.get(1)!.values, "another viewer's copies do not move a card's value");
// The leaderboard carries the bonus and it adds up.
const lrows = buildLeaderboard(withSerials, big);
const la = lrows.find(r => r.username === 'a')!;
if (la.serialPoints !== bonus.serialPoints || la.score !== la.cardPoints + la.completionBonus + la.setBonus) throw new Error('row totals with a serial bonus');
// Upgrade projection: five Regular card-1 copies are spent, newest serials first (#30, #5, #4, #3, #2), so only #1 is kept and Reverse #1 arrives.
const idx2 = buildSerialIndex({ ...Object.fromEntries(Object.entries({ '1.0.1': 'a', '1.0.2': 'a', '1.0.3': 'a', '1.0.4': 'a', '1.0.5': 'a', '1.0.30': 'a' })), '1.1.1': 'z' }, new Map([[encodeEntry(1, 'regular'), 30], [encodeEntry(1, 'reverse'), 1]]));
const v2 = csv(packs, { a: [1, 1, 1, 1, 1, 1] }, DEFAULT_SCORING, idx2);
const gain = projectUpgradeGain(v2, [1, 1, 1, 1, 1, 1], 'a', 1, 'regular', 'reverse', 5);
const afterEntries = [1, encodeEntry(1, 'reverse')];
const manual = scoreFor({ ...v2, serials: { minted: idx2.minted, held: new Map([['a', new Map([[1, [1]], [encodeEntry(1, 'reverse'), [2]]])]]) } }, afterEntries, 'a') - scoreFor(v2, [1, 1, 1, 1, 1, 1], 'a');
console.log('projected gain', gain, 'manual', manual);
eq(gain, manual, 'projection spends the newest serials and mints the next free one');
if (projectUpgradeGain(v2, [1], 'a', 1, 'regular', 'reverse', 5) !== null) throw new Error('not enough copies should return null');
console.log('serial bonus checks passed');

// ── Collection bonuses ──
import { collectionBonuses, buildLeaderboard as bl } from '../lib/leaderboard';
import { DEFAULT_SCORING, sanitizeScoring } from '../lib/scoring';
const COMPLETION_BONUS_RATE = DEFAULT_SCORING.completionBonusPct / 100, COMPLETE_SET_BONUS_RATE = DEFAULT_SCORING.completeSetBonusPct / 100;
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


// ── Tunable settings: each knob must really change the numbers (and defaults must reproduce the old behaviour) ──
const base = csv([{ pack: pack(), cards }], collection);
const same = csv([{ pack: pack(), cards }], collection, DEFAULT_SCORING);
eq([...base.cards.values()].map(c => c.values), [...same.cards.values()].map(c => c.values), 'explicit defaults == implicit defaults');
const dbl = csv([{ pack: pack(), cards }], collection, { ...DEFAULT_SCORING, baseScore: 20 });
if (dbl.cards.get(2)!.values.regular !== 2 * base.cards.get(2)!.values.regular) throw new Error('baseScore should scale values');
const flat = csv([{ pack: pack(), cards }], collection, { ...DEFAULT_SCORING, rarityExponent: 0 });
if (flat.cards.get(1)!.values.regular === base.cards.get(1)!.values.regular && flat.cards.get(2)!.values.regular === base.cards.get(2)!.values.regular) throw new Error('rarityExponent 0 should change values');
const rarityGap = (v: typeof base) => v.cards.get(2)!.values.regular / v.cards.get(1)!.values.regular;
if (!(rarityGap(flat) < rarityGap(base))) throw new Error('lower rarity exponent should narrow the gap between rare and common');
const bigBonus = collectionBonuses({ ...sv, settings: { ...DEFAULT_SCORING, completionBonusPct: 100, completeSetBonusPct: 200 } }, 4);
if (bigBonus.completion !== sv.setValue || bigBonus.set !== 2 * sv.setValue) throw new Error('bonus percentages should be honoured');
const noBonus = collectionBonuses({ ...sv, settings: { ...DEFAULT_SCORING, completionBonusPct: 0, completeSetBonusPct: 0 } }, 4);
if (noBonus.completion !== 0 || noBonus.set !== 0) throw new Error('0% disables the bonuses');
// margin changes the variant multipliers
const wide = variantMultipliers(pack({ variantWeights: { regular: 1, reverse: 1, full: 1, shiny: 1 } }), { ...DEFAULT_SCORING, upgradeMargin: 2 });
const narrow = variantMultipliers(pack({ variantWeights: { regular: 1, reverse: 1, full: 1, shiny: 1 } }), { ...DEFAULT_SCORING, upgradeMargin: 1 });
if (!(wide.shiny > narrow.shiny)) throw new Error('a bigger upgrade margin should raise upgraded values');
// sanitising: junk, out-of-range and inconsistent input are all made safe
const messy = sanitizeScoring({ baseScore: '-5', rarityExponent: 'abc', serialBonusMax: 99, serialBonusCutoff: -5, completionBonusPct: 99999, leaderboardSize: 12.6, unknown: 1 });
if (messy.baseScore !== 1 || messy.rarityExponent !== DEFAULT_SCORING.rarityExponent || messy.serialBonusMax !== 20 || messy.serialBonusCutoff !== 0 || messy.completionBonusPct !== 500 || messy.leaderboardSize !== 13) throw new Error('sanitize: ' + JSON.stringify(messy));
eq(sanitizeScoring(undefined), DEFAULT_SCORING, 'no stored settings -> defaults');
console.log('scoring settings checks passed');

// ── Switched-off variants: pack / card switches, upgrade steps and odds ──
import { allowedVariants, effectiveWeights, upgradeStep, cleanDisabled } from '../lib/variants';
const vp = { disabledVariants: [] as ('reverse' | 'full' | 'shiny')[], upgradeCosts: DEFAULT_UPGRADE_COSTS, variantWeights: DEFAULT_VARIANT_WEIGHTS };
eq(allowedVariants(vp), ['regular', 'reverse', 'full', 'shiny'], 'everything is on by default');
eq(allowedVariants({ ...vp, disabledVariants: ['reverse'] }, { disabledVariants: ['shiny'] }), ['regular', 'full'], 'pack and card switches combine');
eq(cleanDisabled(['shiny', 'regular', 'bogus', 'shiny', 'reverse']), ['reverse', 'shiny'], 'regular and junk are dropped, order and uniqueness are fixed');
eq(upgradeStep(vp, undefined, 'regular'), { to: 'reverse', cost: 5 }, 'plain step');
eq(upgradeStep(vp, undefined, 'shiny'), null, 'nothing above shiny');
// Skipping a switched-off variant costs the combined price (no shortcut): regular -> full with Reverse off = 5 x 3.
eq(upgradeStep({ ...vp, disabledVariants: ['reverse'] }, undefined, 'regular'), { to: 'full', cost: 15 }, 'skip reverse');
eq(upgradeStep(vp, { disabledVariants: ['full'] }, 'reverse'), { to: 'shiny', cost: 9 }, 'card-level skip');
eq(upgradeStep({ ...vp, disabledVariants: ['full', 'shiny'] }, undefined, 'reverse'), null, 'top variants off -> reverse is the end of the line');
eq(effectiveWeights({ ...vp, disabledVariants: ['full'] }), { regular: 100, reverse: 25, full: 0, shiny: 1 }, 'switched-off weights are zeroed');
// Rolling never returns a switched-off variant.
const offW = effectiveWeights({ ...vp, disabledVariants: ['reverse', 'shiny'] });
for (let i = 0; i < 20_000; i++) { const v = rollVariant(offW); if (v === 'reverse' || v === 'shiny') throw new Error('rolled a switched-off variant'); }
// The value multipliers only credit variants that exist: with Full off, Shiny is still priced from the chain of costs.
const mOff = variantMultipliers(pack({ disabledVariants: ['full'] }));
if (!(mOff.shiny >= mOff.reverse)) throw new Error('shiny should never be worth less than reverse');
console.log('switched-off variant checks passed');
