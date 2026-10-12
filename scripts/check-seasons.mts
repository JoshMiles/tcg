// Checks the season lifecycle: awards, schedule timing, activation wrapping up the old season, the lazy scheduler and the trading freeze.
// Needs the mock KV running (node scripts/mock-kv.cjs); refuses anything non-local. Run: npx tsx scripts/check-seasons.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';

const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const { encodeEntry } = await import('../lib/variants');
const E = (n: number, v: 'regular' | 'reverse' | 'full' | 'shiny' = 'regular') => encodeEntry(n, v);

// ── Pure: timing badges, due-schedule detection and awards ──
const { seasonTiming } = await import('../app/admin/seasons/season-timing');
const kvLib = await import('../lib/kv');
const wrap = await import('../lib/season-wrap');
const now = Date.now();
const base = { id: 's', name: 'S', collectionName: 'S', active: false, status: 'published' as const, createdAt: now, maxConcurrentPacks: 1, packIds: [] };
ok(seasonTiming({ ...base, startsAt: now + 3 * 86_400_000 })?.label.startsWith('Starts in 3d'), 'a future start is shown as "Starts in 3d"');
ok(seasonTiming({ ...base, active: true, endsAt: now + 6 * 3_600_000 })?.label === 'Ends in 6h', 'an active season shows when it ends');
ok(seasonTiming({ ...base, endedAt: now - 1000, startsAt: now + 1000 }) === null, 'an ended season has no timing badge');
ok(!kvLib.scheduleDue([{ ...base, startsAt: now + 1000, autoStart: true }]), 'a start in the future is not due');
ok(kvLib.scheduleDue([{ ...base, startsAt: now - 1000, autoStart: true }]), 'a passed start with auto-start is due');
ok(!kvLib.scheduleDue([{ ...base, startsAt: now - 1000 }]), 'a passed start without auto-start is not due');
ok(kvLib.scheduleDue([{ ...base, active: true, endsAt: now - 1000 }]), 'an active season past its end is due');
ok(!kvLib.scheduleDue([{ ...base, active: true, endsAt: now - 1000, endedAt: now }]), 'an already-ended season is not due again');

const row = (username: string, score: number, uniqueCards: number, copies: number, complete = false, v = { regular: 0, reverse: 0, full: 0, shiny: 0 }) =>
  ({ username, score, cardPoints: score, completionBonus: 0, setBonus: 0, complete, uniqueCards, copies, variants: v });
const awards = wrap.buildAwards([
  row('ann', 900, 10, 30, true, { regular: 20, reverse: 5, full: 3, shiny: 2 }),
  row('bob', 700, 12, 25, false, { regular: 25, reverse: 0, full: 0, shiny: 0 }),
  row('cat', 500, 5, 9),
]);
ok(awards.filter(a => ['champion', 'runner-up', 'third'].includes(a.id)).map(a => a.username).join() === 'ann,bob,cat', 'the podium follows the standings');
ok(awards.some(a => a.id === 'completionist' && a.username === 'ann'), 'a complete collection earns Completionist');
ok(awards.find(a => a.id === 'most-cards')?.username === 'bob', 'Biggest collection goes to the most different cards');
ok(awards.find(a => a.id === 'shiny-hunter')?.username === 'ann', 'Shiny hunter goes to the most Shinies');
ok(!awards.some(a => a.id === 'full-art' && a.username === 'bob'), 'no award for a variant nobody has more than zero of');

// ── Engine, in an isolated sandbox namespace ──
const db = await import('../lib/db');
const sbx = await import('../lib/sandbox');
const trades = await import('../lib/trades');
await kvLib.seedSeason1();
const box = await sbx.createSandbox({ name: 'Season check', source: 'config' });

await db.runInSandbox(box.id, async () => {
  const s1 = (await kvLib.listSeasons())[0];
  const packIds = s1.packIds;
  await kvLib.saveCollection(s1.collectionName, { ann: [E(1), E(2), E(3, 'shiny')], bob: [E(1)] });
  await kvLib.saveSeason({ id: 'next', name: 'Next', collectionName: 'NextDeck', active: false, status: 'published', createdAt: now, maxConcurrentPacks: 1, packIds });

  // Activating a season wraps up the one it replaces.
  const res = await wrap.activateWithWrapUp('next');
  ok(res.ok && res.replaced === s1.name, 'activating names the season it replaced');
  const old = (await kvLib.getSeason(s1.id))!;
  ok(!old.active && !!old.endedAt && old.tradingFrozen === true, 'the replaced season is ended with trading frozen');
  ok((await kvLib.getSeason('next'))!.active, 'the new season is active');
  const snap = await wrap.getSnapshot(s1.id);
  ok(!!snap && snap.standings[0].username === 'ann' && snap.awards.some(a => a.id === 'champion' && a.username === 'ann'), 'the snapshot holds the final standings and awards');
  ok((await wrap.getUserAwards('ann')).some(a => a.award.id === 'champion'), 'a viewer\'s awards are found across seasons');
  ok(Object.keys(await kvLib.getCollection(s1.collectionName)).length === 2, 'the ended season keeps every collection');

  // A frozen season refuses new trades.
  await trades.saveTradeSettings({ ...(await trades.getTradeSettings()), cooldownSeconds: 0 });
  const refused = await trades.createTrade({ seasonId: s1.id, from: 'ann', kind: 'direct', to: 'bob', give: [{ cardNumber: 1, variant: 'regular', count: 1 }], get: [{ cardNumber: 2, variant: 'regular', count: 1 }] });
  ok(!refused.ok && /closed/i.test(refused.error), 'trading is refused for a frozen season');

  // Reopening lifts the freeze.
  await wrap.reopenSeason(s1.id);
  const reopened = (await kvLib.getSeason(s1.id))!;
  ok(!reopened.endedAt && !reopened.tradingFrozen, 'reopening clears the ended mark and the freeze');

  // The lazy scheduler: a due start activates the season (and wraps up the active one); a due end wraps an active season up.
  await kvLib.saveSeason({ id: 'timed', name: 'Timed', collectionName: 'TimedDeck', active: false, status: 'published', createdAt: now, maxConcurrentPacks: 1, packIds, startsAt: now - 5000, autoStart: true });
  const active = await kvLib.getActiveSeason(); // runs the schedule
  ok(active?.id === 'timed', 'a due scheduled start becomes the active season on the next read');
  ok(!!(await kvLib.getSeason('next'))!.endedAt, 'the season it replaced was wrapped up');
  ok(!(await kvLib.getSeason('timed'))!.autoStart, 'auto-start is cleared once it has fired');
  await kvLib.saveSeason({ ...(await kvLib.getSeason('timed'))!, endsAt: now - 1000 });
  const none = await kvLib.getActiveSeason();
  ok(none === null, 'a season past its end is wrapped up on the next read');
  ok(!!(await kvLib.getSeason('timed'))!.endedAt && (await kvLib.getSeason('timed'))!.tradingFrozen === true, 'the ended season has a freeze');
});
await sbx.deleteSandbox(box.id);
console.log('season checks passed');
