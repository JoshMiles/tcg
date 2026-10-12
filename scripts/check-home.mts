// Checks the home page helpers. Pure.  Run: npx tsx scripts/check-home.mts
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const eq = (a: unknown, b: unknown, msg: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
const h = await import('../lib/home-data');

const rows = [{ username: 'a', score: 500, uniqueCards: 20 }, { username: 'b', score: 300.4, uniqueCards: 10 }, { username: 'c', score: 120, uniqueCards: 5 }];
eq(h.viewerStanding(rows, 'a', 25)?.ahead, null, 'the leader has nobody ahead');
eq(h.viewerStanding(rows, 'b', 25), { rank: 2, of: 3, score: 300, uniqueCards: 10, totalCards: 25, pct: 40, ahead: { username: 'a', gap: 200 } }, 'second place: gap to the leader');
eq(h.viewerStanding(rows, 'c', 25)?.ahead, { username: 'b', gap: 181 }, 'the gap rounds up so passing needs more than a tie');
ok(h.viewerStanding(rows, 'zed', 25) === null, 'someone not on the board has no standing');
eq(h.viewerStanding(rows, 'a', 0)?.pct, 0, 'no cards in the season does not divide by zero');
eq(h.viewerStanding([{ username: 'a', score: 5, uniqueCards: 1 }, { username: 'b', score: 5, uniqueCards: 1 }], 'b', 2)?.ahead?.gap, 1, 'a tie still needs at least one point');

const now = 1_000_000_000_000;
eq(h.seasonCountdown(undefined, now), null, 'no end date, no countdown');
eq(h.seasonCountdown(now - 1, now), 'Ended', 'past end date');
eq(h.seasonCountdown(now + 90 * 60_000, now), 'Ends in 2 hours', 'under a day is in hours');
eq(h.seasonCountdown(now + 3_600_000, now), 'Ends in 1 hour', 'singular hour');
eq(h.seasonCountdown(now + 49 * 3_600_000, now), 'Ends in 3 days', 'days round up');

eq([h.notableReason({ variant: 'shiny', stars: 1 }), h.notableReason({ variant: 'full', stars: 1 }), h.notableReason({ variant: 'regular', stars: 5 }), h.notableReason({ variant: 'reverse', stars: 3 }), h.notableReason({ stars: 2 })], ['Shiny', 'Full Art', '5★', null, null], 'which pulls stand out');
eq([h.agoShort(now, now), h.agoShort(now - 3 * 60_000, now), h.agoShort(now - 5 * 3_600_000, now), h.agoShort(now - 3 * 86_400_000, now)], ['just now', '3m ago', '5h ago', '3d ago'], 'short ago text');
console.log('home checks passed');
