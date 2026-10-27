// Event rewards (ROADMAP 55.4g): POST /api/webhooks/pull with an `event`. Covers the pack counts per event, bits rounding, the cap of 10, a
// switched-off event, buff mode, requestId replays, bad input, and that nothing is charged or held back by a limit, cooldown or queue cap.
// Run: npx tsx scripts/check-event-rewards.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const { NextRequest } = await import('next/server');
const kvLib = await import('../lib/kv');
const { kv } = await import('../lib/db');
const buffs = await import('../lib/buffs');
const core = await import('../lib/buffs-core');
const mix = await import('../lib/mixitup');
const { normalizeMixItUp } = await import('../lib/mixitup-core');
const ev = await import('../lib/event-rewards-core');
const { getWebhookSettings } = await import('../lib/webhooks');
const { getActivity } = await import('../lib/activity');
const { POST } = await import('../app/api/webhooks/pull/route');

await kvLib.seedSeason1();
const secret = (await getWebhookSettings()).incomingSecret;
const send = async (body: Record<string, unknown>) => {
  const res = await POST(new NextRequest('http://localhost/api/webhooks/pull', { method: 'POST', body: JSON.stringify({ secret, ...body }) }));
  return { status: res.status, ...(await res.json()) } as { status: number; ok?: boolean; ignored?: boolean; reason?: string; message?: string; error?: string };
};
const queue = async () => kv.lrange<{ username: string; type: string; paid?: boolean }>('webhooks:queue', 0, -1);
const queued = async () => (await queue()).length;
const on = (extra: Record<string, unknown> = {}) => ({ on: true, reward: 'packs', ...extra });

// ── Pure rules ──
ok(ev.normalizeEventRewards(undefined).bits.every === 500 && ev.normalizeEventRewards(undefined).raid.every === 1, 'defaults: 500 bits, raid of 1');
ok(Object.values(ev.normalizeEventRewards(undefined)).every(e => !e.on), 'every event is off by default');
ok(ev.cleanEventRewardsInput(k => (k === 'ev_bits_every' ? 'lots' : undefined)).ok === false, 'a junk number is refused in words');
ok(ev.cleanEventRewardsInput(k => (k === 'ev_raid_reward' ? 'buff' : undefined)).ok === false, 'a buff reward needs a buff');
ok(ev.eventPacks('bits', { on: true, reward: 'packs', every: 500 }, 499) === 0 && ev.eventPacks('bits', { on: true, reward: 'packs', every: 500 }, 1499) === 2, 'bits round down');

