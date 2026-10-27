// Checks timed trade restrictions (ROADMAP 51.3, trial): the "is blocked now" helper, then saveFlags storing a validated end.
// Needs the mock KV running (node scripts/mock-kv.cjs); refuses anything non-local.
// Run: npx tsx scripts/check-restriction.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';

const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const { tradeBlockedNow, liveUntil, untilFromDays, KEEP_UNTIL } = await import('../lib/restriction');
const now = 1_000_000;
ok(!tradeBlockedNow(undefined, now) && !tradeBlockedNow({}, now) && !tradeBlockedNow({ noTrading: false, until: now + 5 }, now), 'no flag, no block');
ok(tradeBlockedNow({ noTrading: true }, now), 'no until: blocked with no end, as before');
ok(tradeBlockedNow({ noTrading: true, until: now + 1 }, now), 'future until: blocked');
ok(!tradeBlockedNow({ noTrading: true, until: now }, now) && !tradeBlockedNow({ noTrading: true, until: now - 1 }, now), 'past until: not blocked');
ok(liveUntil({ noTrading: true, until: now + 1 }, now) === now + 1 && liveUntil({ noTrading: true, until: now - 1 }, now) === undefined && liveUntil({ noTrading: true }, now) === undefined, 'liveUntil only for a live timed block');
ok(untilFromDays(3, now) === now + 3 * 86_400_000 && untilFromDays(0, now) === undefined && untilFromDays(5, now) === undefined && untilFromDays(-5, now) === undefined && untilFromDays(NaN, now) === undefined, 'only the allowed choices give an end');

const admin = await import('../lib/user-admin');
const kvLib = await import('../lib/kv');
await kvLib.saveUserProfile({ username: 'timed', displayName: 'timed', createdAt: 1 });
const flagsOf = async () => (await kvLib.getUserProfile('timed'))?.flags;

ok((await admin.saveFlags('timed', { noTrading: true, reason: 'x' }, 7)).ok, 'saves a 7 day block');
const f = await flagsOf();
ok(f?.until && f.until > Date.now() + 6.9 * 86_400_000 && f.until < Date.now() + 7.1 * 86_400_000, 'stores about 7 days from now');
ok(await admin.isTradeBlocked('timed'), 'blocked while the end is ahead');

await admin.saveFlags('timed', { noTrading: true, reason: 'edited' }, KEEP_UNTIL);
ok((await flagsOf())?.until === f.until, 'KEEP_UNTIL keeps the same end');

await admin.saveFlags('timed', { noTrading: true }, 99);
ok((await flagsOf())?.until === undefined && await admin.isTradeBlocked('timed'), 'a choice outside the list stores no end (blocked until lifted)');

await admin.saveFlags('timed', { noTrading: true }, 1);
const p = (await kvLib.getUserProfile('timed'))!;
await kvLib.saveUserProfile({ ...p, flags: { ...p.flags, until: Date.now() - 1000 } });
ok(!(await admin.isTradeBlocked('timed')), 'a past end lifts the block with no write');
await admin.saveFlags('timed', { noTrading: true }, KEEP_UNTIL);
ok((await flagsOf())?.until === undefined, 'KEEP_UNTIL on an expired block does not revive the old end');

await admin.saveFlags('timed', { noTrading: false, hideFromBoard: true }, 7);
ok((await flagsOf())?.until === undefined, 'an end is dropped when trading is not blocked');
console.log('check-restriction: ok');
