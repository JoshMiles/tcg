// Checks the per-season collection hash (ROADMAP 48.7): the one-time move from the old `tcg_<name>` string, reads and writes that touch
// only the viewers they name, the whole-collection save diffing, and the copy ledger / escrow staying conserved across the writers.
// Needs the mock KV (npm run check starts it); refuses anything non-local.  Run: npx tsx scripts/check-collection-hash.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';

const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const eq = (a: unknown, b: unknown, msg: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
const sorted = (o: Record<string, unknown> | null) => JSON.stringify(Object.fromEntries(Object.entries(o ?? {}).sort(([a], [b]) => (a < b ? -1 : 1))));

const { kv, prodKv } = await import('../lib/db');
const kvLib = await import('../lib/kv');
const ser = await import('../lib/serials');
const trades = await import('../lib/trades');
const tradeCore = await import('../lib/trade-core');
const upgrade = await import('../lib/upgrade');
const move = await import('../lib/account-move');
const { encodeEntry } = await import('../lib/variants');
const E = (n: number, v: 'regular' | 'reverse' | 'full' | 'shiny' = 'regular') => encodeEntry(n, v);

// Every request body sent to the KV, so a check can say which keys and fields a write touched.
const sent: string[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  sent.push(String(init?.body ?? ''));
  return realFetch(input, init);
}) as typeof fetch;
const mark = () => sent.length;
const since = (m: number) => sent.slice(m);
const writes = (m: number, cmd: string, key: string) => since(m).filter(b => new RegExp(`"${cmd}"`, 'i').test(b) && b.includes(`"${key}"`));

// ── the move from the old string ──
const original = { alice: [1, 1, 2], bob: [3], carol: [], dave: [4] };
await prodKv.set('tcg_MIG', original);
let m = mark();
await Promise.all([kvLib.ensureMigrated('MIG'), kvLib.ensureMigrated('MIG')]); // two first uses at once
eq(sorted(await prodKv.hgetall('coll:MIG')), sorted({ alice: [1, 1, 2], bob: [3], dave: [4] }), 'the hash holds every viewer with cards, as arrays');
ok((await prodKv.exists('tcg_MIG')) === 0 && (await prodKv.exists('coll:MIG:new')) === 0, 'the string is gone and no half-built hash is left');
eq(await prodKv.get('tcg_MIG:old'), original, 'the old string is kept unchanged as :old');
ok(since(m).filter(b => /"rename"/i.test(b) && b.includes('"tcg_MIG"')).length === 1, 'two first uses at once moved the season once');
ok(writes(m, 'hset', 'coll:MIG').length === 0 && writes(m, 'hset', 'coll:MIG:new').length > 0, 'the hash is built beside the live key and renamed into place (a reader never sees it half built)');
const logged = (await prodKv.hgetall<Record<string, { viewers: number; entries: number; at: number }>>('collmig'))?.MIG;
ok(logged?.viewers === 3 && logged.entries === 5 && logged.at > 0, 'the move is logged with its counts');
eq(sorted(await kvLib.getCollection('MIG')), sorted({ alice: [1, 1, 2], bob: [3], dave: [4] }), 'getCollection reads the hash');
eq(await kvLib.getUserCards('MIG', 'alice'), [1, 1, 2], 'getUserCards reads one viewer');
eq(await kvLib.getUserCards('MIG', 'nobody'), [], 'a viewer with no cards reads as an empty list');

kvLib.forgetMigrations(); // as if another instance starts up
m = mark();
await kvLib.ensureMigrated('MIG');
ok(writes(m, 'rename', 'tcg_MIG').length === 0 && since(m).every(b => !/"(hset|del|rename)"/i.test(b)), 'moving again does nothing: no writes');
eq(await prodKv.get('tcg_MIG:old'), original, 'and :old is untouched');
const listed = (await kvLib.listCollectionMigrations()).find(x => x.collection === 'MIG');
ok(listed?.oldCopy === true && listed.viewers === 3, 'Data health can list the move and its old copy');

