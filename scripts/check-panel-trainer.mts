// Checks the Twitch panel's trainer card route (POST /api/twitch/trainer): the viewer comes from the extension token, one Regular edition
// is spent and the buff starts (the rules live in useTrainerCard).
// Needs the mock KV (node scripts/mock-kv.cjs); refuses anything non-local. Runs in the extension's dev mode (no TWITCH_EXTENSION_SECRET).
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
const route = await import('../app/api/twitch/trainer/route');
const buffs = await import('../lib/buffs');
const { encodeEntry } = await import('../lib/variants');

await kvLib.seedSeason1();
const box = await sbx.createSandbox({ name: 'Panel trainer check', source: 'config' });
await db.runInSandbox(box.id, async () => {
  const season = (await kvLib.listSeasons())[0];
  await kvLib.setActiveSeason(season.id);
  const c = season.collectionName;
  const cards = await kvLib.getPackCards('pack1');
  const plain = cards[0];
  await buffs.upsertBuffDef({ id: 'pt-pk', name: 'Pack Surge', type: 'extra-pack', magnitude: 1, duration: { unit: 'streams', n: 1 }, stack: 'reject', scope: 'self' });
  const trainerNo = Math.max(...cards.map(x => x.number)) + 1;
  await kvLib.savePackCards('pack1', [...cards, { id: 'pt-c', number: trainerNo, name: 'Panel Coach', imageUrl: '/a/t.png', probability: 5, stars: 3, kind: 'trainer', buffId: 'pt-pk' }]);
  await kvLib.saveCollection(c, { alice: [encodeEntry(trainerNo, 'regular'), encodeEntry(trainerNo, 'regular'), encodeEntry(plain.number, 'regular')], bob: [encodeEntry(trainerNo, 'regular')] });
  await kv.set('twitch_opaque:dev_mock_opaque', 'alice');

  const req = (body?: unknown, token = 'x') => new NextRequest('http://localhost/api/twitch/trainer', {
    method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined,
  });
  const call = async (r: Request) => { const res = await route.POST(r as never); return { status: res.status, body: await res.json() }; };
  const count = async (u: string) => ((await kvLib.getCollection(c))[u] ?? []).filter(e => e === encodeEntry(trainerNo, 'regular')).length;

  ok((await call(req({ cardNumber: trainerNo }, ''))).status === 401, 'no token is refused');
  ok((await call(req({ cardNumber: 'x' }))).status === 400, 'a bad card number is refused');

  const col = await call(req({ cardNumber: plain.number, seasonId: season.id }));
  ok(col.status === 400 && !col.body.ok && col.body.error, 'a collector card is refused: ' + JSON.stringify(col.body));
  ok(!(await call(req({ cardNumber: trainerNo + 50 }))).body.ok, 'a card that does not exist is refused');

  // The body can never pick the viewer: bob's copy is not alice's to spend, and a username in the body is ignored.
  const spoof = await call(req({ cardNumber: trainerNo, username: 'bob' }));
  ok(spoof.status === 200 && await count('alice') === 1 && await count('bob') === 1, 'a username in the body is ignored');
  ok(!(await buffs.hasExtraPackCredit('bob')), 'bob got no buff');

  const used = await call(req({ cardNumber: trainerNo, seasonId: season.id }));
  ok(used.status === 400 && /already active/.test(used.body.error), 'a second use while the buff is active is refused: ' + JSON.stringify(used.body));
  ok(await count('alice') === 1, 'a refused use spends nothing');

  await kv.set('twitch_opaque:dev_mock_opaque', 'carol');
  const none = await call(req({ cardNumber: trainerNo }));
  ok(none.status === 400 && !none.body.ok, 'not owned is refused');
  ok(await buffs.hasExtraPackCredit('alice'), 'alice has the buff from the first use');
});
console.log('panel trainer checks passed');
