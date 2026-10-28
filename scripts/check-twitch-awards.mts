// Awards for existing channel points rewards (ROADMAP 58.3): the Helix reward list and its failures, saving and validating awards, each award kind
// running on a redemption, a reward with none ignored, failures recorded with the staff notice rate limit, a repeated message id not awarding twice and the
// Mix It Up redeem switch-over. Mock KV (node scripts/mock-kv.cjs) and a fake Helix passed in as fetch: no real Twitch.
// Run: npx tsx scripts/check-twitch-awards.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
process.env.SESSION_SECRET = 'a-test-secret-that-is-long-enough-123';
process.env.TWITCH_CLIENT_ID = 'test-client'; process.env.TWITCH_CLIENT_SECRET = 'test-secret';
process.env.BACKUP_ENCRYPTION_KEY = 'a-backup-key-that-is-long-enough';
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

// ── A fake Twitch (token, users and Helix rewards), injected where the code takes a fetch, and installed globally for the rest ──
const realFetch = globalThis.fetch;
let twitchUser = { id: '4242', login: 'SpareAccount' };
let helix: { status: number; body: unknown } = { status: 200, body: { data: [] } };
let tokenStatus = 200;
const seen: { url: string; auth: string | null; client: string | null }[] = [];
const fake = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const u = String(input instanceof Request ? input.url : input);
  if (u.startsWith(url)) return realFetch(input, init);
  const h = new Headers(init?.headers);
  if (u.endsWith('/oauth2/token')) {
    if (tokenStatus !== 200) return new Response('{}', { status: tokenStatus });
    return new Response(JSON.stringify({ access_token: 'ACCESS-1', refresh_token: 'REFRESH-1', expires_in: 14000, scope: ['channel:read:redemptions', 'bits:read', 'channel:read:subscriptions', 'user:read:chat', 'user:write:chat', 'channel:bot'] }), { status: 200 });
  }
  if (u.endsWith('/oauth2/revoke')) return new Response('', { status: 200 });
  if (u.endsWith('/helix/users')) return new Response(JSON.stringify({ data: [twitchUser] }), { status: 200 });
  if (u.includes('/helix/channel_points/custom_rewards')) {
    seen.push({ url: u, auth: h.get('Authorization'), client: h.get('Client-Id') });
    return new Response(JSON.stringify(helix.body), { status: helix.status });
  }
  return new Response('{}', { status: 200 }); // Discord and the like
}) as typeof fetch;
globalThis.fetch = fake;

const kvLib = await import('../lib/kv');
const { kv } = await import('../lib/db');
const core = await import('../lib/twitch-awards-core');
const aw = await import('../lib/twitch-awards');
const ch = await import('../lib/twitch-channel');
const ev = await import('../lib/twitch-events');
const b = await import('../lib/bridge');
const buffs = await import('../lib/buffs');
const bcore = await import('../lib/buffs-core');
const mix = await import('../lib/mixitup');
const { normalizeMixItUp } = await import('../lib/mixitup-core');
const { getHappyHour, startHappyHour } = await import('../lib/happyhour');
const { encodeEntry } = await import('../lib/variants');
const { getWebhookSettings } = await import('../lib/webhooks');
const { NextRequest } = await import('next/server');
const { POST: pullRoute } = await import('../app/api/webhooks/pull/route');

const R = (n: number) => `0000000${n}-aaaa-bbbb-cccc-000000000000`; // reward ids
const [PACK, SHOW, BUFF, HAPPY, NONE, GONE] = [R(1), R(2), R(3), R(4), R(5), R(6)];

