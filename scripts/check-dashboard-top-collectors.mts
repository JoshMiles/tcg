// The admin dashboard's Top collectors rank by points, in the site leaderboard's order, not by how many different cards a player owns.
// Needs the mock KV (npm run check starts it); refuses anything non-local.
// Run: npx tsx scripts/check-dashboard-top-collectors.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';

const kvLib = await import('../lib/kv');
const { getSeasonLeaderboard } = await import('../lib/leaderboard');
const { loadDashboardData } = await import('../lib/dashboard-data');
const { DEFAULT_UPGRADE_COSTS, DEFAULT_VARIANT_WEIGHTS } = await import('../lib/variants');
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const pack = { id: 'tc', name: 'tc', coverImageUrl: '', active: true, status: 'published' as const, weight: 1, accentColor: '', tearBorderColor: '', holoMinStars: 5, cardTime: 3, cooldownTime: 1, soundVolume: 1,
  createdAt: 1, upgradesEnabled: false, variantWeights: DEFAULT_VARIANT_WEIGHTS, upgradeCosts: DEFAULT_UPGRADE_COSTS };
const cards = [1, 2, 3, 4].map(n => ({ id: `c${n}`, number: n, name: `Card ${n}`, imageUrl: '', probability: 10, stars: 1 + (n % 5) }));
await kvLib.savePack(pack);
await kvLib.savePackCards('tc', cards);
const season = { id: 'tcs', name: 'TCS', collectionName: 'TCS', active: false, status: 'published' as const, createdAt: 1, maxConcurrentPacks: 1, packIds: ['tc'] };
await kvLib.saveSeason(season);
// "wide" owns three different cards once; "deep" owns one card (the rarest) many times: fewer different cards, more points.
await kvLib.saveCollection('TCS', { wide: [1, 2, 3], deep: Array(40).fill(4) });

const board = await getSeasonLeaderboard(season);
const d = await loadDashboardData(season, [{ pack, cards }], new Set(['top-collectors'] as const));
ok(d.topCollectors.map(c => c.username).join() === board.rows.map(r => r.username).join(), 'Top collectors follow the leaderboard order');
ok(d.topCollectors[0].username === 'deep' && d.topCollectors[0].owned === 1, 'fewer different cards but more points ranks first');
ok(d.topCollectors[0].score === board.rows[0].score, 'the points shown are the leaderboard score');
ok(d.bestPct === 75, `the best completion is still the widest collection (got ${d.bestPct})`);

console.log('dashboard top collectors checks passed');
