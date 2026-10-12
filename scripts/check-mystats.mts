// Checks My Stats helpers: the advisor and score history sampling. Pure.  Run: npx tsx scripts/check-mystats.mts
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const eq = (a: unknown, b: unknown, msg: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
const a = await import('../lib/advisor');
const h = await import('../lib/score-history-core');

const base = { uniqueCards: 10, totalCards: 25, complete: false, maxCompletionBonus: 100, completeSetBonusValue: 200, missing: [] as never[], nextRank: null };
const miss = (number: number, name: string, value: number, pullRate: number) => ({ number, name, stars: 1, pullRate, value });

eq(a.buildAdvice(base), [], 'nothing to suggest');
eq(a.missingGain(miss(1, 'x', 40, 0.1), base), 44, 'a card is worth its points plus its share of the completion bonus');
const adv = a.buildAdvice({
  ...base, bestUpgrade: { cardName: 'Cat', fromLabel: 'Regular', toLabel: 'Reverse Holo', gain: 12.4, cost: 5 },
  missing: [miss(2, 'Brie', 10, 0.2), miss(3, 'Gouda', 90, 0.01)], nextRank: { username: 'amy', gap: 7 },
});
eq(adv.map(x => x.id), ['upgrade', 'missing', 'rank'], 'upgrade, best missing card, next rank');
eq(adv[1].title, 'Find Gouda', 'the missing card worth the most points is suggested');
eq(adv[1].href, '/cards?card=3', 'links to its dex page');
ok(!a.buildAdvice({ ...base, bestUpgrade: { cardName: 'Cat', fromLabel: 'R', toLabel: 'S', gain: -3, cost: 3 } }).some(x => x.id === 'upgrade'), 'a negative-gain upgrade is never recommended');
eq(a.buildAdvice({ ...base, uniqueCards: 23, missing: [miss(1, 'a', 5, 0.1), miss(2, 'b', 5, 0.1)] }).map(x => x.id), ['complete', 'missing'], 'close to complete gets its own tip');
ok(!a.buildAdvice({ ...base, complete: true, uniqueCards: 25 }).some(x => x.id === 'complete'), 'a complete collection has nothing left to complete');
eq(a.buildAdvice({ ...base, missing: [miss(1, 'a', 5, 0.1)], nextRank: { username: 'q', gap: 1 } }, 1).length, 1, 'the list is capped');
eq(a.buildAdvice({ ...base, nextRank: { username: 'q', gap: 1 } })[0].detail, '1 more point moves you up a place.', 'singular point');

const now = 10_000_000_000;
ok(h.shouldSample(undefined, { score: 1, rank: 1 }, now), 'the first visit is always stored');
ok(!h.shouldSample({ at: now - 60_000, score: 1, rank: 1 }, { score: 9, rank: 1 }, now), 'nothing within 30 minutes');
ok(h.shouldSample({ at: now - 3_600_000, score: 1, rank: 1 }, { score: 9, rank: 1 }, now), 'a changed score is stored');
ok(h.shouldSample({ at: now - 3_600_000, score: 1, rank: 2 }, { score: 1, rank: 1 }, now), 'a changed rank is stored');
ok(!h.shouldSample({ at: now - 3_600_000, score: 1, rank: 1 }, { score: 1, rank: 1 }, now), 'an unchanged hour-old sample is not repeated');
ok(h.shouldSample({ at: now - 7 * 3_600_000, score: 1, rank: 1 }, { score: 1, rank: 1 }, now), 'but one is kept every six hours');
eq(h.chartPoints([{ at: 3, score: 1, rank: 1 }, { at: 1, score: 2, rank: 1 }]).map(p => p.at), [1, 3], 'chart is oldest first');
console.log('my stats checks passed');
