// Opt-in repair for the safe rows of scripts/audit-trade-ledger.mts. Dry-run unless both switches are set.
//
//   KV_REST_API_URL=... KV_REST_API_TOKEN=... KV_URL=redis://unused \
//     npx tsx scripts/repair-trade-ledger.mts
//
//   TCG_REPAIR_CONFIRM=yes npx tsx scripts/repair-trade-ledger.mts --apply
//
// --apply without TCG_REPAIR_CONFIRM=yes refuses and writes nothing.
// --apply also refuses when KV_REST_API_TOKEN is the read-only token.
// Safe writes: clear the escrow flag when a returned event shows the prints already came back,
// and return prints that are still in escrow (numbered seasons only). Duplicates, deleted seasons,
// and unconfirmed rows are printed and left alone.
const url = process.env.KV_REST_API_URL;
const apply = process.argv.includes('--apply');
const confirm = process.env.TCG_REPAIR_CONFIRM === 'yes';
if (!url || !process.env.KV_REST_API_TOKEN) {
  console.error('Set KV_REST_API_URL and KV_REST_API_TOKEN (the read-write token). The default run writes nothing.');
  process.exit(1);
}
if (apply && process.env.KV_REST_API_READ_ONLY_TOKEN && process.env.KV_REST_API_TOKEN === process.env.KV_REST_API_READ_ONLY_TOKEN) {
  console.error('Refusing to write with KV_REST_API_READ_ONLY_TOKEN. Set KV_REST_API_TOKEN to the read-write token.');
  process.exit(1);
}
process.env.KV_URL ??= 'redis://unused';

const { kv } = await import('../lib/db');
const audit = await import('../lib/trade-ledger-audit');
const trades = await import('../lib/trades');

const input = await audit.loadAuditInput({
  get: <T>(key: string) => kv.get<T>(key),
  hgetall: (key: string) => kv.hgetall<Record<string, unknown>>(key),
});
const report = audit.auditLedger(input);
const actions = audit.planRepairs(report);
let host = 'unknown';
try { host = new URL(url).host; } catch { /* keep unknown */ }

console.log(`trade ledger repair plan`);
console.log(`store: ${host}`);
const writes = actions.filter(a => a.action !== 'manual');
const manual = actions.filter(a => a.action === 'manual');
console.log(`safe writes: ${writes.length}`);
for (const a of writes) console.log(`  - ${a.action} ${a.tradeId}: ${a.reason}`);
console.log(`left for a person: ${manual.length}`);
for (const a of manual) console.log(`  - ${a.tradeId}: ${a.reason}`);

if (!apply) {
  console.log('Dry run. No keys were written. To apply the safe writes: TCG_REPAIR_CONFIRM=yes npx tsx scripts/repair-trade-ledger.mts --apply');
  process.exit(0);
}
if (!confirm) {
  console.error('Refusing to write. Set TCG_REPAIR_CONFIRM=yes as well as --apply.');
  process.exit(1);
}

console.log('Applying safe writes.');
for (const a of writes) {
  const res = a.action === 'clear-flag' ? await trades.clearEscrowFlagIfEmpty(a.tradeId) : await trades.releaseStuckEscrow(a.tradeId);
  console.log(res.ok ? `  ok ${a.action} ${a.tradeId}` : `  skipped ${a.tradeId}: ${res.error}`);
}
console.log('Done. Run the audit again before doing anything by hand.');
