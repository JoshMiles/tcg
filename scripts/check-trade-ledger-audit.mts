// Pure classification, plus a mock-KV run of the read-only audit and the opt-in repair.
// The repair half writes only to this local mock. Run: npx tsx scripts/check-trade-ledger-audit.mts
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';

const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const eq = (a: unknown, b: unknown, msg: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);

const audit = await import('../lib/trade-ledger-audit');
const { encodeEntry } = await import('../lib/variants');
const { escrowOwner } = await import('../lib/serials-core');
const E = (n: number) => encodeEntry(n, 'regular');

const copy = (o: Partial<audit.AuditCopy> & Pick<audit.AuditCopy, 'id' | 'owner'>): audit.AuditCopy => ({
  card: 1, variant: 'regular', n: 1, origin: 'pull', at: 1_000, ev: [{ t: 1_000, type: 'minted', who: o.owner }], ...o,
});
const trade = (o: Partial<import('../lib/trade-core').Trade>): import('../lib/trade-core').Trade => ({
  id: 't1', seasonId: 's', kind: 'direct', from: 'alice', to: 'bob',
  give: [{ cardNumber: 1, variant: 'regular', count: 1 }], escrowed: true,
  get: [{ cardNumber: 2, variant: 'regular', count: 1 }], status: 'cancelled', createdAt: 1_000, expiresAt: 9e12, resolvedAt: 5_000, ...o,
});
const season = { id: 's', name: 'Season', collectionName: 'col', tracking: true };
const base = (): audit.AuditInput => ({ seasons: [season], open: [], history: [], collections: { col: { alice: [E(1)] } }, copies: { col: {} }, retired: { col: [] } });

