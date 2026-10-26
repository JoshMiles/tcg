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
  // Listing alerts: a matching board listing is flagged and sorted first; a counter goes back to the offerer and closes the original.
  for (let i = 0; i < 3; i++) await kvLib.addCollectionEntry(c, 'bob', encodeEntry(b.number, 'regular'), 'grant');
  await kv.del('trade:cd:bob');
  const bobList = await trades.createTrade({ seasonId: season.id, from: 'bob', kind: 'listing', give: [{ cardNumber: b.number, variant: 'regular', count: 1 }], get: [{ cardNumber: a.number, variant: 'regular', count: 1 }] });
  ok(bobList.ok, 'bob lists a card');
  g = await call(req('GET'));
  ok(g.body.board.length >= 1 && g.body.board.every((t: { alert: boolean }) => t.alert === false), 'no alerts set: nothing is flagged');
  const store = await import('../lib/user-settings-store');
  await store.saveUserSettings('alice', { watches: [{ card: b.number, variant: 'regular' }] });
  g = await call(req('GET'));
  ok(g.body.board[0].alert === true && g.body.board[0].from === 'bob', 'a listing that gives a watched card is flagged and listed first');
  await kv.del('trade:cd:bob');
  const direct = await trades.createTrade({ seasonId: season.id, from: 'bob', kind: 'direct', to: 'alice', give: [{ cardNumber: b.number, variant: 'regular', count: 1 }], get: [{ cardNumber: a.number, variant: 'regular', count: 1 }] });
  ok(direct.ok, 'bob makes a direct offer: ' + JSON.stringify(direct));
  g = await call(req('GET'));
  await kv.del('trade:cd:alice');
  const counter = await call(req('POST', { action: 'counter', id: g.body.incoming[0].id, give: [{ cardNumber: a.number, variant: 'regular', count: 1 }], get: [{ cardNumber: b.number, variant: 'regular', count: 1 }], note: 'how about this' }));
  ok(counter.status === 200, 'counter works: ' + JSON.stringify(counter.body));
  g = await call(req('GET'));
  ok(g.body.incoming.length === 0 && g.body.outgoing.some((t: { to: string; counter: boolean }) => t.to === 'bob' && t.counter), 'the original is closed and the counter is an open offer to bob');
  ok((await call(req('POST', { action: 'nope' }))).status === 400, 'an unknown action is refused');

  // Choosing editions (ROADMAP 34.5): GET lists the viewer's own editions, a chosen edition is the one that moves, and one they do not hold is refused.
  type Ed = { id: string; n: number };
  const aEntry = encodeEntry(a.number, 'regular');
  for (let i = 0; i < 3; i++) await kvLib.addCollectionEntry(c, 'alice', aEntry, 'grant');
  await kvLib.addCollectionEntry(c, 'alice', encodeEntry(b.number, 'regular'), 'grant');
  await kv.del('trade:cd:alice'); await kv.del('trade:cd:bob');
  g = await call(req('GET'));
  let mine = g.body.prints[aEntry] as Ed[];
  ok(Array.isArray(mine) && mine.length >= 3 && mine.every(p => p.id && p.n > 0), 'GET lists the viewer\'s editions: ' + JSON.stringify(g.body.prints));
  const oldest = mine[0];
  const picked = await call(req('POST', { action: 'create', kind: 'listing', give: [{ cardNumber: a.number, variant: 'regular', count: 1, ids: [oldest.id] }], get: [{ cardNumber: b.number, variant: 'regular', count: 1 }] }));
  ok(picked.status === 200, 'a listing with a chosen edition is made: ' + JSON.stringify(picked.body));
  g = await call(req('GET'));
  const pickedTrade = g.body.outgoing.find((t: { give: { ids?: string[] }[] }) => t.give[0].ids?.[0] === oldest.id);
  ok(pickedTrade, 'the offer names the chosen edition');
  ok(!g.body.prints[aEntry].some((p: Ed) => p.id === oldest.id), 'the chosen edition left the viewer');
  ok((await call(req('POST', { action: 'cancel', id: pickedTrade.id }))).status === 200, 'cancel returns it');
  const bobPrint = (await ser.getOwnerCopies(c, 'bob')).find(x => x.card === b.number)!;
  await kv.del('trade:cd:alice');
  const stolen = await call(req('POST', { action: 'create', kind: 'listing', give: [{ cardNumber: b.number, variant: 'regular', count: 1, ids: [bobPrint.id] }], get: [{ cardNumber: a.number, variant: 'regular', count: 1 }] }));
  ok(stolen.status >= 400, 'an edition someone else holds cannot be offered: ' + JSON.stringify(stolen.body));

  // Accepting with a choice: the edition the taker names is the one the offerer receives; a bad shape or an edition they do not hold is refused.
  await kv.del('trade:cd:bob');
  const bobAsk = await trades.createTrade({ seasonId: season.id, from: 'bob', kind: 'listing', give: [{ cardNumber: b.number, variant: 'regular', count: 1 }], get: [{ cardNumber: a.number, variant: 'regular', count: 1 }] });
  ok(bobAsk.ok, 'bob lists a card for card a');
  const askId = bobAsk.ok ? bobAsk.trade.id : '';
  g = await call(req('GET'));
  mine = g.body.prints[aEntry] as Ed[];
  const mid = mine[1];
  ok((await call(req('POST', { action: 'accept', id: askId, getIds: 'nope' }))).status === 400, 'a getIds of the wrong shape is refused');
  ok((await call(req('POST', { action: 'accept', id: askId, getIds: { [aEntry]: [bobPrint.id] } }))).status >= 400, 'an edition the taker does not hold is refused');
  ok((await trades.listOpenTrades()).some(t => t.id === askId), 'the refused accept leaves the listing open');
  const chosen = await call(req('POST', { action: 'accept', id: askId, getIds: { [aEntry]: [mid.id] } }));
  ok(chosen.status === 200, 'accept with a chosen edition: ' + JSON.stringify(chosen.body));
  ok((await ser.getOwnerCopies(c, 'bob')).some(x => x.id === mid.id), 'bob received the edition alice chose');

  // Reversed by staff: the trade keeps its status and the panel gets a `reversed` flag.
  g = await call(req('GET'));
  ok(g.body.recent.every((t: { reversed: unknown }) => t.reversed === false), 'nothing is reversed yet');
  ok((await trades.reverseTrade(askId, { login: 'staff1', role: 'mod' }, 'check')).ok, 'staff reverse the trade');
  g = await call(req('GET'));
  const rev = g.body.recent.find((t: { id: string }) => t.id === askId);
  ok(rev && rev.reversed === true && rev.status === 'accepted', 'the reversed trade is flagged: ' + JSON.stringify(rev));
});
await sbx.deleteSandbox(box.id);
console.log('panel trades checks passed');
