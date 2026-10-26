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
eq(core.sanitizeTradeSettings({ expiryHours: 99999, maxOpenPerUser: 0, cooldownSeconds: -5, enabled: 'false' }), { enabled: false, expiryHours: 336, maxOpenPerUser: 1, cooldownSeconds: 0, maxStacksPerSide: 8, minAccountHours: 0 }, 'settings are clamped');

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


// ── Insights (pure) ──
const insights = await import('../lib/trade-insights');
const T = (o: Partial<import('../lib/trade-core').Trade>): import('../lib/trade-core').Trade => ({ id: Math.random().toString(36).slice(2), seasonId: 's', kind: 'direct', from: 'a', to: 'b', give: [{ cardNumber: 1, variant: 'regular', count: 1 }], escrowed: false, get: [{ cardNumber: 2, variant: 'regular', count: 1 }], status: 'accepted', createdAt: 1_000_000, expiresAt: 9e12, resolvedAt: 1_060_000, ...o });
const now0 = Date.now();
const mk = (n: number, pts: [number, number], from = 'a', to = 'b') => Array.from({ length: n }, (_, i) => T({ from, to, createdAt: now0 - i * 60_000, resolvedAt: now0 - i * 60_000 + 30_000 }));
const pointsOf = (t: import('../lib/trade-core').Trade, side: 'give' | 'get') => (side === 'give' ? 100 : 10);
const fl = insights.flagTrades([T({})], { points: pointsOf, createdAt: () => undefined });
ok([...fl.values()][0]?.some(f => f.kind === 'lopsided'), 'a 10× gap is flagged lopsided');
const even = insights.flagTrades([T({})], { points: () => 100, createdAt: () => undefined });
ok(even.size === 0, 'an even trade is not flagged');
const rep = insights.flagTrades(mk(3, [1, 1]), { points: () => 100, createdAt: () => undefined });
ok([...rep.values()].every(f => f.some(x => x.kind === 'repeat')) && rep.size === 3, 'three trades between one pair are flagged as repeats');
const burst = insights.flagTrades(mk(5, [1, 1]).map(t => ({ ...t, status: 'open' as const })), { points: () => 100, createdAt: () => undefined });
ok([...burst.values()].some(f => f.some(x => x.kind === 'burst')), 'five offers in minutes is a burst');
const newb = insights.flagTrades([T({ createdAt: now0 })], { points: () => 100, createdAt: u => (u === 'a' ? now0 - 3_600_000 : undefined) });
ok([...newb.values()][0]?.some(f => f.kind === 'newbie'), 'a viewer who joined an hour before is flagged new');
const st = insights.computeTradeStats([], [T({ resolvedAt: 1_000_000 + 120_000 }), T({ status: 'declined' }), T({ status: 'expired' })], now0);
ok(st.accepted === 1 && Math.abs((st.acceptRate ?? 0) - 1 / 3) < 1e-9 && st.medianAcceptMin === 2, 'stats: accept rate and median wait');
ok(insights.tradesToCsv([]).startsWith('id,status'), 'csv has a header');

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

  // KV has no multi-key transaction. When a refund fails after the offer was saved as closed (here: the collection lock is held,
  // so the refund times out), the offer is never refunded a second time: it stays in history marked escrowed for staff to fix.
  const stuck = await trades.createTrade({ seasonId: season.id, from: 'carol', kind: 'listing', give: [stack(7)], get: [stack(4, 'full')] });
  ok(stuck.ok, 'carol lists a card');
  if (stuck.ok) {
    await db.kv.set(`lock:tcg_${coll}`, 'held', { ex: 30 });
    ok(await trades.cancelTrade(stuck.trade.id, 'carol').then(() => false, () => true), 'the refund fails while the collection is locked');
    await db.kv.del(`lock:tcg_${coll}`);
    await trades.sweepTrades();
    const rec = await trades.getTrade(stuck.trade.id);
    ok(rec?.status === 'cancelled' && rec.escrowed, 'the failed refund leaves a closed offer marked escrowed');
    ok(!(await trades.listOpenTrades()).some(t => t.id === stuck.trade.id), 'it is no longer open, so it cannot be refunded again');
    ok(await universe() === start - 1, 'the copy is stuck, never duplicated');
    const handed = await trades.releaseStuckEscrow(stuck.trade.id);
    ok(handed.ok && handed.cleared, 'staff return the stuck print once');
    ok(core.ownedCopies(await owned('carol'), 7, 'regular') === 1, 'the print is back with carol');
    ok((await trades.getTrade(stuck.trade.id))?.escrowed === false, 'the escrow flag is cleared');
    const handedAgain = await trades.releaseStuckEscrow(stuck.trade.id);
    ok(handedAgain.ok && !handedAgain.cleared && core.ownedCopies(await owned('carol'), 7, 'regular') === 1, 'returning it again does not add a second print');
  }
  ok(await universe() === start, 'copies conserved after the stuck-escrow repairs');
  ok((await trades.getTrade(a1.trade.id))?.status === 'accepted', 'it is recorded as accepted');
  {
    // Notifications: the offerer hears about the acceptance (after the trade lock is released), the recipient heard about the offer.
    const notify = await import('../lib/trade-notify');
    const alice = await notify.listNotices('alice');
    ok(alice.notices.some(n => n.kind === 'accepted' && n.text.includes('@bob')), 'the offerer is told it was accepted');
    const bob = await notify.listNotices('bob');
    ok(bob.notices.some(n => n.kind === 'offer' && n.text.includes('@alice')), 'the recipient is told about the offer');
  }

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

  // Admin bulk controls and the minimum account age.
  {
    const data = await kvLib.getCollection(coll);
    const holders = Object.entries(data).filter(([, l]) => l.some(e => e < 1_000_000)).map(([u]) => u);
    ok(holders.length >= 2, 'two viewers hold a regular copy');
    const [u1, u2] = holders;
    const reg = (u: string) => stack(data[u].find(e => e < 1_000_000)!);
    const wanted = stack(25);
    const before = await universe();
    const o1 = await trades.createTrade({ seasonId: season.id, from: u1, kind: 'listing', give: [reg(u1)], get: [wanted] });
    const o2 = await trades.createTrade({ seasonId: season.id, from: u2, kind: 'listing', give: [reg(u2)], get: [wanted] });
    ok(o1.ok && o2.ok, 'two listings for the bulk checks');
    const ex = o1.ok ? o1.trade.expiresAt : 0;
    ok(await trades.extendOpenTrades([o1.ok ? o1.trade.id : ''], 10) === 1, 'extend touches only the named offer');
    ok((await trades.getTrade(o1.ok ? o1.trade.id : ''))!.expiresAt === ex + 10 * 3_600_000, 'expiry moves by the hours given');
    ok(await trades.cancelOpenTrades({ username: u1 }) === 1, 'cancel by viewer ends only their offers');
    ok((await trades.getTrade(o2.ok ? o2.trade.id : ''))?.status === 'open', 'the other viewer offer is untouched');
    ok(await trades.cancelOpenTrades({ seasonId: 'no-such-season' }) === 0, 'cancel by an unknown season matches nothing');
    ok(await trades.cancelOpenTrades({}) >= 1, 'cancel everything ends the rest');
    ok(await universe() === before, 'bulk cancel refunds every copy');

    await trades.saveTradeSettings({ ...(await trades.getTradeSettings()), minAccountHours: 24 });
    await kvLib.saveUserProfile({ username: u1, displayName: u1, createdAt: Date.now() });
    ok(!(await trades.createTrade({ seasonId: season.id, from: u1, kind: 'listing', give: [reg(u1)], get: [wanted] })).ok, 'a brand-new profile cannot offer');
    await kvLib.saveUserProfile({ username: u1, displayName: u1, createdAt: Date.now() - 48 * 3_600_000 });
    const okOffer = await trades.createTrade({ seasonId: season.id, from: u1, kind: 'listing', give: [reg(u1)], get: [wanted] });
    ok(okOffer.ok, 'an old enough profile can offer');
    await trades.cancelOpenTrades({});
    await trades.saveTradeSettings({ ...(await trades.getTradeSettings()), minAccountHours: 0 });
  }

  // A sweep refunds and saves the cleared flag before a later create or accept returns early. A missing season does not clear it.
  {
    const { decodeEntry } = await import('../lib/variants');
    const countCards = async () => Object.values(await kvLib.getCollection(coll)).reduce((n, l) => n + l.length, 0);
    const data = await kvLib.getCollection(coll);
    const holder = Object.entries(data).sort((a, b) => b[1].length - a[1].length)[0]?.[0];
    const beforeCards = await countCards();
    ok(!!holder, 'someone still holds a card to plant an expired offer with');
    if (holder) {
      const entry = data[holder][0];
      const { cardNumber, variant } = decodeEntry(entry);
      data[holder] = data[holder].slice(1);
      await put(data);
      const planted = { id: 'exp-sweep', seasonId: season.id, kind: 'listing' as const, from: holder, give: [{ cardNumber, variant, count: 1 }], escrowed: true, get: [{ cardNumber: 9, variant: 'regular' as const, count: 1 }], status: 'open' as const, createdAt: 1, expiresAt: 1 };
      await db.kv.set('trades:open', [...((await db.kv.get<typeof planted[]>('trades:open')) ?? []), planted]);
      const refused = await trades.createTrade({ seasonId: season.id, from: holder, kind: 'direct', to: holder, give: [{ cardNumber, variant, count: 1 }], get: [{ cardNumber: 9, variant: 'regular', count: 1 }] });
      ok(!refused.ok, 'the create after the sweep is refused');
      const swept = ((await db.kv.get<typeof planted[]>('trades:history')) ?? []).find(t => t.id === 'exp-sweep');
      ok(swept?.status === 'expired' && swept.escrowed === false, 'the swept refund is saved as not escrowed before the create returns');
      ok(await countCards() === beforeCards, 'that refund restored the print and did not add another');
      await trades.sweepTrades();
      ok(await countCards() === beforeCards, 'sweeping again does not refund the same offer again');

      const live = await trades.createTrade({ seasonId: season.id, from: holder, kind: 'listing', give: [{ cardNumber, variant, count: 1 }], get: [{ cardNumber: 9, variant: 'regular', count: 1 }] });
      ok(live.ok, 'a live offer exists so a failed accept can run after another sweep');
      if (live.ok) {
        const again = await kvLib.getCollection(coll);
        const entry2 = again[holder]?.[0];
        ok(entry2 !== undefined, 'the offerer still holds something to plant');
        if (entry2 !== undefined) {
          const d2 = decodeEntry(entry2);
          again[holder] = again[holder].slice(1);
          await put(again);
          const planted2 = { id: 'exp-accept', seasonId: season.id, kind: 'listing' as const, from: holder, give: [{ cardNumber: d2.cardNumber, variant: d2.variant, count: 1 }], escrowed: true, get: [{ cardNumber: 9, variant: 'regular' as const, count: 1 }], status: 'open' as const, createdAt: 1, expiresAt: 1 };
          await db.kv.set('trades:open', [...((await db.kv.get<typeof planted2[]>('trades:open')) ?? []), planted2]);
          ok(!(await trades.acceptTrade(live.trade.id, holder)).ok, 'accepting your own offer is refused after the sweep');
          const swept2 = ((await db.kv.get<typeof planted2[]>('trades:history')) ?? []).find(t => t.id === 'exp-accept');
          ok(swept2?.status === 'expired' && swept2.escrowed === false, 'the swept refund is saved as not escrowed before the accept returns');
          ok(await countCards() === beforeCards - 1, 'the accept path refunded the planted print and left the live offer in escrow');
        }
        ok((await trades.cancelTrade(live.trade.id, holder)).ok, 'the live offer is cancelled after the failed accept');
      }
    }

    const still = await kvLib.getCollection(coll);
    const giver = Object.entries(still).find(([, list]) => list.length > 0);
    ok(!!giver, 'someone can open an offer that blocks deleting the season');
    const blocking = giver
      ? await trades.createTrade({ seasonId: season.id, from: giver[0], kind: 'listing', give: [{ ...decodeEntry(giver[1][0]), count: 1 }], get: [{ cardNumber: 9, variant: 'regular', count: 1 }] })
      : { ok: false as const, status: 400, error: 'nobody' };
    ok(blocking.ok, 'an open offer blocks deleting its season: ' + (blocking.ok ? '' : blocking.error));
    let deleteRefused = false;
    try { await kvLib.deleteSeason(season.id); } catch (e) { deleteRefused = e instanceof Error && /open trade offers/.test(e.message); }
    ok(deleteRefused, 'deleteSeason refuses while an offer for that season is open');
    ok((await kvLib.getSeason(season.id))?.id === season.id, 'the season record is still there');
    if (blocking.ok) ok((await trades.cancelTrade(blocking.trade.id, giver![0])).ok, 'the blocking offer is cancelled');

    const beforeGhost = await universe();
    const ghost = { id: 'ghost-season', seasonId: 'gone-season', kind: 'listing' as const, from: 'alice', give: [{ cardNumber: 1, variant: 'regular' as const, count: 1 }], escrowed: true, get: [{ cardNumber: 2, variant: 'regular' as const, count: 1 }], status: 'open' as const, createdAt: 1, expiresAt: 1 };
    await db.kv.set('trades:open', [...((await db.kv.get<typeof ghost[]>('trades:open')) ?? []), ghost]);
    await trades.sweepTrades();
    const ghostRec = ((await db.kv.get<typeof ghost[]>('trades:history')) ?? []).find(t => t.id === 'ghost-season');
    ok(ghostRec?.status === 'expired' && ghostRec.escrowed === true, 'a missing season leaves the offer marked escrowed');
    const ghostRelease = await trades.releaseStuckEscrow('ghost-season');
    ok(!ghostRelease.ok && (await trades.getTrade('ghost-season'))?.escrowed === true, 'returning it is refused and the flag stays set');
    ok(await universe() === beforeGhost, 'the missing-season refund added no prints');
  }

  // Whatever happened, no copy was created or destroyed beyond what the test itself added (dave + erin).
  const open = await trades.listOpenTrades();
  ok(open.every(t => t.escrowed), 'every open offer holds its escrow');
  const finalUniverse = await universe();
  ok(finalUniverse === start + 2, `copies are conserved overall (${finalUniverse} vs ${start + 2})`);
});

