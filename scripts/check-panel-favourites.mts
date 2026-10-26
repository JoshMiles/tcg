// Checks the Twitch panel's collection view data (ROADMAP 34.6): POST /api/twitch/favourite only favourites the viewer's own editions
// (the viewer comes from the extension token, never the body), and /api/twitch/me, /trades and /leaderboard gain NEW fields without
// losing any existing key. Needs the mock KV (node scripts/mock-kv.cjs); refuses anything non-local.
// Runs in the extension's dev mode (no TWITCH_EXTENSION_SECRET), where any bearer maps through the opaque id `dev_mock_opaque`.
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
delete process.env.TWITCH_EXTENSION_SECRET;
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const { NextRequest } = await import('next/server');
const kvLib = await import('../lib/kv');
const { kv } = await import('../lib/db');
const ser = await import('../lib/serials');
const sbx = await import('../lib/sandbox');
const db = await import('../lib/db');
const fav = await import('../app/api/twitch/favourite/route');
const meRoute = await import('../app/api/twitch/me/route');
const tradesRoute = await import('../app/api/twitch/trades/route');
const boardRoute = await import('../app/api/twitch/leaderboard/route');
const { getUserSettings } = await import('../lib/user-settings-store');
const { CHANNEL_LOGIN } = await import('../lib/site');
const { encodeEntry } = await import('../lib/variants');

await kvLib.seedSeason1();
const box = await sbx.createSandbox({ name: 'Panel favourites check', source: 'config' });
await db.runInSandbox(box.id, async () => {
  const season = (await kvLib.listSeasons())[0];
  await kvLib.setActiveSeason(season.id);
  const c = season.collectionName;
  const [a, b] = await kvLib.getPackCards('pack1');
  const aEntry = encodeEntry(a.number, 'regular');
  await kvLib.saveCollection(c, { alice: [aEntry, aEntry, aEntry], bob: [encodeEntry(b.number, 'regular'), encodeEntry(b.number, 'regular')] });
  await ser.backfillSerials(c, await kvLib.getCollection(c));
  await kv.set('twitch_opaque:dev_mock_opaque', 'alice');
  const mine = await ser.getOwnerCopies(c, 'alice');
  const bobs = await ser.getOwnerCopies(c, 'bob');
  ok(mine.length === 3 && mine.every(x => x.uid) && bobs.length === 2 && bobs[0].uid, 'the ledger numbered the editions');

  const post = (body: unknown, token = 'x') => new NextRequest('http://localhost/api/twitch/favourite', {
    method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body),
  });
  const get = (path: string, token = 'x') => new NextRequest('http://localhost/api/twitch/' + path, { headers: token ? { authorization: 'Bearer ' + token } : {} });
  const run = async (res: Response) => ({ status: res.status, body: await res.json() });
  const setFav = (body: unknown, token = 'x') => fav.POST(post(body, token) as never).then(run);
  const me = async () => run(await meRoute.GET(get('me') as never));

  // New fields on /me, and nothing that was there is gone.
  let m = await me();
  for (const k of ['username', 'seasonId', 'totalCards', 'players', 'rank', 'row', 'next', 'maxCompletion', 'setBonusValue', 'bonus', 'cards', 'serials', 'offers']) ok(k in m.body, `/me still has ${k}`);
  const eds = m.body.editions[aEntry] as { n: number; uid: number; date: string; origin: string }[];
  ok(Array.isArray(eds) && eds.length === 3 && eds.every((e, i) => e.n && e.uid === mine.find(x => x.n === e.n)?.uid && e.date && e.origin && (i === 0 || e.n > eds[i - 1].n)), '/me lists the viewer\'s editions, lowest first: ' + JSON.stringify(m.body.editions));
  ok(Array.isArray(m.body.favourites) && m.body.favourites.length === 0 && m.body.favouritesMax === 50 && m.body.badge === null, '/me starts with no favourites and no badge');

  // The toggle: signed in, well-formed, and only for editions the viewer holds.
  ok((await setFav({ uid: mine[0].uid, on: true }, '')).status === 401, 'no token is refused');
  ok((await setFav({ uid: 'x', on: true })).status === 400 && (await setFav({ uid: mine[0].uid })).status === 400, 'a malformed body is refused');
  const on = await setFav({ uid: mine[0].uid, on: true });
  ok(on.status === 200 && on.body.ok && on.body.favourite === true, 'alice favourites her edition: ' + JSON.stringify(on.body));
  m = await me();
  ok(m.body.favourites.length === 1 && m.body.favourites[0] === mine[0].uid, '/me lists the favourite');
  const t = await run(await tradesRoute.GET(get('trades') as never));
  ok(t.status === 200 && t.body.favourites.includes(mine[0].uid), '/trades lists the favourite for the pickers');
  for (const k of ['username', 'seasonId', 'enabled', 'closedReason', 'limits', 'prints', 'incoming', 'outgoing', 'board', 'recent']) ok(k in t.body, `/trades still has ${k}`);
  ok(t.body.badges && typeof t.body.badges === 'object', '/trades has a badges map');

  const other = await setFav({ uid: bobs[0].uid, on: true });
  ok(other.status === 400 && !other.body.ok && other.body.error, 'someone else\'s edition is refused: ' + JSON.stringify(other.body));
  ok((await getUserSettings('bob')).favourites.length === 0 && !(await getUserSettings('alice')).favourites.includes(bobs[0].uid), 'a refused favourite saves nothing');
  const gone = await setFav({ uid: 999_999_999, on: true });
  ok(gone.status === 400 && !gone.body.ok, 'an edition that does not exist is refused');
  // A username in the body is ignored: it is still alice's edition that changes, and bob's settings stay untouched.
  const spoof = await setFav({ uid: mine[1].uid, on: true, username: 'bob' });
  ok(spoof.status === 200 && (await getUserSettings('alice')).favourites.includes(mine[1].uid) && (await getUserSettings('bob')).favourites.length === 0, 'a username in the body is ignored');

  // Taking a favourite off works, and leaves the other one.
  const off = await setFav({ uid: mine[0].uid, on: false });
  ok(off.status === 200 && off.body.favourite === false, 'alice takes the mark off');
  m = await me();
  ok(m.body.favourites.length === 1 && m.body.favourites[0] === mine[1].uid, '/me shows only the remaining favourite');

  // Leaderboard and the viewer's own badge: the channel's account shows as Streamer, everyone else has none.
  const board = await run(await boardRoute.GET(get('leaderboard') as never));
  for (const k of ['seasonId', 'seasonName', 'totalCards', 'players', 'rows', 'me', 'values']) ok(k in board.body, `/leaderboard still has ${k}`);
  ok(board.body.badges && board.body.badges[CHANNEL_LOGIN.toLowerCase()] === 'streamer' && !board.body.badges.alice, '/leaderboard has the badges map');
  await kv.set('twitch_opaque:dev_mock_opaque', CHANNEL_LOGIN.toLowerCase());
  ok((await me()).body.badge === 'streamer', '/me carries the viewer\'s own badge');
});
console.log('panel favourites checks passed');
