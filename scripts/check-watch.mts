// Checks listing alerts: pure matching, the per-card index, and that a new board listing notifies the right viewers once.
// Needs the mock KV (node scripts/mock-kv.cjs); refuses anything non-local.  Run: npx tsx scripts/check-watch.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

// ── pure ──
const w = await import('../lib/watch-core');
const us = await import('../lib/user-settings');
const s = us.sanitizeUserSettings({ wanted: [1], watches: [{ card: 2, variant: 'shiny' }, { card: 2, variant: 'shiny' }, { card: 3, variant: null }, { card: 4, variant: 'bogus' }, { card: 'x' }, { card: 0 }] });
ok(s.watches.length === 3 && s.watches[2].variant === null, 'watches are cleaned: duplicates, bad cards dropped, an unknown version means any');
ok(us.sanitizeUserSettings({ watches: Array.from({ length: 30 }, (_, i) => ({ card: i + 1, variant: null })) }).watches.length === us.WATCH_MAX, 'capped');
const items = [{ cardNumber: 1, variant: 'regular' as const }, { cardNumber: 2, variant: 'regular' as const }, { cardNumber: 2, variant: 'shiny' as const }, { cardNumber: 3, variant: 'full' as const }, { cardNumber: 9, variant: 'regular' as const }];
const hits = w.matchingAlerts(s, items).map(i => `${i.cardNumber}.${i.variant}`);
ok(hits.join() === '1.regular,2.shiny,3.full', `Looking for = any version, a watch = its version (or any): ${hits}`);
ok(w.alertCards(s).sort().join() === '1,2,3,4', 'index keys: the Looking for card plus every watched card');
ok(!us.wantsNotice({ ...s, notifyWatch: false }, 'watch') && us.wantsNotice({ ...s, notifyWatch: false }, 'offer'), 'the watch switch only governs watch notices');
ok(w.watchLabel({ card: 2, variant: 'shiny' }, () => 'Gouda') === 'Full Art Holo Gouda' && w.watchLabel({ card: 2, variant: null }, () => 'Gouda') === 'Gouda (any version)', 'labels');

const wc = w.wantedCounts([{ cardNumber: 1 }, { cardNumber: 2 }, { cardNumber: 2 }, { cardNumber: 3 }], { 1: ['alice', 'Bob', 'carol'], 2: ['alice', 'alice'], 3: ['bob'] }, ['bob']);
ok(JSON.stringify(wc) === '{"1":2,"2":1}', `wanted counts drop the excluded, count a person once, and skip zeros: ${JSON.stringify(wc)}`);
ok(Object.keys(w.wantedCounts([{ cardNumber: 9 }], {}, [])).length === 0, 'no watchers, no entry');

const ago = (at: number) => `${at}ago`;
ok(w.alertHealth(s, null, ago) === 'Watching 4 cards. Last alert: never.', `health, never fired: ${w.alertHealth(s, null, ago)}`);
ok(w.alertHealth({ ...s, wanted: [], watches: [s.watches[0]], notifyWatch: false }, 5, ago) === 'Watching 1 card. Listing alerts are switched off. Last alert: 5ago.', 'health: one card, switched off, fired');

// ── stored ──
const kvLib = await import('../lib/kv');
const { kv } = await import('../lib/db');
const store = await import('../lib/user-settings-store');
const idx = await import('../lib/watch-index');
const trades = await import('../lib/trades');
const tc = await import('../lib/trade-core');
const notif = await import('../lib/trade-notify');
const { encodeEntry } = await import('../lib/variants');

await kvLib.seedSeason1();
const pack = (await kvLib.getPack('pack1'))!; await kvLib.savePack({ ...pack, upgradesEnabled: true } as never);
const season = (await kvLib.listSeasons())[0]; await kvLib.setActiveSeason(season.id);
const [a, b, c] = await kvLib.getPackCards('pack1');
await kv.del('watch:idx:ready');
await kvLib.saveCollection(season.collectionName, { alice: [encodeEntry(c.number, 'regular')], bob: [encodeEntry(c.number, 'regular')], carol: [encodeEntry(a.number, 'regular'), encodeEntry(b.number, 'shiny'), encodeEntry(a.number, 'regular')], dave: [encodeEntry(c.number, 'regular')] });
await store.saveUserSettings('alice', { wanted: [a.number] });
await store.saveUserSettings('bob', { watches: [{ card: b.number, variant: 'shiny' }] });
await store.saveUserSettings('dave', { wanted: [a.number], notifyWatch: false });
ok((await idx.watchersOf([a.number])).sort().join() === 'alice,dave', 'the index finds who wants a card');
await store.saveUserSettings('alice', { wanted: [] });
ok((await idx.watchersOf([a.number])).join() === 'dave', 'removing a card from the list removes the viewer from the index');
await store.saveUserSettings('alice', { wanted: [a.number] });