// ── Pure: ids, awards and the form ──
const usable = new Set(['fan']);
ok(core.cleanAward({ kind: 'pack' }, usable)?.kind === 'pack' && core.cleanAward({ kind: 'showoff' }, usable)?.kind === 'showoff', 'pack and show-off awards');
ok(core.cleanAward({ kind: 'buff', buffId: 'fan' }, usable)?.kind === 'buff' && core.cleanAward({ kind: 'buff', buffId: 'nope' }, usable) === null, 'a buff must be on the usable list');
ok(core.cleanAward({ kind: 'happyhour', minutes: '30', hh: 'discount', percent: '25' }, usable)?.kind === 'happyhour', 'a happy hour award');
for (const bad of [null, 'x', {}, { kind: 'refund' }, { kind: 'happyhour', minutes: 0, hh: 'free' }, { kind: 'happyhour', minutes: 241, hh: 'free' }, { kind: 'happyhour', minutes: 5, hh: 'discount', percent: 100 },
  { kind: 'happyhour', minutes: 5, hh: 'half' }, { kind: 'happyhour', minutes: 1.5, hh: 'free' }]) ok(core.cleanAward(bad, usable) === null, `rejected: ${JSON.stringify(bad)}`);
const form = (m: Record<string, string>) => (k: string) => m[k];
ok(!core.cleanAwardsInput(form({}), ['bad id!'], usable, {}).ok, 'a reward id that is not an id is refused');
ok(!core.cleanAwardsInput(form({ [`aw_${PACK}_kind`]: 'free-money' }), [PACK], usable, {}).ok, 'an unknown award is refused');
ok(!core.cleanAwardsInput(form({ [`aw_${PACK}_kind`]: 'buff', [`aw_${PACK}_buff`]: 'nope' }), [PACK], usable, {}).ok, 'a buff award needs a usable buff');
ok(!core.cleanAwardsInput(form({ [`aw_${PACK}_kind`]: 'happyhour', [`aw_${PACK}_minutes`]: 'many', [`aw_${PACK}_hh`]: 'free' }), [PACK], usable, {}).ok, 'a happy hour needs minutes');
const kept = core.cleanAwardsInput(form({ [`aw_${PACK}_kind`]: 'none' }), [PACK], usable, { [PACK]: { kind: 'pack' }, [GONE]: { kind: 'showoff' } });
ok(kept.ok && !(PACK in kept.awards) && kept.awards[GONE]?.kind === 'showoff', 'none removes an award; an award for a reward the form did not list stays');
ok(core.normalizeAwards({ [PACK]: { kind: 'pack' }, 'bad id': { kind: 'pack' }, [SHOW]: { kind: 'zzz' } })[PACK] !== undefined && Object.keys(core.normalizeAwards({ 'bad id': { kind: 'pack' }, [SHOW]: { kind: 'zzz' } })).length === 0, 'stored awards read back only when well formed');
const u = core.rewardsUrl('https://api.twitch.tv', '12&x=1');
ok(u === 'https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id=12%26x%3D1', `the broadcaster id is an encoded query parameter: ${u}`);
ok(core.parseRewards({ data: [{ id: PACK, title: ' Hydrate\n', is_enabled: false }, { id: 'x', title: 'bad id' }, 5, { id: SHOW }] }).length === 1, 'the reward list keeps only rewards with an id and a title');
ok(core.redemptionOf({ user_login: 'Bob', reward: { id: PACK, title: 'Hydrate' } })?.rewardId === PACK && core.redemptionOf({ reward: { id: PACK } }) === null, 'a redemption needs a viewer and a reward id');
ok(core.twitchHandlesRedeem({ testing: false }, { [PACK]: { kind: 'pack' } }) && !core.twitchHandlesRedeem({ testing: true }, { [PACK]: { kind: 'pack' } }) && !core.twitchHandlesRedeem({ testing: false }, {}) && !core.twitchHandlesRedeem(null, { [PACK]: { kind: 'pack' } }), 'the switch-over rule');