await prodKv.set('tcg_EMPTY', {});
ok((await kvLib.getCollection('EMPTY')) !== undefined && Object.keys(await kvLib.getCollection('EMPTY')).length === 0, 'an empty season reads as empty');
ok((await prodKv.exists('coll:EMPTY')) === 0 && (await prodKv.exists('tcg_EMPTY:old')) === 1, 'an empty season moves to nothing and the string is still kept');
eq(await kvLib.getCollection('NEVER_EXISTED'), {}, 'a season that never had a string reads as empty');
ok((await prodKv.exists('coll:NEVER_EXISTED')) === 0 && (await prodKv.exists('tcg_NEVER_EXISTED:old')) === 0, 'and creates nothing');

// A move that cannot happen is not remembered as done.
await prodKv.set('tcg_BAD', [1, 2, 3]);
let refused = false;
try { await kvLib.getCollection('BAD'); } catch { refused = true; }
ok(refused, 'a string that is not a collection is refused');
ok((await prodKv.exists('coll:BAD')) === 0 && (await prodKv.exists('tcg_BAD')) === 1, 'and nothing was changed');
await prodKv.set('tcg_BAD', { zed: [7] });
eq(await kvLib.getCollection('BAD'), { zed: [7] }, 'after the string is fixed the next read moves it (a failure is not remembered)');

// ── updateCollection touches only the viewers it names ──
await kvLib.saveCollection('UPD', { a: [1], b: [2], c: [3] });
m = mark();
const got = await kvLib.updateCollection('UPD', ['a', 'b'], cards => ({ result: `saw ${Object.keys(cards).join()}`, cards: { a: [...cards.a, 9] } }));
eq(got, 'saw a,b', 'the caller gets the result and sees only the viewers it loaded');
eq(sorted(await kvLib.getCollection('UPD')), sorted({ a: [1, 9], b: [2], c: [3] }), 'one viewer changed');
const hs = writes(m, 'hset', 'coll:UPD');
ok(hs.length === 1 && hs[0].includes('"a"') && !hs[0].includes('"b"') && !hs[0].includes('"c"'), 'only the changed viewer was written');
m = mark();
await kvLib.updateCollection('UPD', ['a'], () => ({ result: null })); // a refusal writes nothing
ok(since(m).every(b => !/"(hset|hdel|del)"/i.test(b)), 'no cards means no writes');
await kvLib.updateCollection('UPD', ['b'], () => ({ result: null, cards: { b: [] } }));
eq(sorted(await kvLib.getCollection('UPD')), sorted({ a: [1, 9], c: [3] }), 'an emptied viewer loses its field');
let threw = false;
try { await kvLib.updateCollection('UPD', ['a'], () => ({ result: null, cards: { zed: [1] } })); } catch { threw = true; }
ok(threw && !(await kvLib.getCollection('UPD')).zed, 'writing a viewer that was not loaded is refused');
await Promise.all(Array.from({ length: 12 }, (_, i) => kvLib.addCollectionEntry('UPD', i % 2 ? 'a' : 'd', 20 + i)));
const after = await kvLib.getCollection('UPD');
ok(after.a.length === 2 + 6 && after.d.length === 6 && sorted({ c: after.c }) === sorted({ c: [3] }), 'twelve pulls at once lose none (the lock still serialises them)');

// ── saveCollection diffs ──
await kvLib.saveCollection('UPD', { a: after.a, c: [3, 4], e: [5] });
eq(sorted(await kvLib.getCollection('UPD')), sorted({ a: after.a, c: [3, 4], e: [5] }), 'a whole-collection save leaves exactly that data (d is removed)');
m = mark();
await kvLib.saveCollection('UPD', { a: after.a, c: [3, 4], e: [5, 6] });
const hs2 = writes(m, 'hset', 'coll:UPD');
ok(hs2.length === 1 && hs2[0].includes('"e"') && !hs2[0].includes('"a"') && !hs2[0].includes('"c"'), 'a whole-collection save writes only what differs');

