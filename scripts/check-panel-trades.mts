// Checks the Twitch panel's trade routes (GET/POST /api/twitch/trades): the viewer comes from the extension token, offers are priced,
// accept / decline / cancel and create go through the shared engine. Needs the mock KV (node scripts/mock-kv.cjs); refuses anything non-local.
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
const route = await import('../app/api/twitch/trades/route');
const trades = await import('../lib/trades');
const { encodeEntry } = await import('../lib/variants');

await kvLib.seedSeason1();
const box = await sbx.createSandbox({ name: 'Panel trades check', source: 'config' });
await db.runInSandbox(box.id, async () => {
  const season = (await kvLib.listSeasons())[0];
  await kvLib.setActiveSeason(season.id);
  const c = season.collectionName;
  const [a, b] = await kvLib.getPackCards('pack1');
  await kvLib.saveCollection(c, { alice: [encodeEntry(a.number, 'regular'), encodeEntry(a.number, 'regular')], bob: [encodeEntry(b.number, 'regular'), encodeEntry(b.number, 'regular')] });
  await ser.backfillSerials(c, await kvLib.getCollection(c));
  await kv.set('twitch_opaque:dev_mock_opaque', 'alice');
  await kv.del('trade:cd:alice'); await kv.del('trade:cd:bob');

  const req = (method: string, body?: unknown, token = 'x') => new NextRequest('http://localhost/api/twitch/trades', {
    method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined,
  });
  const call = async (r: Request) => { const res = await (r.method === 'GET' ? route.GET(r as never) : route.POST(r as never)); return { status: res.status, body: await res.json() }; };

  ok((await call(req('GET', undefined, ''))).status === 401, 'no token is refused');

  // Bob offers alice 2 of card b for 1 of card a (made through the engine, as the website would).
  const made = await trades.createTrade({ seasonId: season.id, from: 'bob', kind: 'direct', to: 'alice', give: [{ cardNumber: b.number, variant: 'regular', count: 2 }], get: [{ cardNumber: a.number, variant: 'regular', count: 1 }] });
  ok(made.ok, 'bob can offer');
  let g = await call(req('GET'));
  ok(g.status === 200 && g.body.enabled === true, 'GET works');
  ok(g.body.incoming.length === 1 && g.body.incoming[0].from === 'bob' && g.body.incoming[0].canTake === true, 'alice sees the offer and can take it');
  ok(g.body.incoming[0].givePts > 0 && g.body.incoming[0].getPts > 0, 'both sides are priced');

  // The body can never pick the viewer.
  const spoof = await call(req('POST', { action: 'cancel', id: g.body.incoming[0].id, username: 'bob' }));
  ok(!spoof.body.ok && spoof.status >= 400, 'alice cannot cancel bob\'s offer by naming him');

  // Declining returns the escrow to bob; accepting swaps.
  const declined = await call(req('POST', { action: 'decline', id: g.body.incoming[0].id }));
  ok(declined.status === 200, 'decline works');
  ok(((await kvLib.getCollection(c)).bob ?? []).length === 2, 'bob got his cards back');

  await kv.del('trade:cd:bob');
  const again = await trades.createTrade({ seasonId: season.id, from: 'bob', kind: 'direct', to: 'alice', give: [{ cardNumber: b.number, variant: 'regular', count: 1 }], get: [{ cardNumber: a.number, variant: 'regular', count: 1 }] });
  ok(again.ok, 'bob offers again');
  g = await call(req('GET'));
  const acc = await call(req('POST', { action: 'accept', id: g.body.incoming[0].id }));
  ok(acc.status === 200, 'accept works: ' + JSON.stringify(acc.body));
  const data = await kvLib.getCollection(c);
  ok((data.alice ?? []).filter(e => e === encodeEntry(b.number, 'regular')).length === 1 && (data.bob ?? []).filter(e => e === encodeEntry(a.number, 'regular')).length === 1, 'the swap happened');

  // Alice makes a listing, sees it under her open offers, and cancels it.
  await kv.del('trade:cd:alice');
  const created = await call(req('POST', { action: 'create', kind: 'listing', give: [{ cardNumber: a.number, variant: 'regular', count: 1 }], get: [{ cardNumber: b.number, variant: 'regular', count: 1 }], note: 'hi' }));
  ok(created.status === 200, 'create listing: ' + JSON.stringify(created.body));
  g = await call(req('GET'));
  ok(g.body.outgoing.length === 1 && g.body.outgoing[0].kind === 'listing', 'the listing shows under open offers');
  const bad = await call(req('POST', { action: 'create', kind: 'listing', give: [{ cardNumber: a.number, variant: 'shiny', count: 5 }], get: [{ cardNumber: b.number, variant: 'regular', count: 1 }] }));
  ok(bad.status >= 400, 'offering cards you do not own is refused');
  const cx = await call(req('POST', { action: 'cancel', id: g.body.outgoing[0].id }));
  ok(cx.status === 200, 'cancel works');
  ok((await call(req('POST', { action: 'nope' }))).status === 400, 'an unknown action is refused');
});
await sbx.deleteSandbox(box.id);
console.log('panel trades checks passed');