// ── The reward list: not connected, then connected and the Helix failures ──
let list = await aw.fetchRewards(fake);
ok(!list.ok && /No Twitch channel is connected/.test(list.message), 'no channel connected: a clear message');
ok((await ch.connectChannel('code', 'josh', fake)).ok, 'a spare account is connected');
helix = { status: 200, body: { data: [{ id: PACK, title: 'Open a pack', is_enabled: true }, { id: SHOW, title: 'Show off' }, { id: BUFF, title: 'Buff me' }, { id: HAPPY, title: 'Happy hour' }, { id: NONE, title: 'Hydrate' }] } };
list = await aw.fetchRewards(fake);
ok(list.ok && list.rewards.length === 5 && list.rewards[0].title === 'Open a pack', 'the rewards are listed');
ok(seen.at(-1)!.url.endsWith('?broadcaster_id=4242') && seen.at(-1)!.auth === 'Bearer ACCESS-1' && seen.at(-1)!.client === 'test-client', 'asked for the connected channel with its token and the client id');
for (const [status, re] of [[401, /refused to list/], [403, /refused to list/], [404, /no channel points rewards/], [500, /HTTP 500/]] as const) {
  helix = { status, body: {} };
  const l = await aw.fetchRewards(fake);
  ok(!l.ok && re.test(l.message), `Helix ${status}: ${!l.ok && l.message}`);
}
const boom = (async (i: RequestInfo | URL, init?: RequestInit) => { if (String(i).includes('custom_rewards')) throw new Error('offline'); return fake(i, init); }) as typeof fetch;
const down = await aw.fetchRewards(boom);
ok(!down.ok && /Could not reach Twitch/.test(down.message), 'a network failure is a clear message');
tokenStatus = 503;
const noTok = await aw.fetchRewards(fake);
ok(!noTok.ok && /Could not get a Twitch token/.test(noTok.message), 'a token Twitch cannot refresh is a clear message');
tokenStatus = 200;

// ── The world the awards run in: a season, a viewer with a card, buffs, one staff PC ──
await kvLib.seedSeason1();
const season = (await kvLib.listSeasons())[0];
await kvLib.setActiveSeason(season.id);
const cards = await kvLib.getPackCards('pack1');
await kvLib.saveCollection(season.collectionName, { cardfan: [encodeEntry(cards[0].number, 'regular')] });
const mkBuff = (o: Record<string, unknown>) => { const d = bcore.cleanBuffDefInput({ type: 'extra-pulls', magnitude: 1, duration: { unit: 'streams', n: 1 }, stack: 'reject', scope: 'self', ...o }); if (!d.ok) throw new Error(d.message); return d.def; };
await buffs.saveBuffDefs([mkBuff({ id: 'fan', name: 'Fan pulls', streamDeck: true }), mkBuff({ id: 'quiet', name: 'Not on deck' })]);
const admin = await b.mintToken('STREAM-PC', { userId: '1', login: 'josh', role: 'admin', by: 'josh', roleCheckedAt: Date.now() });
ok(!!admin, 'a staff PC exists to get notices');
const notices = async () => { let n = 0; for (const pc of await b.listBridges()) n += await kv.llen(`bridge:notices:${pc.id}`); return n; };

// ── Saving: validated server side, audited ──
const bad = await aw.saveRewardAwards(form({ [`aw_${BUFF}_kind`]: 'buff', [`aw_${BUFF}_buff`]: 'quiet' }), [BUFF]);
ok(!bad.ok && (await aw.readAwards())[BUFF] === undefined, 'a buff without the Stream Deck switch is refused and nothing is saved');
const saved = await aw.saveRewardAwards(form({
  [`aw_${PACK}_kind`]: 'pack', [`aw_${SHOW}_kind`]: 'showoff', [`aw_${BUFF}_kind`]: 'buff', [`aw_${BUFF}_buff`]: 'fan',
  [`aw_${HAPPY}_kind`]: 'happyhour', [`aw_${HAPPY}_minutes`]: '20', [`aw_${HAPPY}_hh`]: 'discount', [`aw_${HAPPY}_percent`]: '25', [`aw_${NONE}_kind`]: 'none',
}), [PACK, SHOW, BUFF, HAPPY, NONE]);
ok(saved.ok, 'the awards are saved');
const stored = await aw.readAwards();
ok(Object.keys(stored).length === 4 && stored[HAPPY].kind === 'happyhour' && NONE in stored === false, 'stored by reward id, none stores nothing');
ok(JSON.stringify(await kv.get('twitch:reward-awards')).includes(PACK), 'in its own KV key');
ok((await (await import('../lib/audit')).getUserAudit('everyone', 20)).some(a => a.action === 'Channel point awards saved'), 'the save is audited');

