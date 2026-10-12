// Checks listing matches and the fairness label. Pure.  Run: npx tsx scripts/check-trade-match.mts
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const eq = (a: unknown, b: unknown, msg: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
const m = await import('../lib/trade-match');
const { encodeEntry } = await import('../lib/variants');
const E = (n: number, v: 'regular' | 'reverse' | 'full' | 'shiny' = 'regular') => encodeEntry(n, v);

const info = (number: number, value: number) => ({ number, name: `c${number}`, imageUrl: '', stars: 1, packName: 'p', variants: ['regular', 'reverse', 'full', 'shiny'] as never, values: [value, value * 3, value * 8, value * 30], raw: [value, value * 3, value * 8, value * 30], bonus: { max: 3, cutoff: 20 } });
const cards = Object.fromEntries([1, 2, 3, 4, 5].map(n => [n, info(n, n * 10)]));
const T = (id: string, give: [number, 'regular' | 'shiny', number][], get: [number, 'regular' | 'shiny', number][], createdAt = 1) => ({
  id, seasonId: 's', kind: 'listing', from: 'x', give: give.map(([cardNumber, variant, count]) => ({ cardNumber, variant, count })), get: get.map(([cardNumber, variant, count]) => ({ cardNumber, variant, count })),
  escrowed: true, status: 'open', createdAt, expiresAt: 9e12,
}) as never;

// The viewer owns 3x card 1 (regular) and 1x card 2 (regular); wants card 5.
const viewer = { copies: new Map([[E(1), 3], [E(2), 1]]), wanted: new Set([5]) };

const wantsMine = m.matchTrade(T('a', [[5, 'regular', 1]], [[1, 'regular', 1]]), viewer, cards);
ok(wantsMine.canTake && wantsMine.offersWanted.length === 1 && wantsMine.asksOnlySpares, 'a listing that gives a wanted card for a spare');
ok(wantsMine.reasons[0] === 'Offers a card you are looking for', 'reason: wanted card');
const cantTake = m.matchTrade(T('b', [[3, 'regular', 1]], [[2, 'regular', 2]]), viewer, cards);
ok(!cantTake.canTake && cantTake.score < 0, 'cannot take what asks for more than you own');
const lastCopy = m.matchTrade(T('c', [[3, 'regular', 1]], [[2, 'regular', 1]]), viewer, cards);
ok(lastCopy.canTake && !lastCopy.asksOnlySpares, 'giving your only copy is not a spare');
ok(lastCopy.offersNew.length === 1, 'card 3 is new to the viewer');
eq(m.matchTrade(T('d', [[1, 'regular', 1]], [[1, 'regular', 2]]), viewer, cards).gain, -10, 'gain is points received minus points given');

const board = [T('a', [[5, 'regular', 1]], [[1, 'regular', 1]], 3), T('b', [[3, 'regular', 1]], [[2, 'regular', 2]], 2), T('c', [[3, 'regular', 1]], [[2, 'regular', 1]], 1), T('d', [[1, 'regular', 1]], [[1, 'regular', 2]], 4)];
eq(m.bestMatches(board, viewer, cards).map(x => (x.trade as { id: string }).id), ['a', 'c'], 'best matches: only takeable, interesting ones, best first');
eq(m.bestMatches(board, viewer, cards, 1).length, 1, 'limit');

eq(m.fairness(100, 100).label, 'Even', 'even');
eq(m.fairness(300, 100), { label: 'Lopsided against you', warn: true }, 'giving three times as much warns');
eq(m.fairness(100, 300).label, 'Generous to them' === m.fairness(100, 300).label ? 'Generous to them' : 'x', 'getting three times as much is not a warning');
ok(!m.fairness(100, 300).warn, 'no warning when you gain');
eq(m.fairness(40, 10).warn, false, 'a big ratio but a tiny gap does not warn');
eq(m.fairness(120, 100).label, 'Slightly in their favour', 'small gap');
eq(m.fairness(0, 0).label, 'Empty', 'nothing chosen');

// ── Serial bonuses in trade prices ──
const core = await import('../lib/trade-view-core');
const stack = [{ cardNumber: 2, variant: 'regular' as const, count: 2 }];
eq(core.stackPoints(stack, cards), 40, 'no pool: plain values');
// Trades move the NEWEST copies, so with serials #1 #5 #30 a stack of 2 takes #30 (no bonus) and #5.
const bonus5 = Math.round(20 * (1 + 2 * (1 - 4 / 20)));
eq(core.stackPoints(stack, cards, { [E(2)]: [1, 5, 30] }), bonus5 + 20, 'a stack of 2 takes the two newest serials');
eq(core.stackPoints(stack, cards, { [E(2)]: [1] }), Math.round(20 * 3) + 20, 'a short pool: the rest are priced plain');
eq(core.stackPoints([{ cardNumber: 2, variant: 'shiny' as const, count: 1 }], cards, { [E(2)]: [1] }), 20 * 30, 'a pool for another version does not apply');
// An offer is priced from its escrow, and what it asks from the viewer's own pool; the viewer's own offer asks nobody in particular.
const pools = { viewer: 'v', give: { a: { [E(5)]: [1] } }, mine: { [E(1)]: [1, 2, 3] } };
const lp = core.poolsFor({ id: 'a', from: 'x' }, pools);
ok(lp.give?.[E(5)]?.[0] === 1 && lp.get?.[E(1)]?.length === 3, "someone else's offer: escrow for what it gives, my copies for what it asks");
ok(core.poolsFor({ id: 'a', from: 'v' }, pools).get === undefined, 'my own offer has no pool for what it asks');
const withBonus = m.matchTrade(T('a', [[5, 'regular', 1]], [[1, 'regular', 1]]), viewer, cards, pools);
const plainMatch = m.matchTrade(T('a', [[5, 'regular', 1]], [[1, 'regular', 1]]), viewer, cards);
ok(withBonus.gain === 150 - 28 && plainMatch.gain === 40, 'the match gain uses the serial bonus: ' + withBonus.gain + ' vs ' + plainMatch.gain);
console.log('trade match checks passed');
