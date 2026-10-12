// Checks card serials: numbering per card + version, backfill, tracking switch-on, removals, trades keep identity, upgrades link back.
// Needs the mock KV (node scripts/mock-kv.cjs); refuses anything non-local.  Run: npx tsx scripts/check-serials.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';

const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const eq = (a: unknown, b: unknown, msg: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);

const core = await import('../lib/serials-core');
const { encodeEntry } = await import('../lib/variants');
const E = (n: number, v: 'regular' | 'reverse' | 'full' | 'shiny' = 'regular') => encodeEntry(n, v);

// ── pure ──
eq(core.copyId(7, 'shiny', 12), '7.3.12', 'copy id');
eq(core.parseCopyId('7.3.12'), { card: 7, variant: 'shiny', n: 12 }, 'copy id parses');
ok(core.parseCopyId('7.9.1') === null && core.parseCopyId('x') === null && core.parseCopyId('7.1.1; drop') === null, 'bad ids are refused');
const d = core.diffCounts(new Map([[1, 2], [2, 1]]), new Map([[1, 3], [3, 1]]));
eq([[...d.mint], [...d.retire]], [[[1, 1], [3, 1]], [[2, 1]]], 'diff: what to mint and retire');
ok(core.sameCollection([1, 2, 2], [2, 1, 2]) && !core.sameCollection([1], [1, 1]), 'sameCollection ignores order only');
const cp = (n: number, at = 0) => ({ id: core.copyId(1, 'regular', n), card: 1, variant: 'regular' as const, n, owner: 'a', at, origin: 'pull' as const, ev: [] });
eq(core.newestFirst([cp(1), cp(5), cp(3)], 2).map(c => c.n), [5, 3], 'newest first');
const many = Array.from({ length: 60 }, (_, i) => ({ t: i, type: 'traded' as const }));
const trimmed = many.reduce((c, e) => core.withEvent(c, e), { ...cp(1), ev: [{ t: -1, type: 'minted' as const }] });
ok(trimmed.ev.length === core.EVENT_CAP && trimmed.ev[0].type === 'minted', 'history is capped but the creation event stays');

// ── share image layout ──
const sh = await import('../lib/share-image');
const area = sh.cardArea();
for (const n of [0, 1, 2, 3, 4, 5, 6, 9, 12]) {
  const rs = sh.layoutCards(n, area);
  ok(rs.length === Math.min(n, 9), `layout gives ${Math.min(n, 9)} rects for ${n}`);
  ok(rs.every(r => r.x >= area.x - 0.5 && r.y >= area.y - 0.5 && r.x + r.w <= area.x + area.w + 0.5 && r.y + r.h <= area.y + area.h + 0.5), `${n} cards stay inside the area`);
  ok(rs.every((r, i) => rs.every((q, j) => i === j || r.x + r.w <= q.x + 0.5 || q.x + q.w <= r.x + 0.5 || r.y + r.h <= q.y + 0.5 || q.y + q.h <= r.y + 0.5)), `${n} cards do not overlap`);
}

// ── engine, in an isolated sandbox ──
const db = await import('../lib/db');
const kvLib = await import('../lib/kv');
const sbx = await import('../lib/sandbox');
const trades = await import('../lib/trades');
const ser = await import('../lib/serials');
const upgrade = await import('../lib/upgrade');
await kvLib.seedSeason1();
const pack = (await kvLib.getPack('pack1'))!;
await kvLib.savePack({ ...pack, upgradesEnabled: true } as never);
const box = await sbx.createSandbox({ name: 'Serial check', source: 'config' });
const prodBefore = JSON.stringify(await db.prodKv.hgetall('copies:x:idx'));

