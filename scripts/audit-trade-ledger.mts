// Read-only audit of trade escrow and restore drift. Never writes.
//
//   KV_REST_API_URL=... KV_REST_API_READ_ONLY_TOKEN=... KV_URL=redis://unused \
//     npx tsx scripts/audit-trade-ledger.mts
//
// KV_REST_API_TOKEN is used only when KV_REST_API_READ_ONLY_TOKEN is unset.
// Add --json for the raw report. Exit 0 after a successful read, whether or not anything matched.
// Finished offers outside the kept 400 are not visible.
const url = process.env.KV_REST_API_URL;
if (!url) {
  console.error('Set KV_REST_API_URL and KV_REST_API_READ_ONLY_TOKEN (or KV_REST_API_TOKEN). This script only reads.');
  process.exit(1);
}
if (process.env.KV_REST_API_READ_ONLY_TOKEN) process.env.KV_REST_API_TOKEN = process.env.KV_REST_API_READ_ONLY_TOKEN;
if (!process.env.KV_REST_API_TOKEN) {
  console.error('Set KV_REST_API_READ_ONLY_TOKEN or KV_REST_API_TOKEN.');
  process.exit(1);
}
process.env.KV_URL ??= 'redis://unused';

const { kv } = await import('../lib/db');
const audit = await import('../lib/trade-ledger-audit');

const input = await audit.loadAuditInput({
  get: <T>(key: string) => kv.get<T>(key),
  hgetall: (key: string) => kv.hgetall<Record<string, unknown>>(key),
});
const report = audit.auditLedger(input);
let host = 'unknown';
try { host = new URL(url).host; } catch { /* keep unknown */ }
if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
else console.log(audit.formatReport(report, host));
