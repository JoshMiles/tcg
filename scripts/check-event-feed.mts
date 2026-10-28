// The event feed in the app (ROADMAP 57.7): every event request is a line in the feed (event, viewer, amount, what it earned or why it was
// ignored), the same text as the Mix It Up log line, capped at the last 30, newest first, and the bridge `events` action can ask for only
// the ones after a time. Against the mock KV. Run: npx tsx scripts/check-event-feed.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const { NextRequest } = await import('next/server');
const kvLib = await import('../lib/kv');
const b = await import('../lib/bridge');
const mix = await import('../lib/mixitup');
const { normalizeMixItUp } = await import('../lib/mixitup-core');
const { getWebhookSettings } = await import('../lib/webhooks');
const { POST } = await import('../app/api/webhooks/pull/route');
const actionRoute = await import('../app/api/bridge/action/route');

await kvLib.seedSeason1();
const secret = (await getWebhookSettings()).incomingSecret;
const send = async (body: Record<string, unknown>) => (await POST(new NextRequest('http://localhost/api/webhooks/pull', { method: 'POST', body: JSON.stringify({ secret, ...body }) }))).json() as Promise<{ message?: string }>;
const token = (await b.pairBridge((await b.createPairCode('josh')).code, 'Stream PC'))!.token;
type Ev = { at: number; username: string; event: string; amount?: number; ok: boolean; detail: string };
const events = async (body: Record<string, unknown> = {}) => {
  const res = await actionRoute.POST(new Request('http://localhost/api/bridge/action', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ action: 'events', ...body }) }));
  return (await res.json()) as { ok: boolean; events: Ev[] };
};
const nap = (ms: number) => new Promise(r => setTimeout(r, ms));

const base = normalizeMixItUp({ ...(await mix.getMixItUpSettings()), enabled: true });
await mix.saveMixItUpSettings(normalizeMixItUp({ ...base, eventRewards: { 'gifted-subs': { on: true, reward: 'packs' }, bits: { on: true, reward: 'packs', every: 100 }, raid: { on: false, reward: 'packs' }, redeem: { on: true, reward: 'packs' } } }));

// ── Empty, then an earned reward, an ignored event and a bad request each leave a line ──
ok((await events()).ok && (await events()).events.length === 0, 'no events yet: an empty list');
await send({ event: 'bits', username: 'Ann', amount: 350 });
await send({ event: 'raid', username: 'bob', amount: 12 });
await send({ event: 'bits', username: 'cat', amount: 'lots' });
const got = (await events()).events;
ok(got.length === 3, `three lines, one per request: ${got.length}`);
ok(got[0].event === 'bits' && got[0].username === 'cat' && got[0].amount === undefined && got[0].ok === false && /amount/.test(got[0].detail), `a bad amount is a failed line without an amount: ${JSON.stringify(got[0])}`);
ok(got[1].event === 'raid' && got[1].amount === 12 && got[1].ok === false && /event_off/.test(got[1].detail), `an ignored event carries its reason: ${JSON.stringify(got[1])}`);
ok(got[2].event === 'bits' && got[2].amount === 350 && got[2].ok === true && /3 packs for 350 bits/.test(got[2].detail), `an earned reward says what it earned: ${JSON.stringify(got[2])}`);

// ── The same text as the Mix It Up log ──
const log = await mix.getMixItUpLog();
ok(got.every(e => log.some(l => l.at === e.at && l.username === e.username && l.detail === e.detail && l.ok === e.ok)), 'every feed line is also a Mix It Up log line with the same text');

// ── `after` returns only newer lines; junk is read as none ──
const newest = got[0].at;
ok((await events({ after: newest })).events.length === 0, 'nothing is newer than the newest');
ok((await events({ after: got[2].at })).events.length === got.filter(e => e.at > got[2].at).length, 'after returns only the newer lines');
ok((await events({ after: 'soon' })).events.length === 3, 'a junk `after` returns everything');

// ── Capped at the last 30, newest first; chat pulls never appear ──
await nap(5);
for (let i = 1; i <= 35; i++) await send({ event: 'redeem', username: `viewer${i}` });
await send({ username: 'chatter' }); // a chat !pack, no event
const all = (await events()).events;
ok(all.length === 30, `capped at 30: ${all.length}`);
ok(all[0].username === 'viewer35' && all[29].username === 'viewer6', 'newest first, the oldest dropped');
ok(all.every(e => e.event === 'redeem') && !all.some(e => e.username === 'chatter'), 'only event rewards are listed');

console.log('check-event-feed: ok');
