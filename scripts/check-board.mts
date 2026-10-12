// Checks the leaderboard's sorting, filtering and rank movement. Pure.  Run: npx tsx scripts/check-board.mts
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const eq = (a: unknown, b: unknown, msg: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
const b = await import('../lib/board-view');

const row = (username: string, score: number, uniqueCards: number, copies: number, shiny = 0, complete = false) => ({
  username, score, cardPoints: score, completionBonus: 0, setBonus: 0, complete, uniqueCards, copies, variants: { regular: copies - shiny, reverse: 0, full: 0, shiny },
});
const rows = [row('amy', 100, 10, 12), row('ben', 300, 8, 30, 2), row('cat', 300, 20, 25, 0, true), row('dan', 50, 10, 10, 1)];

eq(b.rankBoard(rows, 'points').map(r => [r.row.username, r.rank]), [['ben', 1], ['cat', 1], ['amy', 3], ['dan', 4]], 'points: ties share a rank, then the next rank skips');
eq(b.rankBoard(rows, 'cards').map(r => [r.row.username, r.rank]), [['cat', 1], ['amy', 2], ['dan', 2], ['ben', 4]], 'cards: different cards, ties share rank');
eq(b.rankBoard(rows, 'copies').map(r => r.row.username), ['ben', 'cat', 'amy', 'dan'], 'copies');
eq(b.rankBoard(rows, 'shiny').map(r => r.row.username), ['ben', 'dan', 'cat', 'amy'], 'shinies, ties broken by points');

const ranked = b.rankBoard(rows, 'points');
eq(b.filterBoard(ranked, { q: '@AM' }).map(r => [r.row.username, r.rank]), [['amy', 3]], 'search keeps the true rank');
eq(b.filterBoard(ranked, { completeOnly: true }).map(r => r.row.username), ['cat'], 'complete only');
eq(b.filterBoard(ranked, {}).length, 4, 'no filter keeps everyone');

const before = { amy: 1, ben: 3, cat: 1, old: 2 };
eq(b.rankMovement(before, ranked), { ben: 2, amy: -2 }, 'movement: places gained are positive, new and unchanged names are left out');
eq(b.rankSnapshot(ranked), { ben: 1, cat: 1, amy: 3, dan: 4 }, 'snapshot of ranks');
console.log('board checks passed');
