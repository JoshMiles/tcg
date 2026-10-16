// Checks the bell's polling rules (version / 204, pace, title) and that notify() bumps the version. Needs the mock KV on :4111.
// Run: node scripts/mock-kv.cjs & KV_REST_API_URL=http://localhost:4111 KV_REST_API_TOKEN=dev KV_URL=redis://dev npx tsx scripts/check-notice-poll.mts
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const eq = (a: unknown, b: unknown, msg: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);

const c = await import('../lib/notice-poll-core');
eq(c.parseSince('7'), 7, 'a version parses');
eq(c.parseSince(null), null, 'no since');
eq(c.parseSince('abc'), null, 'junk is not a version');
eq(c.parseSince('-1'), null, 'negative is not a version');
eq(c.parseSince('1e3'), null, 'exponent is not a version');
ok(c.isUnchanged(3, 3), 'same version is unchanged (204)');
ok(!c.isUnchanged(3, 4), 'a newer version is a change');
ok(!c.isUnchanged(null, 0), 'no since always gets the full answer');
ok(c.isUnchanged(0, 0), 'version 0 with since=0 is unchanged');
eq(c.pollDelay(false, 0), c.POLL_FAST_MS, 'visible and active: 10s');
eq(c.pollDelay(false, c.IDLE_AFTER_MS - 1), c.POLL_FAST_MS, 'just under 5 minutes is still fast');
eq(c.pollDelay(false, c.IDLE_AFTER_MS), c.POLL_SLOW_MS, 'idle for 5 minutes: 60s');
eq(c.pollDelay(true, 0), null, 'hidden: no polling');
eq(c.titleWithCount('Trade | Cheesy', 2), '(2) Trade | Cheesy', 'title gets a prefix');
eq(c.titleWithCount('(2) Trade | Cheesy', 5), '(5) Trade | Cheesy', 'an old prefix is replaced');
eq(c.titleWithCount('(5) Trade | Cheesy', 0), 'Trade | Cheesy', 'no unread: no prefix');
eq(c.titleWithCount('Trade', 250), '(99+) Trade', 'big counts are capped');
const ns = [{ id: 'a', at: 10 }, { id: 'b', at: 20 }, { id: 'c', at: 30 }];
eq(c.freshNotices(ns, 15, new Set(['c'])).map(n => n.id), ['b'], 'only unread, not-yet-announced notices are fresh');

const { notify, getNoticeVersion, markNoticesSeen, listNotices } = await import('../lib/trade-notify');
const u = 'pollcheck_' + Date.now().toString(36);
eq(await getNoticeVersion(u), 0, 'a new viewer starts at version 0');
await notify(u, { kind: 'offer', text: 'one' });
eq(await getNoticeVersion(u), 1, 'a notice bumps the version');
await notify(u, { kind: 'admin', text: 'two' });
eq(await getNoticeVersion(u), 2, 'each notice bumps it again');
await markNoticesSeen(u);
eq(await getNoticeVersion(u), 3, 'marking as read bumps it so other tabs update');
eq((await listNotices(u)).notices.length, 2, 'both notices are kept');
console.log('notice poll checks passed');
