// Checks listing matches and the fairness label. Pure.  Run: npx tsx scripts/check-trade-match.mts
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const eq = (a: unknown, b: unknown, msg: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
const m = await import('../lib/trade-match');
const { encodeEntry } = await import('../lib/variants');
const E = (n: number, v: 'regular' | 'reverse' | 'full' | 'shiny' = 'regular') => encodeEntry(n, v);

const info = (number: number, value: number) => ({ number, name: `c${number}`, imageUrl: '', stars: 1, packName: 'p', variants: ['regular', 'reverse', 'full', 'shiny'] as never, values: [value, value * 3, value * 8, value * 30] });
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
console.log('trade match checks passed');