{
  // Who may see what is in a trade (the /trade/[id] page): a listing is public, a direct offer is for its two people.
  const { tradeVisibleTo } = await import('../lib/trade-core');
  const listing = { kind: 'listing' as const, from: 'alice' };
  const direct = { kind: 'direct' as const, from: 'alice', to: 'bob' };
  ok(tradeVisibleTo(listing, null) && tradeVisibleTo(listing, 'carol'), 'a listing is visible to everyone, signed in or not');
  ok(tradeVisibleTo(direct, 'alice') && tradeVisibleTo(direct, 'Bob'), 'a direct offer is visible to both people in it');
  ok(!tradeVisibleTo(direct, 'carol') && !tradeVisibleTo(direct, null) && !tradeVisibleTo(direct, ''), 'a direct offer is private from everyone else');
}

// ── Choosing which print to trade (ROADMAP 6.4) ──
{
  const stk = (cardNumber: number, count: number, ids?: string[]) => ({ cardNumber, variant: 'regular' as const, count, ...(ids ? { ids } : {}) });
  eq(core.cleanItems([stk(1, 2, ['1.0.1', '1.0.2'])], 8), [stk(1, 2, ['1.0.1', '1.0.2'])], 'exact prints are kept');
  ok(core.cleanItems([stk(1, 2, ['1.0.1'])], 8) === null, 'ids must match the count');
  ok(core.cleanItems([stk(1, 2, ['1.0.1', '1.0.1'])], 8) === null, 'the same print twice is refused');
  ok(core.cleanItems([stk(1, 1, ['2.0.1'])], 8) === null, 'a print of another card is refused');
  ok(core.cleanItems([{ cardNumber: 1, variant: 'shiny', count: 1, ids: ['1.0.1'] }], 8) === null, 'a print of another version is refused');
  ok(core.cleanItems([stk(1, 1, ['1.0.1']), stk(1, 1)], 8) === null, 'a picked and an unpicked line of one card do not merge');
  eq(core.cleanItems([stk(1, 1, ['1.0.1']), stk(1, 1, ['1.0.2'])], 8), [stk(1, 2, ['1.0.1', '1.0.2'])], 'two picked lines merge their prints');
  eq(core.withChosenPrints([stk(9, 1)], { [String(E(9))]: ['9.0.2'] }), [stk(9, 1, ['9.0.2'])], 'the taker fills in an unpicked ask');
  eq(core.withChosenPrints([stk(9, 1, ['9.0.1'])], { [String(E(9))]: ['9.0.2'] }), [stk(9, 1, ['9.0.1'])], 'a print the offerer pinned is not overridden');
  ok(core.withChosenPrints([stk(9, 1)], { [String(E(9))]: ['9.0.2', '9.0.3'] }) === null, 'a wrong-sized choice is refused');
}

