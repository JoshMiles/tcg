// Puts every season's collection back as the old one-string layout (`tcg_<name>`), for rolling back ROADMAP 48.7. Dry run unless
// both switches are set. Never run automatically. Do it off-stream, with the NEW code stopped (or after the old code is deployed
// and nothing is writing), because anything written to the hashes after this reads them is lost.
//
//   KV_REST_API_URL=... KV_REST_API_TOKEN=... KV_URL=redis://unused \
//     npx tsx scripts/rollback-collections.mts
//
//   TCG_ROLLBACK_CONFIRM=yes npx tsx scripts/rollback-collections.mts --apply
//
// For each season that has a hash (`coll:<name>`): writes the string from it, checks the viewer and entry counts, then deletes
// the hash and its migration-log row, so the new code migrates the string again if it is ever deployed back. A season whose
// string already exists is left alone and reported (resolve that by hand: the hash is the newer one).
const url = process.env.KV_REST_API_URL;
const apply = process.argv.includes('--apply');
const confirm = process.env.TCG_ROLLBACK_CONFIRM === 'yes';
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
const { listSeasons, withLock } = await import('../lib/kv');

let host = 'unknown';
try { host = new URL(url).host; } catch { /* keep unknown */ }
console.log('collection rollback (hash to string)');
console.log(`store: ${host}`);

const count = (rec: Record<string, number[]>) => ({ viewers: Object.keys(rec).length, entries: Object.values(rec).reduce((n, cards) => n + cards.length, 0) });
let failed = false;
for (const season of await listSeasons()) {
  const c = season.collectionName;
  const rec = await kv.hgetall<Record<string, number[]>>(`coll:${c}`);
  const had = await kv.exists(`tcg_${c}`);
  if (!rec) { console.log(`  ${c}: no hash, nothing to roll back`); continue; }
  const { viewers, entries } = count(rec);
  if (had) { console.log(`  ${c}: SKIPPED, a string already exists next to the hash (${viewers} viewers, ${entries} entries in the hash); decide by hand`); failed = true; continue; }
  if (!apply || !confirm) { console.log(`  ${c}: would write ${viewers} viewers, ${entries} entries back to tcg_${c}`); continue; }
  await withLock(`tcg_${c}`, async () => {
    await kv.set(`tcg_${c}`, rec);
    const back = count((await kv.get<Record<string, number[]>>(`tcg_${c}`)) ?? {});
    if (back.viewers !== viewers || back.entries !== entries) throw new Error(`${c}: the string did not match the hash (${back.viewers}/${back.entries} vs ${viewers}/${entries}); the hash was kept`);
    await kv.del(`coll:${c}`);
    await kv.hdel('collmig', c);
  });
  console.log(`  ${c}: rolled back, ${viewers} viewers, ${entries} entries`);
}

if (!apply) console.log('Dry run. No keys were written. To apply: TCG_ROLLBACK_CONFIRM=yes npx tsx scripts/rollback-collections.mts --apply');
else if (!confirm) { console.error('Refusing to write. Set TCG_ROLLBACK_CONFIRM=yes as well as --apply.'); process.exitCode = 1; }
if (failed) process.exitCode = 1;
