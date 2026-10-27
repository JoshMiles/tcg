// The Admin Users list is filtered, sorted and paged on the server (lib/users-list.ts), and secret "last used" is throttled (lib/secret-used.ts).
// Needs the mock KV for the last-used part. Run: npx tsx scripts/check-users-list.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
process.env.VERCEL_ENV = 'development';
const ok = (c: unknown, m: string) => { if (!c) throw new Error('FAILED: ' + m); };

const L = await import('../lib/users-list');
const row = (o: Partial<import('../lib/users-list').UserRow> & { username: string }): import('../lib/users-list').UserRow => ({
  displayName: o.username, isTwitch: false, tags: [], noTrading: false, hidden: false, hasNotes: false, unique: 0, pulls: 0, shiny: 0, full: 0,
  primary: null, otherSeasons: 0, score: null, scoreRank: null, joined: null, lastActive: null, trades: 0, ...o,
});
const NOW = 1_800_000_000_000, DAY = 86_400_000;
const rows = [
  row({ username: 'amy', unique: 5, pulls: 9, score: 50, tags: ['vip'], lastActive: NOW - 3_600_000, primary: { name: 'S1', owned: 10, total: 10, pct: 100 }, shiny: 1 }),
  row({ username: 'bob', displayName: 'Bobby', unique: 8, pulls: 8, score: 90, lastActive: NOW - 10 * DAY, hidden: true, hasNotes: true, full: 2 }),
  row({ username: 'cat', unique: 8, pulls: 12, tags: ['vip', 'mod'], lastActive: null, noTrading: true, trades: 4 }),
  row({ username: 'dan', unique: 1, pulls: 1, lastActive: NOW - 40 * DAY, joined: NOW - DAY }),
];
const q = (o: Record<string, string>) => L.parseUsersQuery(o);
const names = (o: Record<string, string>) => L.filterSortUsers(rows, q(o), NOW).map(r => r.username).join(',');

ok(names({}) === 'cat,bob,amy,dan', 'default sort is most cards, ties by pulls');
ok(names({ sort: 'name' }) === 'amy,bob,cat,dan', 'sort by name');
ok(names({ sort: 'score' }) === 'bob,amy,cat,dan' || names({ sort: 'score' }) === 'bob,amy,dan,cat', 'sort by score, unscored last');
ok(names({ sort: 'bogus' }) === names({}), 'an unknown sort falls back to the default');
ok(names({ q: 'BOBBY' }) === 'bob', 'search matches display name, case-insensitively');
ok(names({ q: 'mod' }) === 'cat', 'search matches tags');
ok(names({ tag: 'vip' }) === 'cat,amy', 'tag filter');
ok(names({ restricted: '1' }) === 'cat,bob', 'restricted = no trading or hidden');
ok(names({ complete: '1' }) === 'amy', 'complete collection');
ok(names({ shiny: '1' }) === 'amy' && names({ full: '1' }) === 'bob', 'has Full Art Holo / Full Art');
ok(names({ notes: '1' }) === 'bob', 'has notes');
ok(names({ activity: '24h' }) === 'amy', 'active in 24h');
ok(names({ activity: '30d' }) === 'bob,amy' || names({ activity: '30d' }) === 'amy,bob', 'active in 30 days');
ok(names({ activity: 'never' }) === 'cat', 'never seen');
ok(names({ tag: 'vip', restricted: '1' }) === 'cat', 'filters combine');
ok(L.parseUsersQuery({ page: '-3' }).page === 1 && L.parseUsersQuery({ page: 'x' }).page === 1 && L.parseUsersQuery({ page: ['4', '5'] }).page === 4, 'page is a whole number from 1');

const big = Array.from({ length: 120 }, (_, i) => i);
const p3 = L.pageOfUsers(big, 3);
ok(p3.pages === 3 && p3.page === 3 && p3.items.length === 20 && p3.items[0] === 100, 'page 3 of 120 holds the last 20');
ok(L.pageOfUsers(big, 99).page === 3 && L.pageOfUsers(big, 0).page === 1, 'the page number is clamped');
ok(L.pageOfUsers([], 1).pages === 1 && L.pageOfUsers([], 1).items.length === 0, 'an empty list is one empty page');

const qs = L.usersQueryString(q({ q: 'a b', sort: 'name', restricted: '1', page: '2' }));
ok(qs === 'q=a+b&sort=name&restricted=1', 'changing nothing resets to page 1 and keeps the filters');
ok(L.usersQueryString(q({}), { page: 2 }) === 'page=2' && L.usersQueryString(q({ tag: 'vip' }), { tag: '' }) === '', 'defaults are left out');
ok(JSON.stringify(q(Object.fromEntries(new URLSearchParams(qs)))) === JSON.stringify(q({ q: 'a b', sort: 'name', restricted: '1' })), 'the query round-trips');

const csv = L.usersCsv(L.filterSortUsers(rows, q({ restricted: '1' }), NOW)).split('\n');
ok(csv.length === 3 && csv[0].startsWith('username,display name') && csv[1].includes('"no trading"'), 'CSV has the head and one line per row, whole list');

// ---- secret last used ----
const S = await import('../lib/secret-used');
ok(S.dueToRecord(undefined, 1000) && !S.dueToRecord(1000, 1000 + 59_999) && S.dueToRecord(1000, 1000 + 60_000), 'throttle: first write, then not for a minute');
const { prodKv } = await import('../lib/db');
await prodKv.del('secret:lastused');
S.resetSecretUsedThrottle();
S.noteSecretUsed('CRON_SECRET', '/api/cron/backup', 5_000);
S.noteSecretUsed('CRON_SECRET', '/api/cron/minute', 6_000); // inside the minute: skipped
await new Promise(r => setTimeout(r, 300));
let used = await S.readSecretsLastUsed();
ok(used.CRON_SECRET?.at === 5_000 && used.CRON_SECRET.route === '/api/cron/backup', 'the first use is stored, the one inside the minute is not');
S.noteSecretUsed('CRON_SECRET', '/api/cron/minute', 66_000);
S.noteSecretUsed('OVERLAY_KEY', '/api/overlay/queue', 66_000);
await new Promise(r => setTimeout(r, 300));
used = await S.readSecretsLastUsed();
ok(used.CRON_SECRET.at === 66_000 && used.CRON_SECRET.route === '/api/cron/minute' && used.OVERLAY_KEY.route === '/api/overlay/queue', 'a use after a minute is stored, per secret');
ok(JSON.stringify(used).indexOf('Bearer') < 0, 'no secret value in the record');
await prodKv.del('secret:lastused');
console.log('users list and secret last used checks passed');
