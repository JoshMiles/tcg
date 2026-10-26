// Server-side pulls (ROADMAP Track 13): the roll follows the pack and card odds, a ticket is single-use and bound to the viewer,
// and /api/collection saves what the ticket says whatever the caller sends. Mock KV: node scripts/mock-kv.cjs. Run: npx tsx scripts/check-draw.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const { rollDraw, issueDraw, claimDraw } = await import('../lib/draw');
const kvLib = await import('../lib/kv');
const { NextRequest } = await import('next/server');
const route = await import('../app/api/collection/route');

// ── The roll ──
const mk = (n: number, probability: number, extra: object = {}) => ({ number: n, name: 'C' + n, probability, stars: 1, ...extra }) as never;
const pack = (id: string, weight: number, extra: object = {}) => ({ id, name: id, weight, upgradesEnabled: false, variantWeights: { regular: 100, reverse: 25, full: 5, shiny: 1 }, ...extra }) as never;
ok(rollDraw([]) === null && rollDraw([{ pack: pack('p', 1), cards: [] }]) === null, 'nothing to draw gives null');
const seq = (...xs: number[]) => { let i = 0; return () => xs[i++ % xs.length]; };
const two = [{ pack: pack('a', 3), cards: [mk(1, 1), mk(2, 3)] }, { pack: pack('b', 1), cards: [mk(3, 1)] }];
ok(rollDraw(two, seq(0.1, 0.1))!.pack.id === 'a' && rollDraw(two, seq(0.9, 0.1))!.pack.id === 'b', 'a pack is picked by its weight');
ok(rollDraw(two, seq(0.1, 0.1))!.card.number === 1 && rollDraw(two, seq(0.1, 0.5))!.card.number === 2, 'a card is picked by its probability');
ok(rollDraw(two, seq(0.1, 0.1))!.variant === 'regular', 'a pack without variants always rolls Regular');
const vp = [{ pack: pack('v', 1, { upgradesEnabled: true, disabledVariants: ['shiny'] }), cards: [mk(1, 1), mk(2, 1, { upgradesEnabled: false }), mk(3, 1, { disabledVariants: ['reverse'] })] }];
ok(rollDraw(vp, seq(0, 0, 0.999))!.variant === 'full', 'a high roll lands on the rarest version that is switched on (Shiny is off in the pack)');
ok(rollDraw(vp, seq(0, 0.5, 0.999))!.variant === 'regular', 'a card that opts out of variants is always Regular');
ok(['regular', 'full'].includes(rollDraw(vp, seq(0, 0.99, 0.2))!.variant) && rollDraw(vp, seq(0, 0.99, 0.2))!.variant === 'regular', 'a disabled variant on the card is never rolled');
const counts: Record<string, number> = {};
for (let i = 0; i < 4000; i++) { const r = rollDraw(vp); counts[r!.variant] = (counts[r!.variant] ?? 0) + 1; }
ok(!counts.shiny, 'over 4000 rolls Shiny never appears while it is switched off');

// ── Tickets ──
await kvLib.seedSeason1();
const active = (await kvLib.getActiveSeasonWithPacks())!;
const coll = active.season.collectionName;
const draw = await issueDraw('t1', 'Ann');
ok(draw && draw.cardNumber >= 1, 'a pull is rolled and a ticket stored');
ok((await claimDraw('t1', 'bob')) === null, 'another viewer cannot claim it');
const t = await claimDraw('t1', 'ANN');
ok(t && t.username === 'ann' && t.cardNumber === draw!.cardNumber && t.collectionName === coll, 'the right viewer claims it');
ok((await claimDraw('t1', 'ann')) === null, 'a ticket works once');
ok((await claimDraw('never', 'ann')) === null, 'an unknown ticket is refused');

// ── The route ──
const post = (body: unknown) => route.POST(new NextRequest('http://localhost/api/collection?name=' + coll, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }));
const forged = await post({ pull: { username: 'mallory', cardNumber: 25, entry: 25, cardName: 'Free card', stars: 5, packName: 'x' } });
ok(forged.status === 401 && !(await kvLib.getCollection(coll)).mallory, 'a pull with no ticket is refused and nothing is saved');
const wrong = await post({ pull: { username: 'mallory', ticket: 'nope', cardNumber: 25, entry: 25 } });
ok(wrong.status === 401, 'a made-up ticket is refused');
const d2 = await issueDraw('t2', 'carl');
const sent = await post({ pull: { username: 'carl', ticket: 't2', cardNumber: 25, entry: 25, cardName: 'Lies', stars: 5, packName: 'Lies' } });
const body = await sent.json();
const after = (await kvLib.getCollection(coll)).carl ?? [];
ok(sent.status === 200 && after.length === 1, 'a real ticket saves exactly one print');
const { decodeEntry } = await import('../lib/variants');
ok(decodeEntry(after[0]).cardNumber === d2!.cardNumber && decodeEntry(after[0]).variant === d2!.variant, 'what is saved is what the ticket says, not what the caller sent');
ok(Array.isArray(body.owned), 'the reply carries the new collection');
const again = await post({ pull: { username: 'carl', ticket: 't2', cardNumber: 1, entry: 1 } });
ok(again.status === 401 && ((await kvLib.getCollection(coll)).carl ?? []).length === 1, 'replaying a ticket adds nothing');
const stolen = await (async () => { await issueDraw('t3', 'dora'); return post({ pull: { username: 'mallory', ticket: 't3' } }); })();
ok(stolen.status === 401, "someone else's ticket cannot be used for another viewer");
// The overlay sends only { pull: { username, ticket } } (no collection); a leftover `data` beside a pull is ignored, and odd types are refused.
await issueDraw('t4', 'eve');
const lean = await post({ pull: { username: 'eve', ticket: 't4' }, data: { mallory: [1, 2, 3] } });
ok(lean.status === 200 && ((await kvLib.getCollection(coll)).eve ?? []).length === 1 && !(await kvLib.getCollection(coll)).mallory, 'a pull with just the viewer and ticket saves, and a stray data is ignored');
const odd = await Promise.all([{ username: 5, ticket: 't4' }, { username: 'eve', ticket: { a: 1 } }].map(p => post({ pull: p }).then(r => r.status)));
ok(odd.every(s => s === 401), 'a non-string viewer or ticket is refused, not an error');
// Outside a real request the staff check cannot read cookies and throws; either way the write is refused.
const overwrite = await post({ data: { mallory: [1, 2, 3] } }).then(r => r.status, () => 500);
ok(overwrite === 401 || overwrite === 500, 'replacing a whole collection needs an admin');
ok(!(await kvLib.getCollection(coll)).mallory, 'and nothing was written');
const del = await route.DELETE(new NextRequest('http://localhost/api/collection?name=' + coll, { method: 'DELETE' })).then(r => r.status, () => 500);
ok((del === 401 || del === 500) && ((await kvLib.getCollection(coll)).carl ?? []).length === 1, 'resetting a collection needs an admin');

console.log('draw checks passed');
