// Seeds the local mock KV with a realistic game for the page-by-page review (ROADMAP Phase 2): two seasons (Season 1 ended with a
// wrap-up snapshot, Season 2 active), three packs of the new season (variants and upgrades on / a draft / an archived one), 300
// viewers per season, numbered copies with unique numbers, open and finished trades, hidden / private / blocked viewers,
// achievements, a staff admin and a staff mod, and a few hundred activity events.
//
//   node scripts/mock-kv.cjs                          (port 4111)
//   npx tsx scripts/seed-review.mts                   (this script; refuses any non-local KV)
//
// Then run the dev server and the sweeps (see docs/review.md). Prints who to log in as.
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to seed non-local KV: ${url}`);
process.env.KV_REST_API_URL = url;
process.env.KV_REST_API_TOKEN ??= 'dev';
process.env.KV_URL ??= 'redis://dev';

const kvLib = await import('../lib/kv');
const { SEED_CARDS } = await import('../lib/seed');
const { DEFAULT_UPGRADE_COSTS, DEFAULT_VARIANT_WEIGHTS, encodeEntry } = await import('../lib/variants');
const { activateWithWrapUp } = await import('../lib/season-wrap');
const { seedUsers } = await import('../lib/sandbox-tools');
const { applyScenario } = await import('../lib/sandbox-scenarios');
const serials = await import('../lib/serials');
const trades = await import('../lib/trades');
const admin = await import('../lib/user-admin');
const settingsStore = await import('../lib/user-settings-store');
const ach = await import('../lib/achievements-store');
const staff = await import('../lib/staff');
const { SUPER_ADMINS } = await import('../lib/staff-core');
const { recordActivity } = await import('../lib/activity');
const { prodKv } = await import('../lib/db');
type Variant = import('../lib/types').Variant;
type Pack = import('../lib/types').Pack;
type Card = import('../lib/types').Card;

const say = (m: string) => console.log(m);
const must = <T,>(v: T | null | undefined, what: string): T => { if (v === null || v === undefined) throw new Error('seed failed: ' + what); return v; };

// Start from nothing so the seed is repeatable (mock KV only; the guard above refuses anything else).
let cursor: string | number = 0;
do {
  const [next, keys] = (await prodKv.scan(cursor, { match: '*', count: 500 })) as [string | number, string[]];
  if (keys.length) await prodKv.del(...keys);
  cursor = next;
} while (String(cursor) !== '0');

// ---- Season 1: the original single-version pack, filled with a crowd, then wrapped up ----
await kvLib.seedSeason1();
const s1 = must(await kvLib.getSeason('season1'), 'season 1');
await seedUsers(null, { count: 300, minPulls: 3, maxPulls: 150, shape: 'realistic' });
await kvLib.addCollectionEntry(s1.collectionName, 'alice', 1);
for (const c of SEED_CARDS) await kvLib.addCollectionEntry(s1.collectionName, 'alice', c.number);
say('Season 1: 300 viewers + alice with a full set');

// ---- Season 2: variants and upgrades, plus a draft pack and an archived pack ----
const base = { coverImageUrl: '/assets/pack-cover.png', weight: 1, accentColor: 'rgb(241,187,6)', tearBorderColor: 'rgb(218,163,18)', holoMinStars: 4, cardTime: 3, cooldownTime: 1, soundVolume: 1, createdAt: Date.now() };
const packWheel: Pack = { ...base, id: 'pack-wheel', name: 'Cheese Wheel Pack', active: true, status: 'published', upgradesEnabled: true, variantWeights: DEFAULT_VARIANT_WEIGHTS, upgradeCosts: DEFAULT_UPGRADE_COSTS };
const packDraft: Pack = { ...base, id: 'pack-draft', name: 'Work In Progress Pack', active: false, status: 'draft', upgradesEnabled: false, variantWeights: DEFAULT_VARIANT_WEIGHTS, upgradeCosts: DEFAULT_UPGRADE_COSTS };
const packOld: Pack = { ...base, id: 'pack-old', name: 'Retired Promo Pack', active: false, status: 'published', archived: true, archivedAt: Date.now(), upgradesEnabled: false, variantWeights: DEFAULT_VARIANT_WEIGHTS, upgradeCosts: DEFAULT_UPGRADE_COSTS };
const wheelCards: Card[] = SEED_CARDS.slice(0, 20).map(c => ({ ...c, id: `w${c.number}`, soundUrl: undefined, fullArtImageUrl: c.imageUrl }));
const draftCards: Card[] = SEED_CARDS.slice(20, 25).map((c, i) => ({ ...c, id: `d${i + 1}`, number: i + 1, soundUrl: undefined }));
const oldCards: Card[] = SEED_CARDS.slice(0, 5).map(c => ({ ...c, id: `o${c.number}`, soundUrl: undefined }));
for (const [p, cards] of [[packWheel, wheelCards], [packDraft, draftCards], [packOld, oldCards]] as const) { await kvLib.savePack(p); await kvLib.savePackCards(p.id, [...cards]); }
await kvLib.saveSeason({ id: 'season2', name: 'Aged Cheddar', collectionName: 'AgedCheddar', active: false, status: 'published', createdAt: Date.now(), maxConcurrentPacks: 1, packIds: [packWheel.id, packDraft.id] });
const act = await activateWithWrapUp('season2'); // wraps Season 1 up first: final standings, awards, trading frozen
if (!act.ok) throw new Error('could not activate season 2: ' + act.error);
const s2 = must(await kvLib.getSeason('season2'), 'season 2');
say(`Season 2 active; Season 1 wrapped up (${act.replaced ?? 'none'})`);

await seedUsers(null, { count: 300, minPulls: 3, maxPulls: 150, shape: 'realistic' });
const all = (n: number, v: Variant, count = 1) => Array.from({ length: count }, () => encodeEntry(n, v));
const grant = async (user: string, entries: number[]) => { await kvLib.ensureUserProfile(user); for (const e of entries) await kvLib.addCollectionEntry(s2.collectionName, user, e, 'grant'); };
await grant('alice', wheelCards.flatMap(c => [...all(c.number, 'regular', 2), ...(c.number % 3 === 0 ? all(c.number, 'reverse') : []), ...(c.number % 7 === 0 ? [...all(c.number, 'full'), ...all(c.number, 'shiny')] : [])]));
await grant('hoarder', wheelCards.flatMap(c => all(c.number, 'regular', 150))); // 3,000 copies: a heavy collector
for (const s of ['upgrade-ready', 'nearly-complete', 'complete-set', 'trade-pair', 'shiny-showcase'] as const) await applyScenario(null, s);
say('Season 2: 300 viewers, scenarios (upgrade_ready, one_card_short, completionist, trader_a / b, shiny_hunter), alice, hoarder');

// ---- hidden, private, blocked viewers and one very long name ----
const longName = 'a_very_long_username_25c';
await grant('hidden_hank', all(1, 'regular', 3));
await grant('private_pat', all(2, 'regular', 3));
await grant('blocked_bob', all(3, 'regular', 3));
await grant(longName, all(4, 'shiny', 2));
await admin.saveFlags('hidden_hank', { hideFromBoard: true, reason: 'review: hidden from public boards' });
await admin.saveFlags('blocked_bob', { noTrading: true, reason: 'review: blocked from trading' });
await settingsStore.saveUserSettings('private_pat', { privateProfile: true, bio: 'review: a private collector' });
await settingsStore.saveUserSettings('alice', { bio: 'review: heavy collector with every card.' });
await admin.saveTags('alice', ['VIP', 'review']);
say('Hidden: hidden_hank · private: private_pat · trade-blocked: blocked_bob · long name: ' + longName);

// ---- serials: number every existing copy, with unique copy numbers ----
for (const s of [s1, s2]) await serials.backfillSerials(s.collectionName, await kvLib.getCollection(s.collectionName));
say('Serials numbered for both seasons');

// ---- trades: an open listing, an open direct offer, and a finished swap ----
const a = (await kvLib.getCollection(s2.collectionName)).trader_a ?? [];
const b = (await kvLib.getCollection(s2.collectionName)).trader_b ?? [];
const cardOf = (e: number) => e % 1_000_000;
const aSpare = cardOf(a[0]); const bSpare = cardOf(b[0]);
const item = (n: number) => [{ cardNumber: n, variant: 'regular' as Variant, count: 1 }];
const listing = await trades.createTrade({ seasonId: s2.id, from: 'trader_a', kind: 'listing', give: item(aSpare), get: item(bSpare), note: 'review: open listing' });
const direct = await trades.createTrade({ seasonId: s2.id, from: 'alice', kind: 'direct', to: 'trader_b', give: item(wheelCards[0].number), get: item(bSpare), note: 'review: direct offer' });
const swap = await trades.createTrade({ seasonId: s2.id, from: 'trader_b', kind: 'direct', to: 'trader_a', give: item(bSpare), get: item(aSpare), note: 'review: finished swap' });
if (swap.ok) await trades.acceptTrade(swap.trade.id, 'trader_a');
say(`Trades: listing ${listing.ok ? 'ok' : 'FAILED ' + JSON.stringify(listing)}, direct ${direct.ok ? 'ok' : 'FAILED ' + JSON.stringify(direct)}, swap ${swap.ok ? 'ok' : 'FAILED'}`);

// ---- achievements ----
for (const u of ['alice', 'completionist', 'shiny_hunter', 'one_card_short']) await ach.syncAchievements(u);

// ---- staff ----
const actor = { login: SUPER_ADMINS[0].login, role: 'super' as const };
await kvLib.ensureUserProfile('review_admin'); await kvLib.ensureUserProfile('review_mod');
console.log((await staff.addStaff(actor, 'review_admin', 'admin')).message);
console.log((await staff.addStaff(actor, 'review_mod', 'mod')).message);

// ---- activity: a few hundred events ----
const board = Object.keys(await kvLib.getCollection(s2.collectionName));
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
for (let i = 0; i < 300; i++) {
  const c = pick(wheelCards); const user = pick(board);
  await recordActivity({
    type: 'pull', username: user, collectionName: s2.collectionName, cardNumber: c.number, cardName: c.name, stars: c.stars, packName: packWheel.name,
    variant: pick<Variant>(['regular', 'regular', 'regular', 'reverse', 'full', 'shiny']), isNew: Math.random() < 0.3, copies: 1 + Math.floor(Math.random() * 3), uniqueOwned: 1 + Math.floor(Math.random() * 20),
  });
}
await recordActivity({ type: 'grant', source: 'admin', username: 'alice', cardNumber: 1 });
await recordActivity({ type: 'reset', scope: 'season', username: 'blocked_bob' });
say('Activity: 300 pulls and two staff events');

say(`
Review data is ready.
  Admin ......... emergency password login (ADMIN_PASSWORD in .env.local, 'pw' in the documented setup)
  Admin (Twitch)  fake Twitch user "review_admin"
  Mod ........... fake Twitch user "review_mod"      (curl "http://localhost:4222/__as?login=review_mod")
  Viewer ........ "alice" (full set, bio, VIP), "tester" (new viewer), "trader_a", "completionist", "hoarder" (3,000 copies)
  Special ....... hidden_hank (hidden), private_pat (private), blocked_bob (no trading), ${longName} (long name)
  Seasons ....... Cheesy Starter Deck (ended, wrap-up saved), Aged Cheddar (active)
  Packs ......... Cheese Wheel Pack (variants + upgrades), Work In Progress Pack (draft), Retired Promo Pack (archived)`);
