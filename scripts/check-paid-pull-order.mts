// A paid pull and its charge happen together or not at all (ROADMAP 46.3): POST /api/collection charges Mix It Up BEFORE the print
// is written, saves nothing when the charge is not confirmed, and pays the charge back when the print then cannot be saved.
// Runs the real route against the mock KV with a fake Mix It Up. Run: npx tsx scripts/check-paid-pull-order.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const { NextRequest } = await import('next/server');
const kvLib = await import('../lib/kv');
const { kv } = await import('../lib/db');
const draw = await import('../lib/draw');
const m = await import('../lib/mixitup');
const core = await import('../lib/mixitup-core');
const { POST } = await import('../app/api/collection/route');

await kvLib.seedSeason1();
const coll = (await kvLib.getActiveSeasonWithPacks())!.season.collectionName;

// A fake Mix It Up on global fetch (the route and lib/mixitup use it); everything else (the mock KV) passes through.
type Call = { action: string; username: string; amount?: number; message?: string };
const calls: Call[] = [];
let deduct: 'ok' | 'declines' = 'ok';
let seenAtDeduct: number[] | null = null; // what the viewer owned the moment Mix It Up was asked to take the money
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  if (URL.parse(String(input))?.host !== 'hook.example') return realFetch(input, init);
  const body = JSON.parse(String(init?.body)) as Call;
  calls.push(body);
  if (body.action === 'balance') return new Response(JSON.stringify({ balance: 1000 }), { status: 200 });
  if (body.action === 'deduct') {
    seenAtDeduct = (await kvLib.getCollection(coll)).ann ?? [];
    if (deduct === 'declines') return new Response(JSON.stringify({ ok: false }), { status: 200 });
  }
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}) as typeof fetch;

const settings = core.normalizeMixItUp({ enabled: true, balanceUrl: 'https://hook.example/mix', addUrl: 'https://hook.example/add', cost: 100, limit: 3, message: '{username} paid {amount} for {cardName} #{serial}' });
await m.saveMixItUpSettings(settings);

async function paidPull(id: string) {
  ok(!!(await draw.issueDraw(id, 'ann', true)), 'a draw was issued');
  ok((await m.reservePaidPull(settings, 'ann', id)).ok, 'the pull was reserved');
  const res = await POST(new NextRequest('http://localhost/api/collection', { method: 'POST', body: JSON.stringify({ pull: { username: 'ann', ticket: id } }) }));
  return res.json() as Promise<{ ok: boolean; revoked?: boolean; owned?: number[]; serial?: number | null }>;
}

// 1. A confirmed charge: the print did not exist yet when Mix It Up was asked, and exists after.
const good = await paidPull('t1');
ok(good.ok && !good.revoked && (good.owned?.length ?? 0) === 1, 'a paid pull is saved when the charge is confirmed');
ok(seenAtDeduct !== null && (seenAtDeduct as number[]).length === 0, 'the print is written after the charge, not before it');
ok(calls.filter(c => c.action === 'deduct').length === 1 && calls.some(c => c.action === 'deduct' && c.message?.includes('paid 100')), 'the viewer is charged once');
ok(((await kvLib.getCollection(coll)).ann ?? []).length === 1, 'the collection holds the one print');

// 2. A charge Mix It Up does not confirm: nothing is saved, nothing is made, and the allowance comes back.
deduct = 'declines';
const bad = await paidPull('t2');
ok(bad.ok && bad.revoked === true && bad.owned?.length === 1, 'an unconfirmed charge answers revoked, with the unchanged collection');
ok(((await kvLib.getCollection(coll)).ann ?? []).length === 1, 'no print was added for the unconfirmed charge');
deduct = 'ok';
const again = await paidPull('t3');
ok(again.ok && !again.revoked && again.owned?.length === 2, 'the failed pull gave its allowance back, so the next one is allowed');
ok(await m.pullsUsedThisStream('ann') === 2, 'only the two pulls that were given count against the stream limit');

// 3. Charged, but the print cannot be saved: the charge is paid back and the allowance returns.
const callsBefore = calls.length;
ok(!!(await draw.issueDraw('t4', 'ann', true)) && (await m.reservePaidPull(settings, 'ann', 't4')).ok, 'a fourth pull was reserved');
// hold the collection lock so the save gives up after its retries
await kv.set(`lock:tcg_${coll}`, 'held', { ex: 30 });
const failing = await POST(new NextRequest('http://localhost/api/collection', { method: 'POST', body: JSON.stringify({ pull: { username: 'ann', ticket: 't4' } }) })).then(() => 'saved', () => 'threw');
await kv.del(`lock:tcg_${coll}`);
ok(failing === 'threw', 'the save fails while the collection is locked');
const after = calls.slice(callsBefore);
ok(after.some(c => c.action === 'deduct') && after.some(c => c.action === 'add' && c.amount === 100 && c.username === 'ann'), 'the charge was refunded through the add address');
ok(((await kvLib.getCollection(coll)).ann ?? []).length === 2, 'no print was added');
ok(await m.pullsUsedThisStream('ann') === 2, 'the refunded pull gave its allowance back');

console.log('paid pull order checks passed');
