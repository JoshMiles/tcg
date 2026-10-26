// Seeds a sandbox (needs the mock KV and a seeded Season 1, see CLAUDE.md "Testing locally") with what the Twitch panel screenshots need:
// a rich viewer "cheesyfan" (150 simulated pulls plus a shiny and a full art, numbered as they are made), a crowd of 45 for the leaderboard and
// six board listings that cheesyfan can take. Prints the sandbox id. See twitch-extension/SUBMISSION.md section 4.
process.env.KV_REST_API_URL ||= 'http://localhost:4111'; process.env.KV_REST_API_TOKEN ||= 'dev'; process.env.KV_URL ||= 'redis://dev';
const { createSandbox } = await import('../lib/sandbox');
const tools = await import('../lib/sandbox-tools');
const { runInSandbox } = await import('../lib/db');
const kv = await import('../lib/kv');
const serials = await import('../lib/serials');
const trades = await import('../lib/trades');

const sb = await createSandbox({ name: 'Twitch shots', source: 'config' });
await runInSandbox(sb.id, async () => {
  for (const pack of await kv.listAllPacks()) await kv.savePack({ ...pack, upgradesEnabled: true });
});
// Turn the copy ledger on first (on the empty collection), so every copy below is numbered as it is made: real edition numbers (no
// "~" estimates) with their unique numbers, and cheesyfan, who pulls first, holds the low ones that earn the serial bonus.
await runInSandbox(sb.id, async () => { await serials.backfillSerials((await kv.getActiveSeason())!.collectionName, {}); });
await tools.simulatePulls(sb.id, 'cheesyfan', 150);
await tools.grantCopies(sb.id, 'cheesyfan', 3, 'shiny', 1);
await tools.grantCopies(sb.id, 'cheesyfan', 9, 'full', 1);
await tools.seedUsers(sb.id, { count: 45, minPulls: 6, maxPulls: 260, shape: 'realistic' });
await runInSandbox(sb.id, async () => {
  const season = await kv.getActiveSeason();
  const data = await kv.getCollection(season!.collectionName);
  // a couple of board listings from other viewers
  const others = Object.keys(data).filter(u => u !== 'cheesyfan').slice(0, 6);
  // each listing asks for a Regular cheesyfan has spare, so the panel shows trades they can take
  const mine = data.cheesyfan ?? [];
  const spare = [...new Set(mine.filter(e => e < 1_000_000))].filter(n => mine.filter(e => e === n).length >= 2);
  let made = 0;
  for (const u of others) {
    const owned = [...new Set(data[u])].slice(0, 2);
    if (owned.length < 1) continue;
    const r = await trades.createTrade({ seasonId: season!.id, from: u, kind: 'listing', give: [{ cardNumber: owned[0] % 1_000_000, variant: 'regular', count: 1 }], get: [{ cardNumber: spare.length ? spare[made % spare.length] : ((owned[0] + 3) % 25) + 1, variant: 'regular', count: 1 }] }).catch(() => null);
    if (r && 'ok' in r && r.ok) made++;
  }
  console.log('listings', made);
});
console.log('SANDBOX', sb.id);
