// A draft pack attached to a published season is never drawn, so its cards must not count towards the season's set: rarity and
// card values, the card total and the complete-collection bonus. Needs the mock KV (npm run check starts it); refuses anything non-local.
// Run: npx tsx scripts/check-draft-packs.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';

const kvLib = await import('../lib/kv');
const { getSeasonLeaderboard } = await import('../lib/leaderboard');
const { DEFAULT_UPGRADE_COSTS, DEFAULT_VARIANT_WEIGHTS } = await import('../lib/variants');
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const pack = (id: string, status: 'published' | 'draft', active: boolean) => ({
  id, name: id, coverImageUrl: '', active, status, weight: 1, accentColor: '', tearBorderColor: '', holoMinStars: 5, cardTime: 3, cooldownTime: 1, soundVolume: 1,
  createdAt: 1, upgradesEnabled: false, variantWeights: DEFAULT_VARIANT_WEIGHTS, upgradeCosts: DEFAULT_UPGRADE_COSTS,
});
const card = (n: number) => ({ id: `c${n}`, number: n, name: `Card ${n}`, imageUrl: '', probability: 10, stars: 1 + (n % 5) });

await kvLib.savePack(pack('live', 'published', true));
await kvLib.savePackCards('live', [1, 2, 3, 4].map(card));
await kvLib.savePack(pack('wip', 'draft', false));
await kvLib.savePackCards('wip', [5, 6, 7, 8].map(card));
await kvLib.savePack(pack('retired', 'published', false)); // switched off, but its cards can be held
await kvLib.savePackCards('retired', [9, 10].map(card));
const season = { id: 'sx', name: 'SX', collectionName: 'SX', active: false, status: 'published' as const, createdAt: 1, maxConcurrentPacks: 1, packIds: ['live', 'wip', 'retired'] };
await kvLib.saveSeason(season);

const E = (n: number) => n;
await kvLib.saveCollection('SX', { full: [1, 2, 3, 4, 9, 10].map(E), partial: [1, 2].map(E) });
const board = await getSeasonLeaderboard(season);

ok(board.packs.map(p => p.pack.id).sort().join() === 'live,retired', 'the draft pack is left out, the switched-off published pack stays');
ok(board.values.totalCards === 6, `the season has 6 cards that can exist (got ${board.values.totalCards})`);
const full = board.rows.find(r => r.username === 'full')!;
ok(full.complete && full.setBonus > 0, 'owning every card that can exist completes the season, although a draft pack has more');
ok(!board.rows.find(r => r.username === 'partial')!.complete, 'a partial collection is not complete');
ok(!board.values.cards.has(5) && board.values.cards.has(9), 'draft cards have no value, held cards of an inactive pack do');
// Each live card's chance is out of the live packs only: 4 live + 2 retired cards of equal weight within their own pack.
ok(board.values.cards.get(1)!.pullRate > 0, 'live cards keep a pull rate');

console.log('draft pack checks passed');