// ── Redemptions through the site's event path (after the duplicate drop) ──
const red = (id: string, reward: string, title: string, login: string) => ({ messageId: id, type: 'channel.channel_points_custom_reward_redemption.add' as const, event: { broadcaster_user_id: '4242', user_login: login, user_name: login, reward: { id: reward, title, cost: 100 } } });
const last = async () => (await ev.recentTwitchEvents())[0];
const queued = async () => (await kv.lrange<{ type: string; username: string }>('webhooks:queue', 0, -1));
const logHas = async (s: string, okFlag?: boolean) => (await mix.getMixItUpLog()).some(l => l.detail.includes(s) && (okFlag === undefined || l.ok === okFlag));

// a pack: free pull with the reason in the feed
let out = await ev.recordTwitchEvent(red('msg-pack-00001', PACK, 'Open a pack', 'Cardfan'));
ok(out.status === 'recorded', 'recorded');
ok((await queued()).filter(q => q.type === 'pull' && q.username === 'cardfan').length === 1, 'a pack was queued for the redeeming viewer');
ok((await last()).result?.text === 'redeemed Open a pack' && (await last()).result?.ok === true, 'recorded with its result');
const { getActivity } = await import('../lib/activity');
ok((await getActivity({ limit: 20 })).events.some(e => e.type === 'trigger' && e.kind === 'pull' && e.reason === 'redeemed Open a pack'), 'the free pull carries the reason "redeemed <reward title>"');
ok(await logHas('redeemed Open a pack', true), 'the Mix It Up log has a success line');
ok((await notices()) === 0, 'a success sends no notice');

// the same message id again: no second award
const before = (await queued()).length;
out = await ev.recordTwitchEvent(red('msg-pack-00001', PACK, 'Open a pack', 'Cardfan'));
ok(out.status === 'duplicate' && (await queued()).length === before, 'a repeated message id does not award twice');

// a reward with none, and one the site has never heard of: ignored, but still recorded as an event
out = await ev.recordTwitchEvent(red('msg-none-00001', NONE, 'Hydrate', 'cardfan'));
ok(out.status === 'recorded' && (await queued()).length === before && (await last()).result === undefined, 'a reward with no award is ignored');
await ev.recordTwitchEvent(red('msg-none-00002', R(99), 'Mystery', 'cardfan'));
ok((await queued()).length === before && (await last()).result === undefined, 'a reward the site has no award for is ignored');

// show the best card
out = await ev.recordTwitchEvent(red('msg-show-00001', SHOW, 'Show off', 'cardfan'));
ok((await last()).result?.text === "redeemed Show the viewer's best card", `show-off: ${JSON.stringify((await last()).result)}`);
ok((await queued()).some(q => q.type === 'card' && q.username === 'cardfan'), 'the viewer\'s card was queued for the overlay');

// a buff
await ev.recordTwitchEvent(red('msg-buff-00001', BUFF, 'Buff me', 'cardfan'));
ok((await last()).result?.text === 'redeemed Buff Fan pulls' && (await buffs.getUserBuffs('cardfan')).length === 1, 'the buff was applied to the viewer');

// a happy hour
await ev.recordTwitchEvent(red('msg-happy-0001', HAPPY, 'Happy hour', 'cardfan'));
const hh = await getHappyHour();
ok(hh?.kind === 'discount' && hh.percent === 25 && /Happy hour: 25% off packs for 20 minutes/.test((await last()).result?.text ?? ''), 'a happy hour started');