// ── Settings: every event on, with paid pulls, a limit, a cooldown and a queue cap that must not touch a reward ──
const set = async (eventRewards: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  mix.saveMixItUpSettings(normalizeMixItUp({ ...(await mix.getMixItUpSettings()), enabled: true, limit: 1, cooldownSeconds: 600, queueCap: 1, ...extra, eventRewards }));
await set({ 'gifted-subs': on(), bits: on({ every: 100 }), raid: on({ every: 10 }), redeem: on() });

// ── Each event queues the right free packs ──
let r = await send({ event: 'gifted-subs', username: 'Cheesy_1', amount: 5 });
ok(r.ok && !r.ignored && r.message === 'cheesy_1 got 5 packs for 5 gifted subs!' && (await queued()) === 5, `gifted subs, one pack each: ${r.message}`);
r = await send({ event: 'gifted-subs', username: 'cheesy_1', amount: '1' });
ok(r.message === 'cheesy_1 got a pack for a gifted sub!' && (await queued()) === 6, `amount as text, one sub: ${r.message}`);
r = await send({ event: 'bits', username: 'bits_1', amount: 350 });
ok(r.message === 'bits_1 got 3 packs for 350 bits!' && (await queued()) === 9, `bits round down: ${r.message}`);
r = await send({ event: 'bits', username: 'bits_1', amount: 99 });
ok(r.ok && !r.ignored && r.message === '' && (await queued()) === 9, 'bits under the amount per pack answer ok, empty, and queue nothing');
r = await send({ event: 'raid', username: 'raid_1', amount: 12 });
ok(r.message === 'raid_1 got a pack for a raid of 12!' && (await queued()) === 10, `a raid at or above the threshold: ${r.message}`);
r = await send({ event: 'raid', username: 'raid_1', amount: 9 });
ok(r.ok && r.message === '' && (await queued()) === 10, 'a raid under the threshold queues nothing');
r = await send({ event: 'redeem', username: 'redeem_1' });
ok(r.message === 'redeem_1 got a pack for a channel point redeem!' && (await queued()) === 11, `a redeem needs no amount: ${r.message}`);

// ── Free, whatever the limit, cooldown or queue cap say ──
ok((await queue()).every(q => q.type === 'pull' && !q.paid), 'every queued pull is a free one (never paid)');
ok((await queued()) > 1, 'the queue cap of 1 did not stop an event');
ok((await kv.get('mixitup:cd:cheesy_1')) === null, 'an event starts no cooldown');
const feed = (await getActivity({ limit: 50 })).events.filter(e => e.type === 'trigger' && e.kind === 'pull' && e.username === 'bits_1');
ok(feed.length === 3 && feed.every(e => e.type === 'trigger' && e.reason === '3 packs for 350 bits'), 'the live feed says why');
ok((await mix.getMixItUpLog()).some(l => l.what === 'pull' && l.detail.includes('bits_1 got 3 packs for 350 bits')), 'the Mix It Up log says why');

// ── The cap of 10 ──
const before = await queued();
r = await send({ event: 'gifted-subs', username: 'big_1', amount: 50 });
ok(r.message === 'big_1 got 10 packs for 50 gifted subs!' && (await queued()) === before + 10, `a request queues at most 10 packs: ${r.message}`);
r = await send({ event: 'bits', username: 'big_1', amount: 1_000_000 });
ok((await queued()) === before + 20, 'bits are capped at 10 as well');

// ── Off, and bad input ──
await set({ 'gifted-subs': on(), bits: { on: false, reward: 'packs', every: 100 }, raid: on(), redeem: on() });
const off = await queued();
r = await send({ event: 'bits', username: 'bits_1', amount: 1000 });
ok(r.ok === true && r.ignored === true && r.reason === 'event_off' && r.message === '' && (await queued()) === off, 'an event that is off is ignored and queues nothing');
r = await send({ event: 'nope', username: 'bits_1', amount: 5 });
ok(r.status === 400 && !!r.error && !!r.message, 'an unknown event is 400 with error and message');
for (const amount of [0, -3, 2.5, 'lots', undefined, null]) {
  r = await send({ event: 'gifted-subs', username: 'bits_1', amount });
  ok(r.status === 400 && !!r.error, `a bad amount (${String(amount)}) is 400`);
}
ok((await queued()) === off, 'a bad request queues nothing');
r = await send({ username: 'chatty_1' });
ok(!r.error && r.ok === true && r.message !== undefined, 'a request without event is the chat pull, unchanged');

// ── requestId: a retry queues nothing more ──
await set({ 'gifted-subs': on(), bits: on({ every: 100 }), raid: on(), redeem: on() });
const n0 = await queued();
const first = await send({ event: 'gifted-subs', username: 'again_1', amount: 3, requestId: 'evt-1' });
const n1 = await queued();
const again = await send({ event: 'gifted-subs', username: 'again_1', amount: 3, requestId: 'evt-1' });
ok(n1 === n0 + 3 && (await queued()) === n1 && again.message === first.message, 'a repeat requestId replays the answer and queues nothing');
ok((await queued()) === n1 + 0 && (await send({ event: 'gifted-subs', username: 'again_1', amount: 1, requestId: 'evt-2' })).ok && (await queued()) === n1 + 1, 'a new requestId runs');

// ── Buff mode: applied once, through the Stream Deck rules ──
const mk = (o: Record<string, unknown>) => { const d = core.cleanBuffDefInput({ type: 'extra-pulls', magnitude: 1, duration: { unit: 'streams', n: 1 }, stack: 'reject', scope: 'self', ...o }); if (!d.ok) throw new Error(d.message); return d.def; };
await buffs.saveBuffDefs([mk({ id: 'fan', name: 'Fan pulls', streamDeck: true }), mk({ id: 'quiet', name: 'Not on deck' }), mk({ id: 'crowd', name: 'Crowd', scope: 'community', streamDeck: true })]);
await set({ 'gifted-subs': on(), bits: { on: true, reward: 'buff', buffId: 'fan', every: 100 }, raid: { on: true, reward: 'buff', buffId: 'quiet', every: 1 }, redeem: { on: true, reward: 'buff', buffId: 'crowd' } });
const q = await queued();
r = await send({ event: 'bits', username: 'buff_1', amount: 300, requestId: 'b-1' });
ok(r.ok && !r.ignored && r.message === 'buff_1 got +1 pull this stream for 300 bits!', `buff mode: ${r.message}`);
const held = await buffs.getUserBuffs('buff_1');
ok(held.length === 1 && held[0].source === 'event', 'the viewer holds the buff once, with source event');
ok((await queued()) === q, 'buff mode queues no pack');
const replay = await send({ event: 'bits', username: 'buff_1', amount: 300, requestId: 'b-1' });
ok(replay.message === r.message && (await buffs.getUserBuffs('buff_1')).length === 1, 'a repeat requestId applies the buff once');
r = await send({ event: 'bits', username: 'buff_1', amount: 300 });
ok(r.ignored === true && r.reason === 'already_active' && r.message.includes('already active'), `a refusal comes back in words: ${r.message}`);
r = await send({ event: 'raid', username: 'buff_2', amount: 5 });
ok(r.ignored === true && r.reason === 'buff_unavailable' && r.message === '' && (await buffs.getUserBuffs('buff_2')).length === 0, 'a buff without the Stream Deck switch is not applied');
r = await send({ event: 'redeem', username: 'buff_3' });
ok(r.ignored === true && r.reason === 'buff_unavailable', 'a community buff is not a reward');

console.log('check-event-rewards: ok');
process.exit(0);
