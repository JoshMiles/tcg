// Checks the print of the week (ROADMAP 6.2): scoring, the pick rules, the weekly cron (once per ISO week, closed without the secret,
// nothing in a sandbox or outside production) and the admin store functions.
// Needs the mock KV (node scripts/mock-kv.cjs); refuses anything non-local.  Run: npx tsx scripts/check-print-of-week.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';

const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const eq = (a: unknown, b: unknown, msg: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);

const P = await import('../lib/print-of-week');
const H = 3_600_000;
const WEEK = 7 * 24 * H;
const t0 = 1_800_000_000_000;

// ── pure scoring ──
const base = { at: t0, owner: 'bob', n: 7, variant: 'regular' as const, origin: 'pull' as const, uid: 1_000_001 };
const passed = [
  { t: t0, type: 'minted' as const, who: 'alice' },
  { t: t0 + H, type: 'escrowed' as const, who: 'alice' },
  { t: t0 + 2 * H, type: 'traded' as const, who: 'alice', to: 'bob' },
];
const a = P.scorePrint({ ...base, ev: passed }, t0 + 3 * WEEK)!;
// 2 holders x3 + 1 trade x2 + 3 weeks = 11
eq([a.score, a.parts.holders, a.parts.trades, a.parts.ageWeeks], [11, 2, 1, 3], 'holders x3, trades x2, age in weeks');
eq(a.reason, 'Held by 2 collectors, traded once, 3 weeks old', 'reason line');

const solo = P.scorePrint({ ...base, owner: 'alice', ev: [passed[0]] }, t0 + H)!;
eq([solo.score, solo.reason], [3, 'Held by 1 collector'], 'a fresh single-holder print');

const first = P.scorePrint({ ...base, n: 1, variant: 'shiny', ev: [passed[0]], owner: 'alice' }, t0)!;
eq(first.score, 3 + 5 + 2, 'edition #1 +5, Shiny +2');
ok(P.scorePrint({ ...base, variant: 'full', owner: 'alice', ev: [passed[0]] }, t0)!.score === 5, 'Full Art +2');
const forged = P.scorePrint({ ...base, origin: 'upgrade', madeFrom: ['1.0.1', '1.0.2'], owner: 'alice', ev: [passed[0]] }, t0)!;
eq(forged.score, 3 + 2, 'forged +2');
ok(P.scorePrint({ ...base, owner: 'alice', ev: [passed[0]] }, t0 + 40 * WEEK)!.parts.ageWeeks === 8, 'age is capped at 8 weeks');

ok(P.scorePrint({ ...base, owner: 'escrow:abc', ev: passed }, t0) === null, 'a print in a trade offer is skipped');
ok(P.scorePrint({ ...base, owner: '', ev: passed }, t0) === null, 'a spent print is skipped');
ok(P.scorePrint({ ...base, uid: undefined, ev: passed }, t0) === null, 'a print without a number is skipped');

// ── picking ──
const cand = (uid: number, score: number, at: number): import('../lib/print-of-week').Candidate => ({ uid, copyId: `1.0.${uid}`, score, at, parts: a.parts, reason: 'x' });
const cs = [cand(1, 10, 50), cand(2, 14, 90), cand(3, 14, 20), cand(4, 3, 1)];
eq(P.pickPrintOfWeek(cs, [])?.uid, 3, 'highest score wins, the older print on a tie');
eq(P.pickPrintOfWeek(cs, [3])?.uid, 2, 'a recently picked print is skipped');
eq(P.pickPrintOfWeek(cs, [3, 2, 1, 4]), null, 'nothing left means no pick');
eq(P.pickPrintOfWeek([], []), null, 'no candidates');

let hist: import('../lib/print-of-week').PotwHistoryEntry[] = [];
for (let i = 1; i <= 25; i++) hist = P.pushHistory(hist, i, t0 + i * WEEK);
ok(hist.length === 20 && hist[0].uid === 25, 'history keeps the newest 20');
hist = P.pushHistory(hist, 24, t0 + 26 * WEEK);
ok(hist.filter(h => h.uid === 24).length === 1 && hist[0].uid === 24, 'a repeated uid moves to the front once');
eq(P.recentUids([{ uid: 1, at: t0 }, { uid: 2, at: t0 - 9 * WEEK }], t0 + 2 * WEEK), [1], 'only the last 8 weeks count');

eq(P.isoWeekKey(Date.UTC(2026, 9, 18, 20)), '2026-W42', 'ISO week of a Sunday');
eq(P.isoWeekKey(Date.UTC(2026, 9, 19, 0)), '2026-W43', 'the week turns on Monday');
eq(P.isoWeekKey(Date.UTC(2026, 0, 1)), '2026-W01', 'week 1');
eq(P.isoWeekKey(Date.UTC(2027, 0, 1)), '2026-W53', 'a January 1st can belong to last year\'s week 53');

// ── engine, mock KV ──
const db = await import('../lib/db');
const kvLib = await import('../lib/kv');
const sbx = await import('../lib/sandbox');
const ser = await import('../lib/serials');
const store = await import('../lib/print-of-week-store');
const { encodeEntry } = await import('../lib/variants');
const E = (n: number, v: 'regular' | 'reverse' | 'full' | 'shiny' = 'regular') => encodeEntry(n, v);