// failures: written to the log, recorded with the event, one staff notice a minute
await ev.recordTwitchEvent(red('msg-buff-00002', BUFF, 'Buff me', 'cardfan'));
let l = await last();
ok(l.result?.ok === false && /already active/.test(l.result.text), `buff already active: ${l.result?.text}`);
ok(await logHas('Buff Fan pulls failed for Buff me', false), 'a failed award writes the Mix It Up log line');
ok((await notices()) === 1, 'the first failure sends the staff notice');
await ev.recordTwitchEvent(red('msg-happy-0002', HAPPY, 'Happy hour', 'cardfan'));
l = await last();
ok(l.result?.ok === false && /already running/.test(l.result.text), `happy hour already running: ${l.result?.text}`);
ok((await getHappyHour())?.by !== undefined && (await notices()) === 1, 'a second failure within a minute sends no second notice');
await kv.del('bridge:award-failed'); // the minute passes
await ev.recordTwitchEvent(red('msg-show-00002', SHOW, 'Show off', 'nocards'));
l = await last();
ok(l.result?.ok === false && (await notices()) === 2, `a viewer with no cards cannot show one off: ${l.result?.text}; a new minute, a new notice`);
const note = await kv.lrange<{ notice: { title: string; text?: string } }>(`bridge:notices:${(await b.listBridges())[0].id}`, 0, -1);
ok(note.some(n => n.notice.title === "Refund nocards's Show off by hand"), 'the notice says whose reward to refund');
await kvLib.saveCollection(season.collectionName, { cardfan: [encodeEntry(cards[0].number, 'regular')] });
// no packs: nothing openable
const savedPacks = await kvLib.getPackCards('pack1');
await kvLib.savePackCards('pack1', []);
await kv.del('bridge:award-failed');
await ev.recordTwitchEvent(red('msg-pack-00002', PACK, 'Open a pack', 'cardfan'));
l = await last();
ok(l.result?.ok === false && /no packs/.test(l.result.text), `no packs: ${l.result?.text}`);
await kvLib.savePackCards('pack1', savedPacks);
// unknown viewer name
await ev.recordTwitchEvent(red('msg-name-00001', PACK, 'Open a pack', '!'));
ok((await last()).result?.ok === false, 'a login that is not a Twitch name fails');

// ── The Mix It Up redeem switch-over (decision 3) ──
const secret = (await getWebhookSettings()).incomingSecret;
const redeem = async (name: string) => { const r = await pullRoute(new NextRequest('http://localhost/api/webhooks/pull', { method: 'POST', body: JSON.stringify({ secret, event: 'redeem', username: name }) })); return (await r.json()) as { ok?: boolean; ignored?: boolean; reason?: string; message?: string }; };
await mix.saveMixItUpSettings(normalizeMixItUp({ ...(await mix.getMixItUpSettings()), eventRewards: { redeem: { on: true, reward: 'packs' } } }));
let before2 = (await queued()).length;
let r = await redeem('mixer_1');
ok(r.ok && !r.ignored && (await queued()).length === before2 + 1, `a test account connected: Mix It Up redeem still works (${r.reason})`);
// the live channel (CHANNEL_LOGIN) connected, with awards
const { CHANNEL_LOGIN } = await import('../lib/site');
twitchUser = { id: '4242', login: CHANNEL_LOGIN };
ok((await ch.connectChannel('code', 'josh', fake)).ok && (await ch.readChannelStatus())?.testing === false, 'the live channel is connected');
before2 = (await queued()).length;
r = await redeem('mixer_2');
ok(r.ignored === true && r.reason === 'twitch_handles_redeem' && r.message === '' && (await queued()).length === before2, 'live channel with awards: the Mix It Up redeem is ignored, silently');
ok(await logHas('twitch_handles_redeem'), 'and says so in the Mix It Up log');
r = await (async () => { const x = await pullRoute(new NextRequest('http://localhost/api/webhooks/pull', { method: 'POST', body: JSON.stringify({ secret, event: 'bits', username: 'mixer_3', amount: 5 }) })); return x.json(); })();
ok(r.reason !== 'twitch_handles_redeem', 'other event commands are not affected');
// no awards at all
await aw.saveAwards({});
before2 = (await queued()).length;
r = await redeem('mixer_4');
ok(r.ok && !r.ignored && (await queued()).length === before2 + 1, 'with no award set, the Mix It Up redeem works as before');
// nothing connected
await ch.disconnectChannel(fake);
await aw.saveAwards({ [PACK]: { kind: 'pack' } });
before2 = (await queued()).length;
r = await redeem('mixer_5');
ok(r.ok && !r.ignored && (await queued()).length === before2 + 1, 'with no channel connected, the Mix It Up redeem works as before');
void startHappyHour;

console.log('check-twitch-awards: ok');
