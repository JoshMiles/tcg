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

// ── Raid shout-out (57.6) ──
ok(!ev.normalizeEventRewards(undefined).raidShoutout.on && ev.normalizeEventRewards(undefined).raidShoutout.minViewers === 5, 'shout-out: off by default, minimum 5');
ok(ev.normalizeEventRewards({ raidShoutout: { on: true, minViewers: 'x' } }).raidShoutout.minViewers === 5, 'shout-out: a junk minimum falls back to the default');
ok(ev.normalizeEventRewards({ raidShoutout: { on: true, minViewers: 25 } }).raidShoutout.minViewers === 25, 'shout-out: a good minimum is kept');
ok(ev.cleanEventRewardsInput(k => (k === 'ev_shout_min' ? '0' : undefined)).ok === false, 'shout-out: a minimum of 0 is refused in words');
const cleaned = ev.cleanEventRewardsInput(k => (({ ev_shout_on: 'on', ev_shout_min: '30' }) as Record<string, string>)[k]);
ok(cleaned.ok && cleaned.rewards.raidShoutout.on && cleaned.rewards.raidShoutout.minViewers === 30, 'shout-out: the form saves the switch and the minimum');

const { saveUserSettings } = await import('../lib/user-settings-store');
const { encodeEntry } = await import('../lib/variants');
const season = (await kvLib.listSeasons())[0];
await kvLib.setActiveSeason(season.id);
const card = (await kvLib.getPackCards('pack1'))[0];
await kvLib.saveCollection(season.collectionName, { rd_a: [encodeEntry(card.number, 'regular')], rd_priv: [encodeEntry(card.number, 'regular')], rd_err: [encodeEntry(card.number, 'regular')] });
await saveUserSettings('rd_priv', { privateProfile: true });
const shows = async () => (await kv.lrange<{ username: string; type: string; caption?: string }>('webhooks:queue', 0, -1)).filter(q => q.type === 'card');
const said = async () => (await kv.lrange<{ kind: string; text: string }>('bridge:jobs', 0, -1)).filter(j => j.kind === 'say');
const raid = (username: string, amount: number) => send({ event: 'raid', username, amount });

await set({ raid: on({ every: 10 }) });
await raid('rd_a', 50);
ok((await shows()).length === 0, 'shout-out: off shows nothing');
await set({ raid: on({ every: 10 }), raidShoutout: { on: true, minViewers: 10 } });
await raid('rd_a', 9);
ok((await shows()).length === 0 && (await said()).length === 0, 'shout-out: a raid under the minimum shows nothing');
await raid('rd_priv', 50);
ok((await shows()).length === 0, 'shout-out: a private profile shows nothing');
await raid('rd_nobody', 50);
ok((await shows()).length === 0 && (await said()).length === 0, 'shout-out: a raider with no cards shows nothing');
const b4 = await queued();
r = await raid('rd_a', 12);
const sh = await shows();
ok(r.message === 'rd_a got a pack for a raid of 12!' && (await queued()) === b4 + 2, `shout-out: the raid pack is still given: ${r.message}`);
ok(sh.length === 1 && sh[0].username === 'rd_a' && sh[0].caption === 'Raid from rd_a', 'shout-out: the best card is queued with "Raid from <name>"');
const chat = await said();
ok(chat.length === 1 && chat[0].text.startsWith('Welcome, raiders! rd_a brought 12 viewers. Their best card: '), `shout-out: one chat line: ${chat[0]?.text}`);
await raid('rd_a', 40);
ok((await shows()).length === 1 && (await said()).length === 1, 'shout-out: the second raid from the same raider this stream shows nothing');

// A shout-out that fails (the once-per-stream key cannot be written) leaves the raid reward intact.
const realFetch = globalThis.fetch;
globalThis.fetch = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
  String(init?.body ?? '').includes('raidshout') ? Promise.reject(new Error('kv down')) : realFetch(input, init)) as typeof fetch;
const q2 = await queued();
const silence = console.error; console.error = () => {};
r = await raid('rd_err', 12);
console.error = silence; globalThis.fetch = realFetch;
ok(r.ok && r.message === 'rd_err got a pack for a raid of 12!' && (await queued()) === q2 + 1 && (await shows()).length === 1, `shout-out: an error leaves the raid reward intact: ${r.message}`);

console.log('check-event-rewards: ok');
process.exit(0);