await kvLib.seedSeason1();
const season = (await kvLib.getActiveSeason())!;
ok(!!season, 'the seeded season is active');
const c = season.collectionName;

// Untracked: nothing to pick.
await kvLib.saveCollection(c, { alice: [E(1), E(2), E(3, 'shiny')], bob: [E(1)], carol: [E(4)] });
{
  const out = await store.pickNow('auto');
  ok(!out.ok, 'an untracked season has no pick');
}
await ser.backfillSerials(c, await kvLib.getCollection(c));
await kvLib.addCollectionEntry(c, 'alice', E(5), 'pull');

// A print that alice passes to bob and bob passes to carol has the best journey.
const mine = async (u: string) => await ser.getOwnerCopies(c, u);
const travelling = (await mine('alice')).find(x => x.card === 5)!;
const move = async (from: string, to: string, entry: number, id: string) => {
  const data = await kvLib.getCollection(c);
  const i = data[from].indexOf(entry); if (i >= 0) data[from].splice(i, 1);
  data[to] = [...(data[to] ?? []), entry];
  await kvLib.saveCollection(c, data, { moves: [{ from, to, entry, count: 1, ids: [id] }] });
};
await move('alice', 'bob', E(5), travelling.id);
await move('bob', 'carol', E(5), travelling.id);
const afterTrades = (await ser.getCopy(c, travelling.id))!;
ok(afterTrades.owner === 'carol', 'the print reached carol');

const scan = await store.scanSeason(season);
ok(scan.owners === 3 && scan.prints === 6 && scan.candidates.length === 6, `scan sees every print: ${JSON.stringify({ ...scan, candidates: scan.candidates.length })}`);

const out = await store.pickNow('auto');
ok(out.ok && out.pick.uid === travelling.uid, 'the print that travelled is picked');
if (out.ok) ok(out.pick.by === 'auto' && out.pick.seasonId === season.id && out.pick.score >= 9, 'the pick records who chose it and its score');
eq((await store.getPotw())?.uid, travelling.uid, 'the pick is stored');
eq((await store.loadFeatured())?.copy.id, travelling.id, 'the home page can load it');

// It is not picked again, so the next best one is.
const second = await store.pickNow('auto');
ok(second.ok && second.pick.uid !== travelling.uid, 'a print picked in the last 8 weeks is skipped');

// A pick that was spent since shows nothing.
await store.featureCopy(season, afterTrades, 'tester');
eq((await store.getPotw())?.by, 'tester', 'an admin pick records the staff login');
{
  const data = await kvLib.getCollection(c);
  data.carol = data.carol.filter(e => e !== E(5));
  await kvLib.saveCollection(c, data, { retire: { owner: 'carol', ids: [travelling.id], who: 'carol' } });
}
ok((await store.loadFeatured()) === null, 'a spent print is not shown');
ok(!!(await store.featureCopy(season, (await ser.getCopy(c, travelling.id))!, 'tester')), 'a spent print cannot be featured');
await store.clearPotw();
ok((await store.getPotw()) === null, 'clear removes the pick');

// A print in a trade offer cannot be featured.
{
  const bobPrint = (await mine('bob'))[0];
  const escrowed = { ...bobPrint, owner: 'escrow:t1' };
  ok(!!(await store.featureCopy(season, escrowed, 'tester')), 'a print in an offer cannot be featured');
}

// ── the cron route ──
const route = await import('../app/api/cron/weekly/route');
const { NextRequest } = await import('next/server');
const call = (secret?: string) => route.GET(new NextRequest('http://localhost/api/cron/weekly', { headers: secret ? { authorization: `Bearer ${secret}` } : {} }));
const SECRET = 'a-long-enough-secret-123';
process.env.CRON_SECRET = SECRET;
ok((await call()).status === 401, 'no secret: refused');
ok((await call('wrong-secret-wrong-secret')).status === 401, 'wrong secret: refused');
delete process.env.CRON_SECRET;
ok((await call(SECRET)).status === 401, 'CRON_SECRET unset: closed to everyone');
process.env.CRON_SECRET = SECRET;

{
  const body = await (await call(SECRET)).json();
  ok(body.skipped && (await store.getPotw()) === null, 'outside production it does nothing');
}
process.env.VERCEL_ENV = 'production';
{
  const body = await (await call(SECRET)).json();
  eq(body.steps.printOfTheWeek.status, 'picked', 'the first call of the week picks');
  const first = await store.getPotw();
  ok(!!first, 'and stores the pick');
  const again = await (await call(SECRET)).json();
  eq(again.steps.printOfTheWeek.status, 'already', 'the second call the same week does nothing');
  eq((await store.getPotw())?.chosenAt, first?.chosenAt, 'the pick is untouched');
}
{
  const box = await sbx.createSandbox({ name: 'POTW check', source: 'config' });
  await db.runInSandbox(box.id, async () => {
    const body = await (await call(SECRET)).json();
    ok(body.skipped, 'inside a sandbox it does nothing');
  });
}

console.log('print of the week checks passed');