await trades.saveTradeSettings({ ...tc.DEFAULT_TRADE_SETTINGS, cooldownSeconds: 0 });
const lst = await trades.createTrade({ seasonId: season.id, from: 'carol', kind: 'listing', give: [{ cardNumber: a.number, variant: 'regular', count: 1 }], get: [{ cardNumber: c.number, variant: 'regular', count: 1 }] });
ok(lst.ok, 'carol lists a regular of card a');
const noticesOf = async (u: string) => { for (let i = 0; i < 20; i++) { const n = (await notif.listNotices(u)).notices.filter(x => x.kind === 'watch'); if (n.length) return n; await new Promise(r => setTimeout(r, 100)); } return []; };
const an = await noticesOf('alice');
ok(an.length === 1 && an[0].text.includes('@carol listed') && an[0].tradeId === (lst as { trade: { id: string } }).trade.id, 'alice (Looking for) is told about the listing');
ok((await notif.listNotices('bob')).notices.filter(x => x.kind === 'watch').length === 0, 'bob watches the Shiny only, so a regular listing does not tell him');
ok((await notif.listNotices('dave')).notices.filter(x => x.kind === 'watch').length === 0, 'dave switched watch notices off');
ok((await notif.listNotices('carol')).notices.filter(x => x.kind === 'watch').length === 0, 'the lister is never told about their own listing');

const lst2 = await trades.createTrade({ seasonId: season.id, from: 'carol', kind: 'listing', give: [{ cardNumber: b.number, variant: 'shiny', count: 1 }], get: [{ cardNumber: c.number, variant: 'regular', count: 1 }] });
ok(lst2.ok, 'carol lists the shiny');
ok((await noticesOf('bob')).length === 1, 'bob is told about the shiny listing');
ok((await notif.listNotices('alice')).notices.filter(x => x.kind === 'watch').length === 1, 'alice is not told about a listing she does not want');
ok(typeof await idx.lastAlertAt('alice') === 'number' && typeof await idx.lastAlertAt('bob') === 'number', 'a told viewer has a last-alert time');
ok(await idx.lastAlertAt('dave') === null && await idx.lastAlertAt('carol') === null, 'dave (switched off) and the lister never fired: never');
// ── a failed index build is not remembered as ready ──
const realFetch = globalThis.fetch;
// Makes the mock KV answer 500 to a read of any key matching `re` (null = healthy again).
const failGetsFor = (re: RegExp | null) => { globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
  const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown[]) : [];
  const cmd = (Array.isArray(body[0]) ? body[0] : body) as string[]; // the client sends [["get", key]]
  if (re && String(cmd[0]).toLowerCase() === 'get' && re.test(String(cmd[1]))) return new Response(JSON.stringify({ error: 'kv down' }), { status: 500 });
  return realFetch(input, init);
}) as typeof fetch; };
const wipeIndex = async () => { await kv.del('watch:idx:ready'); for (const n of [a.number, b.number]) await kv.del(`watch:idx:${n}`); };
for (const [label, re] of [['the viewer list cannot be read', /^season/], ["a viewer's settings cannot be read", /^user:.*:settings$/]] as const) {
  await wipeIndex();
  failGetsFor(re);
  ok((await idx.watchersOf([a.number])).length === 0, `${label}: nobody is found while KV is failing`);
  failGetsFor(null);
  ok(!(await kv.get('watch:idx:ready')), `${label}: the index is not marked ready`);
  ok((await idx.watchersOf([a.number])).sort().join() === 'alice,dave', `${label}: the next lookup rebuilds the index`);
  ok(!!(await kv.get('watch:idx:ready')), `${label}: a clean build is marked ready`);
}
console.log('watch checks passed');
