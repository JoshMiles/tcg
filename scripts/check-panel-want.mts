// Checks the Twitch panel's new sections (ROADMAP 34.7): POST /api/twitch/want puts a card on the viewer's Looking for list (the viewer comes
// from the extension token, never the body; the site's store shows the change), and /api/twitch/me gains `wanted`, `wantedMax` and
// `achievements` (matching what the website's own helper says) without losing any existing key. Needs the mock KV (node scripts/mock-kv.cjs);
// refuses anything non-local. Runs in the extension's dev mode (no TWITCH_EXTENSION_SECRET), where any bearer maps through `dev_mock_opaque`.
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
delete process.env.TWITCH_EXTENSION_SECRET;
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const { NextRequest } = await import('next/server');
const kvLib = await import('../lib/kv');
const { kv } = await import('../lib/db');
const sbx = await import('../lib/sandbox');
const db = await import('../lib/db');
const want = await import('../app/api/twitch/want/route');
const meRoute = await import('../app/api/twitch/me/route');
const { getUserSettings } = await import('../lib/user-settings-store');
const { syncAchievements } = await import('../lib/achievements-store');
const { panelAchievements } = await import('../lib/panel-achievements');
const { WANTED_MAX } = await import('../lib/user-settings');
const { setWanted } = await import('../lib/wanted');
const { encodeEntry } = await import('../lib/variants');

await kvLib.seedSeason1();
const box = await sbx.createSandbox({ name: 'Panel want check', source: 'config' });
await db.runInSandbox(box.id, async () => {
  const season = (await kvLib.listSeasons())[0];
  await kvLib.setActiveSeason(season.id);
  const cards = await kvLib.getPackCards('pack1');
  ok(cards.length >= 2, 'the seed season has cards');
  // alice owns every card (so she has completion goals), bob owns one.
  await kvLib.saveCollection(season.collectionName, {
    alice: cards.map(c => encodeEntry(c.number, 'regular')),
    bob: [encodeEntry(cards[0].number, 'regular')],
  });
  await kv.set('twitch_opaque:dev_mock_opaque', 'alice');

  const post = (body: unknown, token = 'x') => new NextRequest('http://localhost/api/twitch/want', {
    method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body),
  });
  const run = async (res: Response) => ({ status: res.status, body: await res.json() });
  const setWant = (body: unknown, token = 'x') => want.POST(post(body, token) as never).then(run);
  const me = async () => run(await meRoute.GET(new NextRequest('http://localhost/api/twitch/me', { headers: { authorization: 'Bearer x' } }) as never));
  const [a, b, c] = cards;

  // /me: new fields in place, every old key still there.
  let m = await me();
  ok(m.status === 200, '/me answers');
  for (const k of ['username', 'seasonId', 'totalCards', 'players', 'rank', 'row', 'next', 'maxCompletion', 'setBonusValue', 'bonus', 'cards', 'serials', 'offers', 'editions', 'favourites', 'favouritesMax', 'badge']) ok(k in m.body, `/me still has ${k}`);
  ok(Array.isArray(m.body.wanted) && m.body.wanted.length === 0 && m.body.wantedMax === WANTED_MAX, '/me starts with an empty Looking for list: ' + JSON.stringify(m.body.wanted));

  // Achievements match the website's helper for the same viewer.
  const ach = m.body.achievements as { earned: number; total: number; latest: { id: string; name: string; detail: string; at: number }[] };
  const site = await syncAchievements('alice');
  ok(ach && ach.earned === site.earned.length && ach.earned > 0, `/me counts what the site says is earned (${ach?.earned} vs ${site.earned.length})`);
  ok(ach.total === site.total && ach.total >= ach.earned, `/me total matches the site's (${ach.total} vs ${site.total})`);
  ok(ach.latest.length > 0 && ach.latest.length <= 4 && ach.latest.every((x, i) => x.id && x.name && x.at > 0 && (i === 0 || x.at <= ach.latest[i - 1].at)), 'the latest few are newest first');
  ok(JSON.stringify(ach) === JSON.stringify(panelAchievements(site)), 'the summary is the helper\'s output for the site view');
  ok(ach.latest.every(x => site.earned.some(e => e.id === x.id && e.title === x.name)), 'the latest names are the site\'s titles');

  // Someone with almost nothing: still gets the field.
  await kv.set('twitch_opaque:dev_mock_opaque', 'bob');
  const bobAch = (await me()).body.achievements;
  ok(bobAch && bobAch.earned < ach.earned, 'a collector with one card has fewer achievements');
  await kv.set('twitch_opaque:dev_mock_opaque', 'alice');

  // The toggle: signed in, well-formed.
  ok((await setWant({ cardNumber: a.number, on: true }, '')).status === 401, 'no token is refused');
  ok((await setWant({ cardNumber: 'x', on: true })).status === 400 && (await setWant({ cardNumber: a.number })).status === 400 && (await setWant({ on: true })).status === 400, 'a malformed body is refused');
  ok((await setWant({ cardNumber: 0, on: true })).status === 400, 'an unknown card number is refused');

  const on = await setWant({ cardNumber: a.number, on: true });
  ok(on.status === 200 && on.body.ok && JSON.stringify(on.body.wanted) === JSON.stringify([a.number]), 'alice puts a card on her list: ' + JSON.stringify(on.body));
  ok(JSON.stringify((await getUserSettings('alice')).wanted) === JSON.stringify([a.number]), 'the site\'s store shows it');
  ok(JSON.stringify((await me()).body.wanted) === JSON.stringify([a.number]), '/me lists it');
  const again = await setWant({ cardNumber: a.number, on: true });
  ok(again.status === 200 && again.body.wanted.length === 1, 'turning on twice keeps one entry');

  // A username in the body is ignored.
  const spoof = await setWant({ cardNumber: b.number, on: true, username: 'bob' });
  ok(spoof.status === 200 && (await getUserSettings('alice')).wanted.includes(b.number) && (await getUserSettings('bob')).wanted.length === 0, 'a username in the body is ignored');

  // The site's own toggle (no `on`) and the panel agree on the same list.
  const flipped = await setWanted('alice', b.number);
  ok(flipped.ok && !flipped.wanted.includes(b.number) && flipped.wanted.includes(a.number), 'the site\'s toggle flips the same list');

  // Off, and the list limit.
  const off = await setWant({ cardNumber: a.number, on: false });
  ok(off.status === 200 && off.body.wanted.length === 0, 'alice takes it off');
  ok((await setWant({ cardNumber: a.number, on: false })).status === 200, 'turning off twice is fine');
  for (let n = 1; n <= WANTED_MAX; n++) ok((await setWant({ cardNumber: 900 + n, on: true })).status === 200, `card ${900 + n} fits on the list`);
  const full = await setWant({ cardNumber: c?.number ?? 950, on: true });
  ok(full.status === 400 && !full.body.ok && /full/i.test(full.body.error), 'a full list refuses another: ' + JSON.stringify(full.body));
  ok((await getUserSettings('alice')).wanted.length === WANTED_MAX, 'a refused card saves nothing');
});
console.log('panel want checks passed');
