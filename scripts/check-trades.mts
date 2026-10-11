// Checks the trading rules. Needs the mock KV running (node scripts/mock-kv.cjs); refuses anything non-local.
// Run: npx tsx scripts/check-trades.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';

const core = await import('../lib/trade-core');
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const eq = (a: unknown, b: unknown, msg: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
const { encodeEntry } = await import('../lib/variants');
const E = (n: number, v: 'regular' | 'reverse' | 'full' | 'shiny' = 'regular') => encodeEntry(n, v);

// ── Pure core ──
eq(core.cleanItems([{ cardNumber: 5, variant: 'regular', count: 2 }, { cardNumber: 5, variant: 'regular', count: 3 }], 8), [{ cardNumber: 5, variant: 'regular', count: 5 }], 'same stack merges');
ok(core.cleanItems([], 8) === null, 'empty is refused');
ok(core.cleanItems('x', 8) === null, 'non-array is refused');
ok(core.cleanItems([{ cardNumber: 0, variant: 'regular', count: 1 }], 8) === null, 'card 0 refused');
ok(core.cleanItems([{ cardNumber: 1_000_000, variant: 'regular', count: 1 }], 8) === null, 'card number too large refused');
ok(core.cleanItems([{ cardNumber: 1, variant: 'bogus', count: 1 }], 8) === null, 'unknown variant refused');
ok(core.cleanItems([{ cardNumber: 1, variant: 'regular', count: 0 }], 8) === null, 'zero copies refused');
ok(core.cleanItems([{ cardNumber: 1, variant: 'regular', count: -3 }], 8) === null, 'negative copies refused');
ok(core.cleanItems([{ cardNumber: 1, variant: 'regular', count: 100 }], 8) === null, 'too many copies in a stack refused');
ok(core.cleanItems([{ cardNumber: 1, variant: 'regular', count: 1 }, { cardNumber: 2, variant: 'regular', count: 1 }], 1) === null, 'too many stacks refused');
eq(core.sanitizeTradeSettings({ expiryHours: 99999, maxOpenPerUser: 0, cooldownSeconds: -5, enabled: 'false' }), { enabled: false, expiryHours: 336, maxOpenPerUser: 1, cooldownSeconds: 0, maxStacksPerSide: 8 }, 'settings are clamped');

const give = [{ cardNumber: 1, variant: 'regular' as const, count: 2 }];
const get = [{ cardNumber: 9, variant: 'shiny' as const, count: 1 }];
const offererNow = [E(2), E(3)];                // the escrow has already left the offerer
const takerNow = [E(9, 'shiny'), E(4), E(4)];
const total = (...lists: number[][]) => lists.flat().length;
const before = total(offererNow, takerNow, core.itemEntries(give));
const settled = core.settleTrade(offererNow, takerNow, give, get);
ok(settled.ok, 'settles when the taker has the goods');
if (settled.ok) {
  ok(total(settled.offerer, settled.taker) === before, 'settlement conserves every copy (escrow included)');
  ok(core.ownedCopies(settled.offerer, 9, 'shiny') === 1 && core.ownedCopies(settled.taker, 1, 'regular') === 2, 'each side receives what was agreed');
  ok(core.ownedCopies(settled.taker, 9, 'shiny') === 0, 'the taker no longer has what they gave');
}
const lacking = core.settleTrade(offererNow, [E(4)], give, get);
ok(!lacking.ok && lacking.missing.cardNumber === 9, 'settlement refuses when the taker lacks the goods');
const esc = core.takeForEscrow([E(1), E(1), E(1), E(7)], give);
ok(esc.ok && esc.rest.length === 2 && core.ownedCopies(esc.rest, 1, 'regular') === 1, 'escrow takes exactly the offered copies');
ok(!core.takeForEscrow([E(1)], give).ok, 'escrow refuses when the viewer owns too few');

// ── Engine, in an isolated sandbox namespace ──
const db = await import('../lib/db');
const kvLib = await import('../lib/kv');
const sbx = await import('../lib/sandbox');
const trades = await import('../lib/trades');
const { prodKv, runInSandbox } = db;

await kvLib.seedSeason1();
const pack = (await kvLib.getPack('pack1'))!;
await kvLib.savePack({ ...pack, upgradesEnabled: true } as never);
const box = await sbx.createSandbox({ name: 'Trade check', source: 'config' });
const prodBefore = JSON.stringify(await prodKv.get('trades:open'));

await runInSandbox(box.id, async () => {
  const season = (await kvLib.listSeasons())[0];
  const coll = season.collectionName;
  const put = (data: Record<string, number[]>) => kvLib.saveCollection(coll, data);
  const owned = async (u: string) => ((await kvLib.getCollection(coll))[u] ?? []);
  const escrowCount = async () => (await trades.listOpenTrades()).reduce((n, t) => n + (t.escrowed ? core.itemCopies(t.give) : 0), 0);
  // The invariant after every step: collections + escrow never change in total.
  const universe = async () => Object.values(await kvLib.getCollection(coll)).reduce((n, l) => n + l.length, 0) + await escrowCount();

  await trades.saveTradeSettings({ ...core.DEFAULT_TRADE_SETTINGS, cooldownSeconds: 0, maxOpenPerUser: 3 });
  await put({ alice: [E(1), E(1), E(1), E(2), E(5, 'reverse')], bob: [E(9), E(9), E(3), E(4, 'full')], carol: [E(7)] });
  const start = await universe();
  ok(start === 10, 'starting copies');
  const stack = (cardNumber: number, variant: 'regular' | 'reverse' | 'full' | 'shiny' = 'regular', count = 1) => ({ cardNumber, variant, count });

  // Creating an offer escrows the copies immediately.
  const a1 = await trades.createTrade({ seasonId: season.id, from: 'alice', kind: 'direct', to: 'bob', give: [stack(1, 'regular', 2)], get: [stack(9, 'regular', 1)] });
  ok(a1.ok, 'direct offer is created');
  if (!a1.ok) return;
  ok(core.ownedCopies(await owned('alice'), 1, 'regular') === 1, 'two copies left alice for escrow');
  ok(await universe() === start, 'copies conserved after creating');

  // Rules on creation.
  ok(!(await trades.createTrade({ seasonId: season.id, from: 'alice', kind: 'direct', to: 'alice', give: [stack(2)], get: [stack(9)] })).ok, 'no trading with yourself');
  ok(!(await trades.createTrade({ seasonId: season.id, from: 'alice', kind: 'direct', to: 'nobody_here', give: [stack(2)], get: [stack(9)] })).ok, 'recipient must exist');
  ok(!(await trades.createTrade({ seasonId: season.id, from: 'alice', kind: 'direct', to: 'bob', give: [stack(2, 'regular', 5)], get: [stack(9)] })).ok, 'cannot offer copies you do not own');
  ok(!(await trades.createTrade({ seasonId: season.id, from: 'alice', kind: 'listing', give: [stack(2)], get: [stack(9999)] })).ok, 'wanted card must exist');
  ok(!(await trades.createTrade({ seasonId: season.id, from: 'alice', kind: 'listing', give: [stack(2)], get: [] })).ok, 'must want something back');
  ok(await universe() === start, 'failed offers change nothing');
  ok(core.ownedCopies(await owned('alice'), 2, 'regular') === 1, 'a refused offer takes nothing');

  // Accept by the wrong person / without the goods / correctly.
  ok(!(await trades.acceptTrade(a1.trade.id, 'carol')).ok, 'only the recipient can accept a direct offer');
  ok(!(await trades.acceptTrade(a1.trade.id, 'alice')).ok, 'cannot accept your own offer');
  const lack = await trades.createTrade({ seasonId: season.id, from: 'alice', kind: 'direct', to: 'carol', give: [stack(2)], get: [stack(9, 'regular', 1)] });
  ok(lack.ok, 'offer to carol');
  if (lack.ok) {
    const r = await trades.acceptTrade(lack.trade.id, 'carol');
    ok(!r.ok, 'acceptor without the requested copies is refused');
    ok((await trades.getTrade(lack.trade.id))?.status === 'open', 'a refused accept leaves the offer open');
    ok(await universe() === start, 'copies conserved after a refused accept');
    ok((await trades.cancelTrade(lack.trade.id, 'alice')).ok, 'alice cancels the offer to carol');
    ok(core.ownedCopies(await owned('alice'), 2, 'regular') === 1, 'cancel refunds the escrow');
  }

  const accepted = await trades.acceptTrade(a1.trade.id, 'bob');
  ok(accepted.ok, 'bob accepts');
  ok(core.ownedCopies(await owned('bob'), 1, 'regular') === 2 && core.ownedCopies(await owned('alice'), 9, 'regular') === 1, 'the copies changed hands');
  ok(await universe() === start, 'copies conserved after accepting');
  ok(!(await trades.acceptTrade(a1.trade.id, 'bob')).ok, 'an offer can only be accepted once');
  ok((await trades.getTrade(a1.trade.id))?.status === 'accepted', 'it is recorded as accepted');

  // Decline refunds. Counter swaps the offer around.
  const d = await trades.createTrade({ seasonId: season.id, from: 'alice', kind: 'direct', to: 'bob', give: [stack(5, 'reverse')], get: [stack(3)] });
  ok(d.ok, 'offer with a variant');
  if (d.ok) {
    ok(core.ownedCopies(await owned('alice'), 5, 'reverse') === 0, 'variant copy is in escrow');
    ok(!(await trades.declineTrade(d.trade.id, 'carol')).ok, 'only the recipient can decline');
    ok((await trades.declineTrade(d.trade.id, 'bob')).ok, 'bob declines');
    ok(core.ownedCopies(await owned('alice'), 5, 'reverse') === 1, 'decline refunds the offerer');
  }
  const c0 = await trades.createTrade({ seasonId: season.id, from: 'alice', kind: 'direct', to: 'bob', give: [stack(5, 'reverse')], get: [stack(3)] });
  if (c0.ok) {
    const c1 = await trades.counterTrade(c0.trade.id, 'bob', { give: [stack(3)], get: [stack(5, 'reverse'), stack(2)] });
    ok(c1.ok, 'bob counters');
    if (c1.ok) {
      ok(c1.trade.from === 'bob' && c1.trade.to === 'alice' && c1.trade.counterOf === c0.trade.id, 'the counter goes back to alice');
      ok((await trades.getTrade(c0.trade.id))?.status === 'countered', 'the original is closed as countered');
      ok(core.ownedCopies(await owned('alice'), 5, 'reverse') === 1, 'alice got her escrow back when countered');
      ok(core.ownedCopies(await owned('bob'), 3, 'regular') === 0, "bob's counter is in escrow");
      ok(await universe() === start, 'copies conserved through a counter');
      ok((await trades.acceptTrade(c1.trade.id, 'alice')).ok, 'alice accepts the counter');
      ok(core.ownedCopies(await owned('alice'), 3, 'regular') === 1 && core.ownedCopies(await owned('bob'), 5, 'reverse') === 1, 'counter settled');
      ok(await universe() === start, 'copies conserved after the counter settles');
    }
  }

  // Listings: anyone but the poster can take one; a wanted variant must exist.
  const l1 = await trades.createTrade({ seasonId: season.id, from: 'carol', kind: 'listing', give: [stack(7)], get: [stack(4, 'full')] });
  ok(l1.ok, 'carol posts a listing');
  // A wanted variant the pack can't produce is refused (Shiny is fine here: the pack has upgrades on).
  ok(!(await trades.createTrade({ seasonId: season.id, from: 'carol', kind: 'listing', give: [stack(7)], get: [stack(25)] })).ok, 'the same copy cannot be offered twice (it is in escrow)');
  const sv = await trades.createTrade({ seasonId: season.id, from: 'bob', kind: 'listing', give: [stack(1)], get: [stack(4, 'shiny', 1)] });
  ok(sv.ok, 'a listing can ask for a variant the card can be: ' + (sv.ok ? '' : sv.error));
  const stray = (await trades.listOpenTrades()).find(t => t.from === 'bob' && t.get[0]?.variant === 'shiny');
  if (stray) await trades.cancelTrade(stray.id, 'bob');
  if (l1.ok) {
    ok(!(await trades.acceptTrade(l1.trade.id, 'carol')).ok, 'cannot take your own listing');
    // Two people race for the same listing: exactly one wins and nothing is duplicated.
    await put({ ...(await kvLib.getCollection(coll)), dave: [E(4, 'full')], erin: [E(4, 'full')] });
    const startRace = await universe();
    const [r1, r2] = await Promise.all([trades.acceptTrade(l1.trade.id, 'dave'), trades.acceptTrade(l1.trade.id, 'erin')]);
    ok([r1.ok, r2.ok].filter(Boolean).length === 1, 'only one of two simultaneous accepts succeeds: ' + JSON.stringify([r1, r2].map(r => (r.ok ? 'ok' : r.error))));
    ok(await universe() === startRace, 'copies conserved through the race');
    const loser = r1.ok ? 'erin' : 'dave';
    ok(core.ownedCopies(await owned(loser), 4, 'full') === 1, 'the loser keeps their copy');
  }

  // Limits.
  const spam = [];
  for (let i = 0; i < 5; i++) spam.push(await trades.createTrade({ seasonId: season.id, from: 'bob', kind: 'listing', give: [stack(1)], get: [stack(25)] }));
  ok(spam.filter(r => r.ok).length <= 3, 'open offers per viewer are capped');

  // Expiry refunds. Make an offer overdue and let any trading call sweep it.
  const exp = await trades.createTrade({ seasonId: season.id, from: 'alice', kind: 'listing', give: [stack(2)], get: [stack(25)] });
  if (exp.ok) {
    const open = await trades.listOpenTrades();
    const t = open.find(x => x.id === exp.trade.id)!;
    t.expiresAt = Date.now() - 1000;
    await (await import('../lib/db')).kv.set('trades:open', open);
    const before = core.ownedCopies(await owned('alice'), 2, 'regular');
    const swept = await trades.sweepTrades();
    ok(swept >= 1, 'the sweep expires overdue offers');
    ok(core.ownedCopies(await owned('alice'), 2, 'regular') === before + 1, 'expiry refunds the escrow');
    ok((await trades.getTrade(exp.trade.id))?.status === 'expired', 'recorded as expired');
  }

  // Admin: freeze and cancel.
  const f = await trades.createTrade({ seasonId: season.id, from: 'carol', kind: 'listing', give: [stack(7)], get: [stack(25)] });
  await trades.saveTradeSettings({ ...(await trades.getTradeSettings()), enabled: false });
  ok(!(await trades.createTrade({ seasonId: season.id, from: 'alice', kind: 'listing', give: [stack(2)], get: [stack(25)] })).ok, 'paused: no new offers');
  if (f.ok) {
    ok(!(await trades.acceptTrade(f.trade.id, 'bob')).ok, 'paused: no accepts');
    const c = await trades.cancelTrade(f.trade.id, 'admin', { admin: true, reason: 'test' });
    ok(c.ok && (await trades.getTrade(f.trade.id))?.resolvedBy === 'admin', 'an admin can cancel while paused, and it refunds');
  }
  await trades.saveTradeSettings({ ...(await trades.getTradeSettings()), enabled: true });

  // Whatever happened, no copy was created or destroyed beyond what the test itself added (dave + erin).
  const open = await trades.listOpenTrades();
  ok(open.every(t => t.escrowed), 'every open offer holds its escrow');
  const finalUniverse = await universe();
  ok(finalUniverse === start + 2, `copies are conserved overall (${finalUniverse} vs ${start + 2})`);
});

ok(JSON.stringify(await prodKv.get('trades:open')) === prodBefore, 'production trades untouched');
await sbx.deleteSandbox(box.id);
console.log('trade checks passed');