await db.runInSandbox(box.id, async () => {
  const season = (await kvLib.listSeasons())[0];
  const c = season.collectionName;
  const owned = async (u: string) => (await kvLib.getCollection(c))[u] ?? [];
  const mine = async (u: string) => (await ser.getOwnerCopies(c, u)).map(x => x.id).sort();
  const live = async () => Object.keys((await db.kv.hgetall(`copies:${c}:idx`)) ?? {}).length;

  await kvLib.saveCollection(c, { alice: [E(1), E(1), E(2), E(3, 'shiny')], bob: [E(1)] });
  ok(!(await ser.isTracking(c)), 'nothing is tracked before the backfill');
  await kvLib.addCollectionEntry(c, 'alice', E(1), 'pull');
  eq(await mine('alice'), [], 'untracked: no copies minted yet');

  // Backfill numbers what exists: card 1 regular x4 in total (alice 3, bob 1).
  const r = await ser.backfillSerials(c, await kvLib.getCollection(c));
  ok(r.copies === 6 && r.users === 2, `backfill numbered 6 copies, got ${JSON.stringify(r)}`);
  ok(await ser.isTracking(c), 'tracking is on after the backfill');
  const first = await ser.getOwnerCopies(c, 'alice');
  ok(first.every(x => x.est && x.origin === 'estimated'), 'backfilled copies are marked as estimates');
  eq([...(await ser.mintedCounts(c)).entries()].sort(), [[E(1), 4], [E(2), 1], [E(3, 'shiny'), 1]].sort(), 'serial counters');
  ok((await mine('alice')).includes('1.0.1') && (await mine('bob')).length === 1, 'every serial has exactly one owner');
  const again = await ser.backfillSerials(c, await kvLib.getCollection(c));
  ok(again.copies === 0 && await live() === 6, 'running the backfill again adds nothing');

  // New pulls are exact and continue the count.
  await kvLib.addCollectionEntry(c, 'bob', E(1), 'pull');
  const bobCopies = await ser.getOwnerCopies(c, 'bob');
  const fresh = bobCopies.find(x => x.n === 5);
  ok(fresh && !fresh.est && fresh.origin === 'pull', 'a new pull gets the next number, exact');
  await kvLib.addCollectionEntry(c, 'bob', E(1, 'shiny'), 'grant');
  ok((await ser.getOwnerCopies(c, 'bob')).some(x => x.id === '1.3.1' && x.origin === 'grant'), 'numbering is per card AND version: the first Shiny is #1');

  // The ledger always matches the collection.
  const consistent = async () => {
    const data = await kvLib.getCollection(c);
    let escrowed = 0;
    for (const t of await trades.listOpenTrades()) if (t.escrowed) escrowed += t.give.reduce((n, i) => n + i.count, 0);
    const total = Object.values(data).reduce((n, l) => n + l.length, 0);
    ok(await live() === total + escrowed, `ledger (${await live()}) = collections (${total}) + escrow (${escrowed})`);
    for (const [u, list] of Object.entries(data)) ok((await ser.getOwnerCopies(c, u)).length === list.length, `${u} holds as many serials as cards`);
  };
  await consistent();

  // Removing a copy retires the newest and keeps its history.
  const data = await kvLib.getCollection(c);
  data.alice = data.alice.slice(1);
  await kvLib.saveCollection(c, data);
  await consistent();
  const retired = await ser.getCopy(c, '1.0.3');
  ok(retired && retired.ev.at(-1)?.type === 'removed', 'a removed copy is retired with its history (the newest goes first)');

  // Trades carry identity.
  await trades.saveTradeSettings({ ...(await import('../lib/trade-core')).DEFAULT_TRADE_SETTINGS, cooldownSeconds: 0, maxOpenPerUser: 5 });
  const stack = (cardNumber: number, variant: 'regular' | 'shiny' = 'regular', count = 1) => ({ cardNumber, variant, count });
  const before = await mine('alice');
  const give = (await ser.getOwnerCopies(c, 'alice')).filter(x => x.card === 2).map(x => x.id);
  const offer = await trades.createTrade({ seasonId: season.id, from: 'alice', kind: 'direct', to: 'bob', give: [stack(2)], get: [stack(1, 'shiny')] });
  ok(offer.ok, 'offer created');
  if (!offer.ok) return;
  await consistent();
  eq((await db.kv.hget(`copies:${c}:idx`, give[0])), `escrow:${offer.trade.id}`, 'an offered copy sits in escrow under its own id');
  const dec = await trades.declineTrade(offer.trade.id, 'bob');
  ok(dec.ok, 'declined');
  await consistent();
  eq(await mine('alice'), before, 'a refund brings back the very same serials');
  ok((await ser.getCopy(c, give[0]))!.ev.map(e => e.type).join() === 'minted,escrowed,returned', 'history: created, escrowed, returned');

  const o2 = await trades.createTrade({ seasonId: season.id, from: 'alice', kind: 'direct', to: 'bob', give: [stack(2)], get: [stack(1, 'shiny')] });
  if (!o2.ok) throw new Error('second offer failed');
  const acc = await trades.acceptTrade(o2.trade.id, 'bob');
  ok(acc.ok, 'accepted');
  await consistent();
  ok((await mine('bob')).includes(give[0]), 'the offered copy now belongs to bob, same id');
  ok((await mine('alice')).includes('1.3.1'), 'the Shiny went to alice, same id');
  const hist = (await ser.getCopy(c, give[0]))!.ev;
  ok(hist.at(-1)?.type === 'traded' && hist.at(-1)?.to === 'bob', 'history ends with the trade to bob');

  // Upgrade: five regulars of card 1 for one reverse (pack1 costs); the new copy points back at what was spent.
  await kvLib.saveCollection(c, { ...(await kvLib.getCollection(c)), carol: [] });
  for (let i = 0; i < 5; i++) await kvLib.addCollectionEntry(c, 'carol', E(4), 'pull');
  const res = await upgrade.upgradeCard({ seasonId: season.id, username: 'carol', cardNumber: 4, from: 'regular' });
  ok(res.ok, `upgrade works: ${JSON.stringify(res)}`);
  await consistent();
  const made = (await ser.getOwnerCopies(c, 'carol')).find(x => x.variant !== 'regular');
  ok(made && made.origin === 'upgrade' && (made.madeFrom?.length ?? 0) >= 2, 'the upgraded copy lists the copies it was made from');
  const spent = await ser.getCopy(c, made!.madeFrom![0]);
  ok(spent && spent.ev.at(-1)?.type === 'upgraded', 'a spent copy is retired as upgraded');

  // Deleting the collection clears the ledger.
  await kvLib.deleteCollection(c);
  eq(await live(), 0, 'deleting a collection clears its ledger');
});

eq(JSON.stringify(await db.prodKv.hgetall('copies:x:idx')), prodBefore, 'production untouched');
await sbx.deleteSandbox(box.id);
console.log('serial checks passed');
process.exit(0);