const box2 = await sbx.createSandbox({ name: 'Trade print check', source: 'config' });
await runInSandbox(box2.id, async () => {
  const serials = await import('../lib/serials');
  const sc = await import('../lib/serials-core');
  const season = (await kvLib.listSeasons())[0];
  const coll = season.collectionName;
  const sk = (cardNumber: number, count = 1, ids?: string[]) => ({ cardNumber, variant: 'regular' as const, count, ...(ids ? { ids } : {}) });
  const holds = async (u: string) => (await serials.getOwnerCopies(coll, u)).map(c => c.id).sort();
  const inEscrow = async (id: string) => (await serials.getOwnerCopies(coll, sc.escrowOwner(id))).map(c => c.id).sort();
  const total = async () => Object.values(await kvLib.getCollection(coll)).reduce((n, l) => n + l.length, 0) + (await trades.listOpenTrades()).reduce((n, t) => n + (t.escrowed ? core.itemCopies(t.give) : 0), 0);
  await trades.saveTradeSettings({ ...core.DEFAULT_TRADE_SETTINGS, cooldownSeconds: 0, maxOpenPerUser: 20 });
  await kvLib.saveCollection(coll, { pa: [E(1), E(1), E(1), E(1), E(2)], pb: [E(9), E(9), E(9)], pc: [E(7)] });

  // Untracked season: ids are refused, and nothing leaves the collection.
  const untracked = await trades.createTrade({ seasonId: season.id, from: 'pa', kind: 'direct', to: 'pb', give: [sk(1, 1, ['1.0.1'])], get: [sk(9)] });
  ok(!untracked.ok && /not numbered/.test(untracked.error), 'ids on an untracked season are refused');
  ok(core.ownedCopies((await kvLib.getCollection(coll)).pa ?? [], 1, 'regular') === 4, 'a refused pick takes nothing');

  await serials.backfillSerials(coll, await kvLib.getCollection(coll));
  eq(await holds('pa'), ['1.0.1', '1.0.2', '1.0.3', '1.0.4', '2.0.1'], 'pa holds numbered prints');
  const start = await total();

  // A closed offer still marked escrowed, whose prints are already home, must not mint another set.
  {
    const fake = { id: 'false-stuck', seasonId: season.id, kind: 'listing' as const, from: 'pa', give: [{ cardNumber: 1, variant: 'regular' as const, count: 1 }], escrowed: true, get: [{ cardNumber: 9, variant: 'regular' as const, count: 1 }], status: 'cancelled' as const, createdAt: 1, expiresAt: 1, resolvedAt: 2 };
    await db.kv.set('trades:history', [fake, ...((await db.kv.get<typeof fake[]>('trades:history')) ?? [])]);
    const before = await holds('pa');
    const minted = (await serials.serialStats(coll)).minted;
    const rel = await trades.releaseStuckEscrow('false-stuck');
    ok(rel.ok && rel.cleared, 'a flag left set after the prints came home is cleared');
    eq(await holds('pa'), before, 'no second print is minted');
    ok((await serials.serialStats(coll)).minted === minted, 'the edition counter does not move');
    const rel2 = await trades.releaseStuckEscrow('false-stuck');
    ok(rel2.ok && !rel2.cleared && (await holds('pa')).join() === before.join(), 'a second return changes nothing');
    ok(await total() === start, 'the false stuck offer did not change the universe');
  }

  // Exact give + a pinned ask: the OLDEST prints go into escrow, the newest stay.
  const o1 = await trades.createTrade({ seasonId: season.id, from: 'pa', kind: 'direct', to: 'pb', give: [sk(1, 2, ['1.0.1', '1.0.2'])], get: [sk(9, 1, ['9.0.1'])] });
  ok(o1.ok, 'an offer with chosen prints is made: ' + (o1.ok ? '' : o1.error));
  if (!o1.ok) return;
  eq(await inEscrow(o1.trade.id), ['1.0.1', '1.0.2'], 'exactly the chosen prints are in escrow');
  eq(await holds('pa'), ['1.0.3', '1.0.4', '2.0.1'], 'the others stay with the offerer');
  ok(await total() === start, 'copies conserved after a picked offer');

  // A print in another offer, or one that is not yours, is refused.
  const dup = await trades.createTrade({ seasonId: season.id, from: 'pa', kind: 'listing', give: [sk(1, 1, ['1.0.1'])], get: [sk(9)] });
  ok(!dup.ok && /another trade offer/.test(dup.error), 'a print already in another offer is refused: ' + JSON.stringify(dup));
  const notMine = await trades.createTrade({ seasonId: season.id, from: 'pa', kind: 'listing', give: [sk(1, 1, ['1.0.9'])], get: [sk(9)] });
  ok(!notMine.ok && /isn.t yours/.test(notMine.error), 'a print you never held is refused');
  const pbPrint = await trades.createTrade({ seasonId: season.id, from: 'pa', kind: 'direct', to: 'pb', give: [sk(2)], get: [sk(9, 1, ['9.0.7'])] });
  ok(!pbPrint.ok && /hold/.test(pbPrint.error), 'asking for a print they do not hold is refused');
  const listAsk = await trades.createTrade({ seasonId: season.id, from: 'pa', kind: 'listing', give: [sk(2)], get: [sk(9, 1, ['9.0.1'])] });
  ok(!listAsk.ok && /listing/.test(listAsk.error), 'a listing cannot pin the taker prints');
  ok(await total() === start, 'refused offers change nothing');

  // The asked-for print moves away before accept: the accept fails with a clear message and the offer stays open.
  const away = await trades.createTrade({ seasonId: season.id, from: 'pb', kind: 'listing', give: [sk(9, 1, ['9.0.1'])], get: [sk(2)] });
  ok(away.ok, 'pb puts 9.0.1 in another offer');
  const late = await trades.acceptTrade(o1.trade.id, 'pb');
  ok(!late.ok && /no longer hold/.test(late.error) && /Serial #[0-9]{7}/.test(late.error), 'accept fails when the pinned edition has moved: ' + JSON.stringify(late));
  ok((await trades.getTrade(o1.trade.id))?.status === 'open', 'the offer stays open for a counter');
  if (away.ok) ok((await trades.cancelTrade(away.trade.id, 'pb')).ok, 'pb withdraws that listing');
  eq(await holds('pb'), ['9.0.1', '9.0.2', '9.0.3'], 'the refund returned the very same print');

  // Now it settles with exactly those prints.
  ok((await trades.acceptTrade(o1.trade.id, 'pb')).ok, 'accept works once pb holds the print again');
  eq(await holds('pb'), ['1.0.1', '1.0.2', '9.0.2', '9.0.3'], 'pb received exactly the chosen prints');
  eq(await holds('pa'), ['1.0.3', '1.0.4', '2.0.1', '9.0.1'], 'pa received exactly the pinned print');
  ok(await total() === start, 'copies conserved after settling picked prints');
  eq((await trades.getTrade(o1.trade.id))?.get[0].ids, ['9.0.1'], 'the record keeps the prints');

  // The taker chooses at accept: a listing asks for card 9, pb hands over 9.0.2 (not the newest 9.0.3).
  const l1 = await trades.createTrade({ seasonId: season.id, from: 'pa', kind: 'listing', give: [sk(1, 1)], get: [sk(9)] });
  ok(l1.ok, 'listing without chosen prints');
  if (l1.ok) {
    const bad = await trades.acceptTrade(l1.trade.id, 'pb', { [String(E(9))]: ['9.0.8'] });
    ok(!bad.ok && /no longer hold/.test(bad.error), 'a chosen print the taker does not hold is refused');
    const wrong = await trades.acceptTrade(l1.trade.id, 'pb', { [String(E(9))]: ['9.0.2', '9.0.3'] });
    ok(!wrong.ok, 'a wrong-sized choice is refused');
    ok((await trades.getTrade(l1.trade.id))?.status === 'open', 'refused accepts leave the listing open');
    ok((await trades.acceptTrade(l1.trade.id, 'pb', { [String(E(9))]: ['9.0.2'] })).ok, 'pb accepts with a chosen print');
    ok((await holds('pa')).includes('9.0.2') && !(await holds('pa')).includes('9.0.3'), 'the chosen print moved, not the newest');
    ok((await holds('pb')).includes('1.0.4'), 'the unpicked give side moved the newest print (1.0.4)');
  }

  // Unpicked on both sides: newest first, like before.
  const l2 = await trades.createTrade({ seasonId: season.id, from: 'pa', kind: 'listing', give: [sk(1, 1)], get: [sk(9)] });
  if (l2.ok) {
    ok((await trades.acceptTrade(l2.trade.id, 'pb')).ok, 'an unpicked accept works');
    ok((await holds('pa')).includes('9.0.3'), 'unpicked ask moved the newest print');
    ok((await holds('pb')).includes('1.0.3'), 'unpicked give moved the newest print');
  }
  ok(await total() === start, 'copies conserved after unpicked trades');

  // Cancel refunds the same prints; a counter carries ids across.
  const o2 = await trades.createTrade({ seasonId: season.id, from: 'pb', kind: 'direct', to: 'pc', give: [sk(1, 1, ['1.0.1'])], get: [sk(7)] });
  ok(o2.ok, 'pb offers 1.0.1 to pc');
  if (o2.ok) {
    ok((await trades.cancelTrade(o2.trade.id, 'pb')).ok, 'pb cancels');
    ok((await holds('pb')).includes('1.0.1') && (await inEscrow(o2.trade.id)).length === 0, 'cancel returns the chosen print');
    const o3 = await trades.createTrade({ seasonId: season.id, from: 'pb', kind: 'direct', to: 'pc', give: [sk(1, 1, ['1.0.2'])], get: [sk(7)] });
    if (o3.ok) {
      const ctr = await trades.counterTrade(o3.trade.id, 'pc', { give: [sk(7)], get: [sk(1, 1, ['1.0.2'])] });
      ok(ctr.ok, 'a counter may ask for the exact print that sits in the offer it answers: ' + (ctr.ok ? '' : ctr.error));
      if (ctr.ok) {
        eq(ctr.trade.get[0].ids, ['1.0.2'], 'the counter carries the ids');
        ok((await trades.acceptTrade(ctr.trade.id, 'pb')).ok, 'pb accepts the counter');
        ok((await holds('pc')).includes('1.0.2'), 'pc received exactly the print they asked for');
      }
    }
  }
  ok(await total() === start, 'copies conserved through everything');
  ok((await trades.listOpenTrades()).every(t => t.escrowed), 'every open offer still holds its escrow');
});
await sbx.deleteSandbox(box2.id);

// ── Favourite prints (ROADMAP 9.1) ──
const box3 = await sbx.createSandbox({ name: 'Trade favourites check', source: 'config' });
await runInSandbox(box3.id, async () => {
  const serials = await import('../lib/serials');
  const { saveUserSettings } = await import('../lib/user-settings-store');
  const season = (await kvLib.listSeasons())[0];
  const coll = season.collectionName;
  const sk = (cardNumber: number, count = 1, ids?: string[]) => ({ cardNumber, variant: 'regular' as const, count, ...(ids ? { ids } : {}) });
  const holds = async (u: string) => (await serials.getOwnerCopies(coll, u)).map(c => c.id).sort();
  const uidOf = async (u: string, id: string) => (await serials.getOwnerCopies(coll, u)).find(c => c.id === id)!.uid!;
  await trades.saveTradeSettings({ ...core.DEFAULT_TRADE_SETTINGS, cooldownSeconds: 0, maxOpenPerUser: 20 });
  await kvLib.saveCollection(coll, { fa: [E(1), E(1), E(1), E(2)], fb: [E(9), E(9), E(9)] });
  await serials.backfillSerials(coll, await kvLib.getCollection(coll));
  const fav = async (u: string, ids: string[]) => { const uids: number[] = []; for (const id of ids) uids.push(await uidOf(u, id)); await saveUserSettings(u, { favourites: uids }); };

  // A picked favourite is refused; nothing leaves the collection.
  await fav('fa', ['1.0.3']);
  const pickedFav = await trades.createTrade({ seasonId: season.id, from: 'fa', kind: 'direct', to: 'fb', give: [sk(1, 1, ['1.0.3'])], get: [sk(9)] });
  ok(!pickedFav.ok && /one of your favourites/.test(pickedFav.error), 'a picked favourite is refused');
  eq(await holds('fa'), ['1.0.1', '1.0.2', '1.0.3', '2.0.1'], 'a refused favourite takes nothing');

  // Unpicked: newest-first skips the favourite (1.0.3 is the newest) and the offer pins the others.
  const skip = await trades.createTrade({ seasonId: season.id, from: 'fa', kind: 'direct', to: 'fb', give: [sk(1, 2)], get: [sk(9)] });
  ok(skip.ok, 'an unpicked offer is made around the favourite');
  if (skip.ok) {
    eq([...skip.trade.give[0].ids!].sort(), ['1.0.1', '1.0.2'], 'the favourite is skipped');
    ok((await holds('fa')).includes('1.0.3'), 'the favourite stays with its owner');
    ok((await trades.cancelTrade(skip.trade.id, 'fa')).ok, 'fa cancels');
  }

  // Not enough non-favourites left.
  const tooMany = await trades.createTrade({ seasonId: season.id, from: 'fa', kind: 'listing', give: [sk(1, 3)], get: [sk(9)] });
  ok(!tooMany.ok && /favourite/.test(tooMany.error), 'three prints with one favourite is refused');
  await fav('fa', ['1.0.1', '1.0.2', '1.0.3']);
  const allFav = await trades.createTrade({ seasonId: season.id, from: 'fa', kind: 'listing', give: [sk(1, 1)], get: [sk(9)] });
  ok(!allFav.ok && /only have favourites/.test(allFav.error), 'only favourites left is refused');

  // The taker side: a favourite set after the offer stops the accept, and the offer stays open.
  await fav('fa', []);
  const direct = await trades.createTrade({ seasonId: season.id, from: 'fa', kind: 'direct', to: 'fb', give: [sk(1, 1)], get: [sk(9, 1, ['9.0.1'])] });
  ok(direct.ok, 'a direct offer pinning a print of fb');
  await fav('fb', ['9.0.1']);
  if (direct.ok) {
    const late = await trades.acceptTrade(direct.trade.id, 'fb');
    ok(!late.ok && /one of your favourites/.test(late.error), 'a pinned print that became a favourite fails at accept');
    ok((await trades.listOpenTrades()).some(t => t.id === direct.trade.id), 'the offer stays open');
    ok((await trades.cancelTrade(direct.trade.id, 'fa')).ok, 'fa cancels');
  }
  // A listing asking for a card: the taker's newest-first would be 9.0.3; favourite it and the accept uses 9.0.1/9.0.2 instead.
  await fav('fb', ['9.0.3']);
  const listing = await trades.createTrade({ seasonId: season.id, from: 'fa', kind: 'listing', give: [sk(1, 1)], get: [sk(9, 2)] });
  ok(listing.ok, 'a listing asking for two of card 9');
  if (listing.ok) {
    const taken = await trades.acceptTrade(listing.trade.id, 'fb');
    ok(taken.ok, 'fb takes the listing: ' + (taken.ok ? '' : taken.error));
    if (taken.ok) {
      eq([...taken.trade.get[0].ids!].sort(), ['9.0.1', '9.0.2'], 'the taker favourite is skipped');
      ok((await holds('fb')).includes('9.0.3'), 'the favourite stays with the taker');
    }
  }
  // Upgrades skip favourites too.
  const { upgradeCard } = await import('../lib/upgrade');
  const { DEFAULT_UPGRADE_COSTS } = await import('../lib/variants');
  const cost = DEFAULT_UPGRADE_COSTS.reverse;
  await kvLib.saveCollection(coll, { ...(await kvLib.getCollection(coll)), fu: Array(cost + 1).fill(E(1)) });
  await serials.backfillSerials(coll, await kvLib.getCollection(coll));
  const newest = `1.0.${(await serials.getOwnerCopies(coll, 'fu')).length}`;
  await fav('fu', [newest]);
  const up1 = await upgradeCard({ seasonId: season.id, username: 'fu', cardNumber: 1, from: 'regular' });
  ok(up1.ok, 'an upgrade is paid from the non-favourites: ' + (up1.ok ? '' : up1.error));
  ok((await holds('fu')).includes(newest), 'the favourite was not spent');
  ok(core.ownedCopies((await kvLib.getCollection(coll)).fu, 1, 'regular') === 1, 'only the favourite regular is left');
  const up2 = await upgradeCard({ seasonId: season.id, username: 'fu', cardNumber: 1, from: 'regular' });
  ok(!up2.ok, 'a second upgrade is refused');
});
await sbx.deleteSandbox(box3.id);

// ── Staff reverse a completed trade (ROADMAP 9.2) ──
const box4 = await sbx.createSandbox({ name: 'Trade reversal check', source: 'config' });
await runInSandbox(box4.id, async () => {
  const serials = await import('../lib/serials');
  const { kv: sbKv } = await import('../lib/db');
  const season = (await kvLib.listSeasons())[0];
  const coll = season.collectionName;
  const sk = (cardNumber: number, count = 1) => ({ cardNumber, variant: 'regular' as const, count });
  const holds = async (u: string) => (await serials.getOwnerCopies(coll, u)).map(c => c.id).sort();
  const sum = async () => Object.values(await kvLib.getCollection(coll)).reduce((n, l) => n + l.length, 0) + (await trades.listOpenTrades()).reduce((n, t) => n + (t.escrowed ? core.itemCopies(t.give) : 0), 0);
  await trades.saveTradeSettings({ ...core.DEFAULT_TRADE_SETTINGS, cooldownSeconds: 0, maxOpenPerUser: 20 });
  await kvLib.saveCollection(coll, { ha: [E(3), E(3), E(1)], hb: [E(4), E(4)], hc: [E(7)], oa: [E(5)], ob: [E(6)] });
  await serials.backfillSerials(coll, await kvLib.getCollection(coll));
  const start = await sum();
  const swap = async (a: string, b: string, g: number, w: number) => {
    const o = await trades.createTrade({ seasonId: season.id, from: a, kind: 'direct', to: b, give: [sk(g)], get: [sk(w)] });
    if (!o.ok) throw new Error('offer failed: ' + o.error);
    const acc = await trades.acceptTrade(o.trade.id, b);
    if (!acc.ok) throw new Error('accept failed: ' + acc.error);
    return acc.trade;
  };

  // Settlement now records the exact prints.
  const t1 = await swap('ha', 'hb', 3, 4);
  eq([t1.moved?.give.length, t1.moved?.get.length], [1, 1], 'the accepted trade records the prints that moved');
  ok((await trades.reverseTrade(t1.id, { login: 'staff1', role: 'mod' }, '  ')).ok === false, 'a reason is required');
  ok(await sum() === start, 'nothing moved by the refused attempt');

  // A print that sits in an open offer, then one that has moved on: refused, nothing changes.
  const movedPrint = t1.moved!.give[0];
  const esc = await trades.createTrade({ seasonId: season.id, from: 'hb', kind: 'listing', give: [{ cardNumber: 3, variant: 'regular' as const, count: 1, ids: [movedPrint] }], get: [sk(7)] });
  ok(esc.ok, 'hb lists the print they received');
  const inOffer = await trades.reverseTrade(t1.id, { login: 'staff1', role: 'mod' }, 'mistake');
  ok(!inOffer.ok && /open offer/.test(inOffer.error), 'a print in an open offer blocks the reversal: ' + (inOffer.ok ? '' : inOffer.error));
  ok((await trades.listOpenTrades()).some(t => t.id === (esc.ok ? esc.trade.id : '') && t.escrowed), 'the escrow was left alone');
  if (esc.ok) {
    ok((await trades.acceptTrade(esc.trade.id, 'hc')).ok, 'hc takes the listing');
    const gone = await trades.reverseTrade(t1.id, { login: 'staff1', role: 'mod' }, 'mistake');
    ok(!gone.ok && /traded to @hc/.test(gone.error), 'a print that moved on blocks the reversal: ' + (gone.ok ? '' : gone.error));
    ok((await holds('hc')).includes(movedPrint), 'the print stays with its new holder');
    // Put it back by hand so the next steps are clean: hc swaps it for the original card.
    const back = await trades.createTrade({ seasonId: season.id, from: 'hc', kind: 'direct', to: 'hb', give: [{ cardNumber: 3, variant: 'regular' as const, count: 1, ids: [movedPrint] }], get: [sk(7)] });
    ok(back.ok && (await trades.acceptTrade(back.trade.id, 'hb')).ok, 'hc hands it back to hb');
  }

  // Happy path on a fresh trade: every print returns, with a 'reversed' event naming the staff member.
  const t2 = await swap('oa', 'ob', 5, 6);
  const rev = await trades.reverseTrade(t2.id, { login: 'staff1', role: 'mod' }, 'wrong person');
  ok(rev.ok, 'the trade is reversed: ' + (rev.ok ? '' : rev.error));
  ok((await holds('oa')).includes(t2.moved!.get[0]) === false && (await holds('oa')).includes(t2.moved!.give[0]), 'oa has their own print back, not the one they got');
  ok((await holds('ob')).includes(t2.moved!.get[0]), 'ob has their own print back');
  const ev = (await serials.getCopy(coll, t2.moved!.give[0]))!.ev.at(-1)!;
  ok(ev.type === 'reversed' && ev.who === 'staff1' && ev.note === 'wrong person', 'the print history records the reversal');
  ok(await sum() === start, 'copies are conserved through trade and reversal');
  const again = await trades.reverseTrade(t2.id, { login: 'staff1', role: 'mod' }, 'again');
  ok(!again.ok && /already reversed/.test(again.error), 'a trade cannot be reversed twice');
  const rec = await trades.getTrade(t2.id);
  ok(rec?.status === 'accepted' && rec.reversedBy === 'staff1' && rec.reverseReason === 'wrong person' && !!rec.reversedAt, 'the record keeps its status and gains the reversal');

  // An older trade (no recorded prints) is rebuilt from the ledger.
  const t4 = await swap('oa', 'ob', 5, 6);
  const hist = (await sbKv.get<import('../lib/trade-core').Trade[]>('trades:history')) ?? [];
  for (const h of hist) if (h.id === t4.id) delete h.moved;
  await sbKv.set('trades:history', hist);
  const old = await trades.reverseTrade(t4.id, { login: 'staff2', role: 'mod' }, 'old one');
  ok(old.ok && old.trade.moved?.give.length === 1, 'an older trade is rebuilt from the ledger and reversed: ' + (old.ok ? '' : old.error));
  // ...and one that cannot be rebuilt is refused.
  const t5 = await swap('oa', 'ob', 5, 6);
  const hist2 = (await sbKv.get<import('../lib/trade-core').Trade[]>('trades:history')) ?? [];
  for (const h of hist2) if (h.id === t5.id) { delete h.moved; h.resolvedAt = 1_000; }
  await sbKv.set('trades:history', hist2);
  const stale = await trades.reverseTrade(t5.id, { login: 'staff2', role: 'mod' }, 'too old');
  ok(!stale.ok && /too old/.test(stale.error), 'a trade that cannot be rebuilt with certainty is refused');
  ok((await trades.listOpenTrades()).every(t => t.escrowed), 'every open offer still holds its escrow');
});
await sbx.deleteSandbox(box4.id);

ok(JSON.stringify(await prodKv.get('trades:open')) === prodBefore, 'production trades untouched');
await sbx.deleteSandbox(box.id);
console.log('trade checks passed');