{
  const input = base();
  const t = trade({});
  input.history = [t];
  input.copies.col.alice = [copy({ id: '1.0.1', owner: 'alice', ev: [{ t: 1_000, type: 'minted', who: 'alice' }, { t: 5_100, type: 'returned', who: 'alice' }] })];
  const report = audit.auditLedger(input);
  eq(report.refunded.map(f => f.tradeId), ['t1'], 'a returned event with an empty escrow hash is an already-refunded offer');
  eq(report.unconfirmed.length, 0, 'confirmed refunds are not filed as unconfirmed');
  const plan = audit.planRepairs(report);
  ok(plan.some(a => a.tradeId === 't1' && a.action === 'clear-flag'), 'the repair plan only clears the flag');
  ok(!plan.some(a => a.tradeId === 't1' && a.action === 'return-prints'), 'it does not append prints that already came back');
}
{
  const input = base();
  input.history = [trade({})];
  input.copies.col[escrowOwner('t1')] = [copy({ id: '1.0.1', owner: escrowOwner('t1') })];
  const report = audit.auditLedger(input);
  eq(report.stillHeld.map(f => f.tradeId), ['t1'], 'prints still in escrow are not called refunded');
  ok(audit.planRepairs(report).some(a => a.action === 'return-prints' && a.tradeId === 't1'), 'those are a return, not a flag clear');
}
{
  const input = base();
  input.history = [trade({ seasonId: 'gone' })];
  input.open = [trade({ id: 'open-gone', seasonId: 'gone', status: 'open' })];
  const report = audit.auditLedger(input);
  eq(report.openDeletedSeason.map(f => f.tradeId), ['open-gone'], 'an open offer for a missing season is listed');
  eq(report.seasonMissing.map(f => f.tradeId), ['t1'], 'a closed escrowed offer for a missing season stays manual');
  ok(audit.planRepairs(report).filter(a => a.tradeId === 'open-gone').every(a => a.action === 'manual'), 'a deleted season is not auto-repaired');
}
{
  const input = base();
  const live = trade({ id: 'live', status: 'open', createdAt: 2_000 });
  input.open = [live];
  input.copies.col[escrowOwner('live')] = [copy({ id: '1.0.1', owner: escrowOwner('live'), origin: 'pull', at: 1_000 })];
  input.copies.col.alice = [copy({ id: '1.0.9', owner: 'alice', origin: 'other', at: 3_000, ev: [{ t: 3_000, type: 'minted', who: 'alice' }] })];
  input.collections.col.alice = [E(1)];
  const report = audit.auditLedger(input);
  eq(report.restoreDuplicates.length, 1, 'a print minted as other while escrow still holds one is a possible duplicate');
  ok(report.restoreDuplicates[0].detail.includes('alice'), 'the duplicate names the viewer');
  ok(audit.planRepairs(report).every(a => a.tradeId !== 'live' || a.action === 'manual'), 'duplicates are not auto-removed');
}
{
  const input = base();
  input.open = [trade({ id: 'live', status: 'open', createdAt: 2_000 })];
  input.copies.col[escrowOwner('live')] = [copy({ id: '1.0.1', owner: escrowOwner('live') })];
  input.copies.col.alice = [copy({ id: '1.0.2', owner: 'alice', origin: 'pull', at: 500 })];
  input.collections.col.alice = [E(1)];
  ok(audit.auditLedger(input).restoreDuplicates.length === 0, 'a normal open offer is not a duplicate');
}
{
  const input = base();
  input.copies.col.alice = [copy({ id: '1.0.9', owner: 'alice', origin: 'other', at: 8_000, ev: [{ t: 8_000, type: 'minted', who: 'alice' }] })];
  input.retired.col = [copy({ id: '1.0.1', owner: '', at: 1_000, ev: [{ t: 1_000, type: 'minted', who: 'alice' }, { t: 7_000, type: 'removed', who: 'alice' }] })];
  input.collections.col.alice = [E(1)];
  const report = audit.auditLedger(input);
  eq(report.restoreDuplicates.length, 1, 'a removed print plus a later other-mint is a possible restore duplicate');
  ok(audit.planRepairs(report).every(a => a.action === 'manual'), 'that duplicate is left for a person');
}
{
  const text = audit.formatReport(audit.emptyReport(), 'example.test');
  ok(text.includes('already refunded, still marked escrowed: 0'), 'the report names the refunded check');
  ok(text.includes('open offers for a deleted season: 0'), 'the report names the deleted-season check');
  ok(text.includes('possible restore duplicates: 0'), 'the report names the duplicate check');
  ok(text.includes('None of the three checks matched.'), 'an empty audit says none of the three matched');
  ok(text.includes('read-only'), 'the report says it is read-only');
}
{
  ok(audit.parseAuditCopy('not json') === null, 'bad copy text is skipped');
  ok(audit.parseAuditCopy({ id: '1.0.1', card: 1 }) === null, 'a copy with no variant is skipped');
  const src = readFileSync(new URL('./audit-trade-ledger.mts', import.meta.url), 'utf8');
  ok(!/\.(set|del|hset|hdel|hincrby|incr)\(/.test(src), 'the audit script has no write call');
  const lib = readFileSync(new URL('../lib/trade-ledger-audit.ts', import.meta.url), 'utf8');
  ok(!/from '\.\/(db|kv|trades)'/.test(lib), 'the classifier does not import the database or the trade engine');
}

const kvLib = await import('../lib/kv');
const trades = await import('../lib/trades');
const serials = await import('../lib/serials');
const { kv } = await import('../lib/db');

function run(script: string, args: string[], extra: Record<string, string> = {}): Promise<{ code: number; out: string }> {
  return new Promise(resolve => {
    const child = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', script, ...args], { env: { ...process.env, ...extra } });
    let out = '';
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { out += d; });
    child.on('close', code => resolve({ code: code ?? 1, out }));
  });
}

await kvLib.seedSeason1();
const liveSeason = (await kvLib.listSeasons())[0];
const coll = liveSeason.collectionName;
await trades.saveTradeSettings({ enabled: true, expiryHours: 48, maxOpenPerUser: 5, cooldownSeconds: 0, maxStacksPerSide: 8, minAccountHours: 0 });
await kvLib.saveCollection(coll, { alice: [E(1), E(1), E(2)], bob: [E(3), E(9)] });
await serials.backfillSerials(coll, await kvLib.getCollection(coll));

