// pastSeasonResults: ended seasons only, rank = place in the final standings, newest ended first. Pure; no KV needed.
// Run: npx tsx scripts/check-past-seasons.mts
process.env.KV_REST_API_URL ??= 'http://localhost:4111'; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
const { pastSeasonResults } = await import('../lib/season-wrap');
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const season = (id: string, endedAt?: number) => ({ id, name: id.toUpperCase(), endedAt }) as never;
const snap = (...names: string[]) => ({ standings: names.map((username, i) => ({ username, score: 100 - i })) }) as never;
const r = pastSeasonResults('Amy', [season('a', 10), season('b', 20), season('live'), season('c', 30), season('d', 40)], [snap('ben', 'amy'), snap('amy'), snap('amy'), snap('ben'), null]);
ok(r.map(x => x.seasonId).join() === 'b,a', 'ended seasons with the viewer, newest first, live and absent ones left out');
ok(r[1].rank === 2 && r[1].score === 99 && r[0].rank === 1, 'rank is the place in standings');
console.log('check-past-seasons ok');
