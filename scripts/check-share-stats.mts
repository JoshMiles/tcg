// Checks the figures and the layout of the "Share my stats" image (pure). Run: npx tsx scripts/check-share-stats.mts
import { buildStatsCard, rarestPrint, tradesInSeason, wrappedRow, type StatsCardInput } from '../lib/share-stats';
import { statsLayout, SHARE_H, STORY_H, cardArea } from '../lib/share-image';

const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const eq = (a: unknown, b: unknown, msg: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);

const odds: Record<string, number> = { '1.regular': 0.05, '2.shiny': 0.0002, '3.regular': 0.0002, '4.full': 0 };
const base: StatsCardInput = {
  rank: 7, score: 18673.4, uniqueCards: 12, totalCards: 20, copies: 31, completionBonusPct: 10,
  prints: [{ card: 1, variant: 'regular', n: 9 }, { card: 2, variant: 'shiny', n: 40 }, { card: 3, variant: 'regular', n: 4 }, { card: 4, variant: 'full', n: 2 }],
  chance: (card, variant) => odds[`${card}.${variant}`] ?? 0,
  nameOf: n => `Card ${n}`, hexOf: n => (n === 3 ? '#ff00aa' : '#facc15'), tradesCompleted: 3,
};

// the rarest print: lowest chance, ties to the lower edition, unknown odds skipped
eq(rarestPrint(base), { card: 3, variant: 'regular', n: 4, chance: 0.0002 }, 'rarest print: a tie on odds goes to the lower edition');
eq(rarestPrint({ prints: [], chance: base.chance }), null, 'no prints, no rarest print');
eq(rarestPrint({ prints: [{ card: 4, variant: 'full', n: 1 }], chance: base.chance }), null, 'a print with unknown odds is skipped');

const c = buildStatsCard(base);
eq([c.rank, c.score, c.accent], ['#7', '18,673', '#ff00aa'], 'rank, score and the rarest print\'s colour');
eq(c.figures.map(f => f.label), ['Collected', 'Pulls', 'Progress bonus', 'Best edition', 'Rarest edition', 'Trades'], 'six figures');
eq(c.figures[0], { label: 'Collected', value: '12/20', progress: 0.6 }, 'cards with a progress bar');
eq(c.figures[2].value, '+6.0%', 'progress bonus is the setting scaled by how much of the set they have');
eq(c.figures[3].value, '#2', 'best edition is the lowest number held');
eq([c.figures[4].value, c.figures[4].sub], ['Card 3', 'Regular · 1 in 5,000'], 'rarest print with its version and odds');
eq(c.figures[5].value, '3', 'trades completed');

// a season that does not track prints, a viewer with no rank
const bare = buildStatsCard({ ...base, rank: null, prints: [], copies: 0, uniqueCards: 0 });
eq([bare.rank, bare.accent, bare.figures[3].value, bare.figures[4].value, bare.figures[2].value], ['-', undefined, '-', '-', '+0.0%'], 'untracked / empty: placeholders, no accent');

// layout: everything inside the card area, in order, for a post and a story
for (const h of [SHARE_H, STORY_H]) {
  const a = cardArea(h), L = statsLayout(h, 3);
  eq(L.tiles.length, 6, 'six tiles');
  ok(L.hero.y >= a.y && L.hero.y + L.hero.h < L.tiles[0].y, `hero sits above the tiles (${h})`);
  ok(L.tiles[1].x > L.tiles[0].x && L.tiles[2].y > L.tiles[0].y, `two columns of three (${h})`);
  ok(L.strip.y > L.tiles[5].y + L.tiles[5].h, `the strip is below the tiles (${h})`);
  ok(L.thumbs.every(t => t.h > 100 && t.y + t.h <= a.y + a.h + 0.5 && t.x >= a.x && t.x + t.w <= a.x + a.w + 0.5), `the three prints fit the area (${h})`);
  eq(Math.round(L.thumbs[0].w / L.thumbs[0].h * 1000), 667, `prints keep the card ratio (${h})`);
}
// season wrapped: rank from the frozen standings, trades counted within the season
const rows = [{ username: 'amy' }, { username: 'ben' }, { username: 'cy' }];
eq(wrappedRow(rows, 'Ben')?.rank, 2, 'rank is the 1-based place in the standings, case-insensitive');
eq(wrappedRow(rows, 'zed'), null, 'not in the standings: no wrapped');
const log = [
  { status: 'accepted', seasonId: 's1', from: 'ben', to: 'amy' }, { status: 'accepted', seasonId: 's1', from: 'amy', resolvedBy: 'ben' },
  { status: 'accepted', seasonId: 's2', from: 'ben', to: 'amy' }, { status: 'declined', seasonId: 's1', from: 'ben', to: 'amy' },
  { status: 'accepted', seasonId: 's1', from: 'ben', to: 'amy', reversedAt: 5 }, { status: 'accepted', seasonId: 's1', from: 'cy', to: 'amy' },
];
eq(tradesInSeason(log, 's1', 'ben'), 2, 'completed, not reversed, this season, either side');
eq(tradesInSeason(log, 's1', 'zed'), 0, 'no trades');
console.log('share stats ok');
