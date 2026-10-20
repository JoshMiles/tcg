// One-off cleanup after the email alerts feature was removed: deletes every key it wrote. Dry run by default (prints counts);
// --apply deletes. Run with the target KV set in the environment (KV_REST_API_URL, KV_REST_API_TOKEN, KV_URL).
// Run: npx tsx scripts/purge-email-data.mts [--apply]
const apply = process.argv.includes('--apply');
if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) throw new Error('Set KV_REST_API_URL and KV_REST_API_TOKEN first.');
process.env.KV_URL ??= 'redis://dev';

const { kv } = await import('../lib/db');

// Every key pattern the email feature wrote.
const PATTERNS = [
  'user:*:email',   // the address record { address, addedAt, verifiedAt?, kinds, off? }
  'email:q:*',      // queued notices waiting to be sent
  'email:last:*',   // the 15 minute send window
  'email:cfm:*',    // confirmation request cooldown and daily cap (email:cfm:<u> and email:cfm:<u>:day)
  'email:pending',  // set of viewers with a queue
  'lock:email:*',   // per-viewer queue locks
];

let total = 0;
for (const match of PATTERNS) {
  const found = new Set<string>();
  let cursor: string | number = 0;
  do {
    const [next, keys] = (await kv.scan(cursor, { match, count: 500 })) as [string | number, string[]];
    cursor = next;
    keys.forEach(k => found.add(k));
  } while (String(cursor) !== '0');
  const list = [...found];
  if (apply) for (let i = 0; i < list.length; i += 100) await kv.del(...list.slice(i, i + 100));
  console.log(`${match.padEnd(16)} ${list.length} key(s) ${apply ? 'deleted' : 'would be deleted'}`);
  total += list.length;
}
console.log(apply ? `Done: ${total} key(s) deleted.` : `Dry run: ${total} key(s) would be deleted. Re-run with --apply to delete them.`);