// ── the ledger, print counts and escrow stay conserved across the writers ──
await kvLib.seedSeason1();
const pack = (await kvLib.getPack('pack1'))!;
await kvLib.savePack({ ...pack, upgradesEnabled: true } as never);
const season = (await kvLib.listSeasons())[0];
const c = season.collectionName;
await trades.saveTradeSettings({ ...tradeCore.DEFAULT_TRADE_SETTINGS, cooldownSeconds: 0, maxOpenPerUser: 3 });
await prodKv.set(`tcg_${c}`, { alice: [E(1), E(1), E(2)], bob: [E(1), E(3)] }); // a season still in the old layout
await ser.backfillSerials(c, await kvLib.getCollection(c));
const live = async () => Object.keys((await kv.hgetall(`copies:${c}:idx`)) ?? {}).length;
const consistent = async (where: string) => {
  const data = await kvLib.getCollection(c);
  let escrowed = 0;
  for (const t of await trades.listOpenTrades()) if (t.escrowed) escrowed += t.give.reduce((n, i) => n + i.count, 0);
  const total = Object.values(data).reduce((n, l) => n + l.length, 0);
  ok(await live() === total + escrowed, `${where}: ledger (${await live()}) = collections (${total}) + escrow (${escrowed})`);
  for (const [u, list] of Object.entries(data)) ok((await ser.getOwnerCopies(c, u)).length === list.length, `${where}: ${u} holds as many prints as cards`);
  return total + escrowed;
};
const start = await consistent('after the move and the backfill');
ok(start === 5, 'five copies to start');
const stack = (cardNumber: number, count = 1) => ({ cardNumber, variant: 'regular' as const, count });

const pulled = await kvLib.addCollectionEntryWithSerial(c, 'bob', E(1), 'pull');
ok(pulled.owned.length === 3 && pulled.serial === 4 && !!pulled.copyId, 'a pull returns the new list and the print it got');
await consistent('pull');

const idsOf = async (u: string) => (await ser.getOwnerCopies(c, u)).filter(x => x.card === 1).map(x => x.id).sort();
const aliceCard1 = await idsOf('alice');
const bobCard1 = await idsOf('bob');
const offer = await trades.createTrade({ seasonId: season.id, from: 'alice', kind: 'direct', to: 'bob', give: [stack(1, 2)], get: [stack(3)] });
ok(offer.ok, 'an offer is created');
if (!offer.ok) throw new Error('offer');
eq(await kvLib.getUserCards(c, 'alice'), [E(2)], 'escrow took the two copies out of the collection');
ok(await consistent('escrow') === start + 1, 'escrow counts, and the pull added one copy');
ok((await trades.acceptTrade(offer.trade.id, 'bob')).ok, 'the offer is accepted');
await consistent('accept');
eq(await idsOf('bob'), [...bobCard1, ...aliceCard1].sort(), 'bob kept his own prints and received alice\'s, same ids');
const second = await trades.createTrade({ seasonId: season.id, from: 'alice', kind: 'direct', to: 'bob', give: [stack(3)], get: [stack(1)] });
ok(second.ok, 'a second offer is made');
if (!second.ok) throw new Error('second');
await consistent('second escrow');
ok((await trades.cancelTrade(second.trade.id, 'alice')).ok, 'and cancelled, which refunds the escrow');
await consistent('cancel');

for (let i = 0; i < 5; i++) await kvLib.addCollectionEntry(c, 'carol', E(4), 'pull');
await consistent('pulls for carol');
const up = await upgrade.upgradeCard({ seasonId: season.id, username: 'carol', cardNumber: 4, from: 'regular' });
ok(up.ok, `an upgrade works: ${JSON.stringify(up)}`);
await consistent('upgrade');

ok(await kvLib.removeUserFromCollection(c, 'bob') && !(await kvLib.removeUserFromCollection(c, 'bob')), 'removing a viewer works once');
await consistent('remove viewer');
ok(!(await prodKv.hexists(`coll:${c}`, 'bob')), 'and leaves no field behind');

await kvLib.saveUserProfile({ username: 'alice', displayName: 'Alice', twitchId: '9001', createdAt: 1 });
const moved = await move.moveAccount('alice', 'alice_new', { mode: 'rename', reason: 'Twitch name changed' });
ok(moved.ok, `an account move works: ${JSON.stringify(moved)}`);
await consistent('account move');
ok(!(await prodKv.hexists(`coll:${c}`, 'alice')) && (await kvLib.getUserCards(c, 'alice_new')).length === 2, 'the cards moved to the new login and the old field is gone');
const again = await move.finishMove('alice');
ok(!again.ok || (await kvLib.getUserCards(c, 'alice_new')).length === 2, 'resuming a finished move adds nothing twice');

console.log('collection hash checks passed');
