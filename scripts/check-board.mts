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
// An ended season's board comes from its saved standings.
const snapRow = (username: string, score: number, cardPoints: number, extra: object = {}) => ({ username, score, cardPoints, uniqueCards: 10, copies: 20, complete: false, ...extra });
const full = b.standingsToBoardRows([
  snapRow('amy', 120, 100, { completionBonus: 15, setBonus: 5, variants: { regular: 15, reverse: 3, full: 1, shiny: 1 } }),
  snapRow('ben', 90, 90, { completionBonus: 0, setBonus: 0, variants: { regular: 20, reverse: 0, full: 0, shiny: 0 } }),
]);
ok(full.hasVariants && full.rows.length === 2 && !full.rows[0].bonusesTogether, 'a new final standing keeps the bonus split and the version counts');
eq([full.rows[0].completionBonus, full.rows[0].setBonus, full.rows[0].variants.shiny], [15, 5, 1], 'the split is passed through');
const old = b.standingsToBoardRows([snapRow('amy', 120, 100), snapRow('ben', 90, 90)]);
ok(!old.hasVariants && old.rows[0].bonusesTogether === true, 'an old final standing (no split, no versions) is flagged');
eq([old.rows[0].completionBonus, old.rows[0].setBonus, old.rows[1].completionBonus], [20, 0, 0], 'the unsplit bonuses are score minus card points, in one lump');
eq(b.standingsToBoardRows([snapRow('amy', 120, 100), snapRow('ben', 90, 90)], new Set(['amy'])).rows.map(r => r.username), ['ben'], 'collectors hidden since the season ended are left out');
eq(b.standingsToBoardRows([]).rows, [], 'no standings, no rows');
const finalRanked = b.rankBoard(full.rows, 'points');
eq(finalRanked.map(r => [r.row.username, r.rank]), [['amy', 1], ['ben', 2]], 'the final board ranks like any other');

console.log('board checks passed');
