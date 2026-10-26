// Checks the batched reads (ROADMAP 48.4): getUserProfiles (order, missing names, duplicates, case, one mget per 100 names, sandbox
// keys) and getAvatars reading only the names asked for (hmget, never hgetall).
// Needs the mock KV (node scripts/mock-kv.cjs), which counts commands at /__stats; refuses anything non-local.  Run: npx tsx scripts/check-profiles-batch.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
delete process.env.TWITCH_CLIENT_ID; delete process.env.TWITCH_CLIENT_SECRET; // getAvatars must not reach for Twitch

const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const eq = (a: unknown, b: unknown, msg: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
const stats = async (reset = true): Promise<Record<string, number>> => (await fetch(`${url}/__stats${reset ? '?reset' : ''}`)).json();

const { kv, runInSandbox } = await import('../lib/db');
const { getUserProfiles, saveUserProfile } = await import('../lib/kv');
const { getAvatars } = await import('../lib/avatars');

const names = Array.from({ length: 250 }, (_, i) => `viewer${i}`);
for (const n of names.filter((_, i) => i % 2 === 0)) await saveUserProfile({ username: n, displayName: n.toUpperCase(), createdAt: 1 });

await stats();
const got = await getUserProfiles(names);
const s = await stats();
eq(s.mget, 3, '250 names are read with three mget commands (100 per chunk)');
ok(!s.get, 'no single get per name');
eq([...got.keys()], names, 'results keep the order asked for');
eq(got.get('viewer4')?.displayName, 'VIEWER4', 'a stored profile comes back');
eq(got.get('viewer5'), null, 'a missing profile is null');
eq(got.size, 250, 'every name has an entry');

const mixed = await getUserProfiles(['Viewer2', 'VIEWER2', 'viewer2', 'nobody']);
eq([...mixed.keys()], ['viewer2', 'nobody'], 'names are lowercased and deduplicated');
ok(mixed.get('viewer2'), 'a mixed-case name finds the lowercase profile');

await stats();
eq((await getUserProfiles([])).size, 0, 'no names, no result');
eq(await stats(), {}, 'no names, no KV command');

await runInSandbox('batchtest', async () => {
  await saveUserProfile({ username: 'sbxuser', displayName: 'S', createdAt: 2 });
  eq((await getUserProfiles(['sbxuser', 'viewer0'])).get('sbxuser')?.displayName, 'S', 'a sandbox reads its own profiles');
  eq((await getUserProfiles(['viewer0'])).get('viewer0'), null, 'a sandbox does not see production profiles');
});
eq((await getUserProfiles(['sbxuser'])).get('sbxuser'), null, 'production does not see sandbox profiles');

// Avatars: only the asked-for names are read, and the hash is never read whole.
const now = Date.now();
await kv.hset('twitch:avatars', Object.fromEntries(names.map(n => [n, { url: `https://img/${n}-300x300.png`, at: now }])));
await stats();
const av = await getAvatars(['viewer1', 'Viewer7', 'viewer1']);
const a = await stats();
eq(av, { viewer1: 'https://img/viewer1-300x300.png', viewer7: 'https://img/viewer7-300x300.png' }, 'avatars for exactly the names asked');
eq([a.hmget, a.hgetall ?? 0], [1, 0], 'one hmget, no hgetall');

console.log('ok: batched profile and avatar reads');