const made = await trades.createTrade({ seasonId: liveSeason.id, from: 'alice', kind: 'direct', to: 'bob', give: [{ cardNumber: 2, variant: 'regular', count: 1 }], get: [{ cardNumber: 3, variant: 'regular', count: 1 }] });
ok(made.ok, 'offer to refund: ' + (made.ok ? '' : made.error));
if (made.ok) ok((await trades.cancelTrade(made.trade.id, 'alice')).ok, 'cancel refunds it');
const history = (await kv.get<import('../lib/trade-core').Trade[]>('trades:history')) ?? [];
for (const t of history) if (t.id === (made.ok ? made.trade.id : '')) t.escrowed = true;
await kv.set('trades:history', history);

const again = await trades.createTrade({ seasonId: liveSeason.id, from: 'alice', kind: 'listing', give: [{ cardNumber: 1, variant: 'regular', count: 1 }], get: [{ cardNumber: 9, variant: 'regular', count: 1 }] });
ok(again.ok, 'a live offer to duplicate against: ' + (again.ok ? '' : again.error));
if (again.ok) {
  const data = await kvLib.getCollection(coll);
  data.alice = [...(data.alice ?? []), E(1)];
  await kvLib.saveCollection(coll, data);
}
const open = (await kv.get<import('../lib/trade-core').Trade[]>('trades:open')) ?? [];
open.push(trade({ id: 'ghost-open', seasonId: 'deleted-season', status: 'open', from: 'alice' }));
await kv.set('trades:open', open);

const minted = (await serials.serialStats(coll)).minted;
const aliceBefore = (await kvLib.getCollection(coll)).alice.length;

const read = await run('scripts/audit-trade-ledger.mts', []);
ok(read.code === 0, 'audit exits 0: ' + read.out);
ok(read.out.includes('already refunded, still marked escrowed: 1'), 'audit finds the refunded flag: ' + read.out);
ok(read.out.includes('open offers for a deleted season: 1'), 'audit finds the deleted-season offer');
ok(read.out.includes('possible restore duplicates: 1'), 'audit finds the extra print: ' + read.out);
ok(read.out.includes('No keys were written.'), 'audit says it did not write');

const dry = await run('scripts/repair-trade-ledger.mts', []);
ok(dry.code === 0 && dry.out.includes('Dry run. No keys were written.'), 'repair without --apply is a dry run');
ok(((await kv.get<import('../lib/trade-core').Trade[]>('trades:history')) ?? []).some(t => t.id === (made.ok ? made.trade.id : '') && t.escrowed), 'the dry run left the flag set');

const refused = await run('scripts/repair-trade-ledger.mts', ['--apply']);
ok(refused.code === 1 && refused.out.includes('Refusing to write'), 'apply without the confirm env writes nothing');
ok(((await kv.get<import('../lib/trade-core').Trade[]>('trades:history')) ?? []).some(t => t.id === (made.ok ? made.trade.id : '') && t.escrowed), 'the refused apply left the flag set');

const applied = await run('scripts/repair-trade-ledger.mts', ['--apply'], { TCG_REPAIR_CONFIRM: 'yes' });
ok(applied.code === 0 && applied.out.includes('ok clear-flag'), 'confirm apply clears the refunded flag: ' + applied.out);
ok(!applied.out.includes('return-prints'), 'it does not return prints for the duplicate or the deleted season');
const after = ((await kv.get<import('../lib/trade-core').Trade[]>('trades:history')) ?? []).find(t => t.id === (made.ok ? made.trade.id : ''));
ok(after && after.escrowed === false, 'the flag is clear');
ok((await kvLib.getCollection(coll)).alice.length === aliceBefore, 'clearing the flag did not add a card');
ok((await serials.serialStats(coll)).minted === minted, 'the repair did not mint');
ok(((await kv.get<import('../lib/trade-core').Trade[]>('trades:open')) ?? []).some(t => t.id === 'ghost-open'), 'the deleted-season offer is still open');
ok(((await kv.get<import('../lib/trade-core').Trade[]>('trades:open')) ?? []).some(t => t.id === (again.ok ? again.trade.id : '')), 'the live offer was left open');

console.log('check-trade-ledger-audit: all checks passed');
