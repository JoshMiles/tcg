// Checks that the points quoted for trades in the activity feed / Discord include the serial bonuses, read before the copies move.
// Needs the mock KV (node scripts/mock-kv.cjs); refuses anything non-local.  Run: npx tsx scripts/check-trade-points.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const { encodeEntry } = await import('../lib/variants');
const E = (n: number) => encodeEntry(n, 'regular');
const db = await import('../lib/db');
const kvLib = await import('../lib/kv');
const sbx = await import('../lib/sandbox');
const trades = await import('../lib/trades');
const ser = await import('../lib/serials');
const act = await import('../lib/activity');
const view = await import('../lib/trade-view');

await kvLib.seedSeason1();
const box = await sbx.createSandbox({ name: 'Trade points check', source: 'config' });
await db.runInSandbox(box.id, async () => {
  const season = (await kvLib.listSeasons())[0];
  const coll = season.collectionName;
  await trades.saveTradeSettings({ ...(await trades.getTradeSettings()), cooldownSeconds: 0 });
  await kvLib.saveCollection(coll, { alice: [E(1), E(1), E(1)], bob: [E(9), E(9)] });
  await ser.backfillSerials(coll, await kvLib.getCollection(coll)); // alice: card 1 #1 #2 #3, bob: card 9 #1 #2
  const cards = await view.getTradeCards(season);
  const worth = (card: number, n: number) => view.copyValue(cards[card], 'regular', n);
  ok(worth(1, 3) > cards[1].values[0] && worth(9, 2) > cards[9].values[0], 'low serials are worth more than the plain value');

  const latest = async () => (await act.getActivity({ limit: 5 })).events.find(e => e.type === 'trade') as unknown as { action: string; givePts: number; getPts: number };

  const o = await trades.createTrade({ seasonId: season.id, from: 'alice', kind: 'direct', to: 'bob', give: [{ cardNumber: 1, variant: 'regular', count: 1 }], get: [{ cardNumber: 9, variant: 'regular', count: 1 }] });
  ok(o.ok, 'offer created');
  if (!o.ok) return;
  let ev = await latest();
  ok(ev.action === 'offered' && ev.givePts === worth(1, 3), `offer: the give side is priced from the escrowed copy (#3): ${ev.givePts} vs ${worth(1, 3)}`);

  ok((await trades.acceptTrade(o.trade.id, 'bob')).ok, 'accepted');
  ev = await latest();
  ok(ev.action === 'accepted', 'accepted event recorded');
  ok(ev.givePts === worth(1, 3), `accept: the give side keeps the serial it had before it moved: ${ev.givePts}`);
  ok(ev.getPts === worth(9, 2), `accept: the asked-for side is priced from the taker's newest copy (#2): ${ev.getPts} vs ${worth(9, 2)}`);

  // A declined offer is priced from the escrow, before the refund.
  const d = await trades.createTrade({ seasonId: season.id, from: 'alice', kind: 'direct', to: 'bob', give: [{ cardNumber: 1, variant: 'regular', count: 1 }], get: [{ cardNumber: 9, variant: 'regular', count: 1 }] });
  ok(d.ok, 'second offer');
  if (!d.ok) return;
  await trades.declineTrade(d.trade.id, 'bob');
  ev = await latest();
  ok(ev.action === 'declined' && ev.givePts > 0, 'declined event carries the points');
});
await sbx.deleteSandbox(box.id);
console.log('trade points checks passed');
process.exit(0);
