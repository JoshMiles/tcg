// Discord channels: the old single-webhook settings become one "Activity" channel, events fan out to every channel that wants them (each
// failure isolated), the form's input is validated, and only discord.com / local stand-in URLs are ever called. Uses a local fake webhook
// endpoint and the mock KV (node scripts/mock-kv.cjs). Run: npx tsx scripts/check-discord.mts
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const hits: { path: string; raw: string; body: { allowed_mentions: unknown; embeds: { title?: string; description?: string }[] } }[] = [];
const dmHits: { path: string; body: string }[] = [];
let rateLimitNext = false;
const server = createServer((req, res) => {
  let data = '';
  req.on('data', d => (data += d));
  req.on('end', () => {
    if (req.url?.includes('/oauth2/token/revoke')) {
      dmHits.push({ path: req.url, body: data });
      res.statusCode = 200;
      res.end();
      return;
    }
    if (req.url?.includes('/oauth2/token')) {
      dmHits.push({ path: req.url, body: data });
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ access_token: 'fake_access_token', token_type: 'Bearer' }));
      return;
    }
    if (req.url?.includes('/users/@me/channels')) {
      dmHits.push({ path: req.url, body: data });
      const parsed = data ? JSON.parse(data) : {};
      if (parsed.recipient_id === 'blocked_user') {
        res.statusCode = 403;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ code: 50007, message: 'Cannot send messages to this user' }));
        return;
      }
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ id: 'dm-chan-456' }));
      return;
    }
    if (req.url?.includes('/users/@me')) {
      dmHits.push({ path: req.url, body: data });
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ id: '1122334455', username: 'discorder', global_name: 'Discorder', avatar: null }));
      return;
    }
    if (req.url?.includes('/channels/dm-chan-456/messages')) {
      dmHits.push({ path: req.url, body: data });
      if (rateLimitNext) {
        rateLimitNext = false;
        res.statusCode = 429;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ retry_after: 0.05, message: 'Rate limited' }));
        return;
      }
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ id: 'msg-789' }));
      return;
    }
    if (req.url?.includes('/999/')) { res.statusCode = 404; res.end(JSON.stringify({ message: 'Unknown Webhook' })); return; }
    const multipart = (req.headers['content-type'] ?? '').includes('multipart/');
    hits.push({ path: req.url ?? '', raw: data, body: multipart ? { allowed_mentions: {}, embeds: [] } : JSON.parse(data) });
    res.statusCode = 204; res.end();
  });
});
await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
const port = (server.address() as AddressInfo).port;
const hook = (id: number) => `http://localhost:${port}/api/webhooks/${id}/token`;

const d = await import('../lib/discord');
const kvLib = await import('../lib/kv');
const { kv } = await import('../lib/db');
await kvLib.seedSeason1();

// ── Address checks ──
ok(d.isValidDiscordWebhookUrl('https://discord.com/api/webhooks/123/abc-DEF_1'), 'a real discord.com webhook is accepted');
ok(!d.isValidDiscordWebhookUrl('https://evil.example/api/webhooks/123/abc'), 'another host is refused');
ok(!d.isValidDiscordWebhookUrl('https://discord.com.evil.example/api/webhooks/123/abc'), 'a look-alike host is refused');
ok(!d.isValidDiscordWebhookUrl('http://discord.com/api/webhooks/123/abc'), 'plain http to discord.com is refused');

// ── The old single-webhook shape becomes one Activity channel ──
const old = { url: hook(1), enabled: true, categories: { pulls: true, cards: false, stream: true, resets: false }, minStars: 3, newOnly: true };
const n = d.normalize(old as never);
ok(n.enabled && n.channels.length === 1, 'old settings give one channel');
const c0 = n.channels[0];
ok(c0.name === 'Activity' && c0.enabled && c0.url === old.url && c0.minStars === 3 && c0.newOnly, 'the channel keeps the old url, filters and switch');
ok(c0.categories.pulls && !c0.categories.cards && c0.categories.stream && !c0.categories.resets, 'the channel keeps the old category boxes');
ok(d.normalize({ url: '', enabled: false } as never).channels.length === 0, 'an old empty webhook gives no channel');
ok(d.normalize(null).channels.length === 0 && !d.normalize(null).enabled, 'nothing stored gives no channels');
await kv.set('discord:settings', old);
ok((await d.getDiscordSettings()).channels[0].name === 'Activity', 'the stored old shape is read as a channel');

// ── Validation of the form ──
const ch = (over: Record<string, unknown>) => ({ id: 'a', name: 'A', url: hook(1), enabled: true, categories: {}, minStars: 1, newOnly: false, ...over });
ok(!d.cleanDiscordInput('nope').ok, 'junk is refused');
ok(d.cleanDiscordInput({ enabled: true, channels: Array.from({ length: 25 }, (_, i) => ch({ id: 'c' + i })) }).ok, '25 channels are accepted');
ok(!d.cleanDiscordInput({ enabled: true, channels: Array.from({ length: 26 }, (_, i) => ch({ id: 'c' + i })) }).ok, 'more than 25 channels is refused');
ok(!d.cleanDiscordInput({ enabled: true, channels: [ch({ url: 'https://evil.example/x' })] }).ok, 'a bad address is refused');
ok(!d.cleanDiscordInput({ enabled: true, channels: [ch({ url: '' })] }).ok, 'an enabled channel needs an address');
const dup = d.cleanDiscordInput({ enabled: true, channels: [ch({ id: 'a' }), ch({ id: 'a', name: '  ' })] });
ok(dup.ok && dup.settings.channels[0].id !== dup.settings.channels[1].id && dup.settings.channels[1].name === 'Channel', 'ids stay unique and a blank name gets a default');

// ── Fan-out ──
const event = (over: Record<string, unknown> = {}) => ({
  type: 'pull', cardNumber: 1, cardName: 'Cheesy <@everyone> *Cat*', stars: 4, packName: 'Base', isNew: true, copies: 1, uniqueOwned: 1,
  seq: 1, at: Date.now(), username: 'alice', ...over,
}) as never;
const cats = (p: Record<string, boolean>) => ({ pulls: false, cards: false, upgrades: false, trades: false, listings: false, stream: false, resets: false, admin: false, system: false, ...p });
await d.saveDiscordSettings({
  enabled: true,
  channels: [
    { id: 'pulls', name: 'Pulls', url: hook(1), enabled: true, categories: cats({ pulls: true }), minStars: 1, newOnly: false },
    { id: 'rare', name: 'Rare', url: hook(2), enabled: true, categories: cats({ pulls: true }), minStars: 5, newOnly: false },
    { id: 'cards', name: 'Cards', url: hook(3), enabled: true, categories: cats({ cards: true }), minStars: 1, newOnly: false },
    { id: 'off', name: 'Off', url: hook(4), enabled: false, categories: cats({ pulls: true }), minStars: 1, newOnly: false },
    { id: 'gone', name: 'Gone', url: hook(999), enabled: true, categories: cats({ pulls: true }), minStars: 1, newOnly: false },
  ],
});
// ── Send last activity: the newest event the channel's filters allow ──
{
  const evs = [event({ type: 'grant', seq: 3 }), event({ stars: 2, seq: 2 }), event({ stars: 4, seq: 1 })] as never[];
  const pick = (c: Record<string, unknown>) => (d.newestMatchingEvent(evs as never, ch(c) as never) as { seq: number } | undefined)?.seq;
  ok(pick({ categories: cats({ cards: true }) }) === 3, 'last activity: a Cards channel gets the newest grant');
  ok(pick({ categories: cats({ pulls: true }), minStars: 1 }) === 2, 'last activity: a Pulls channel skips the grant');
  ok(pick({ categories: cats({ pulls: true }), minStars: 3 }) === 1, 'last activity: the star filter skips the 2 star pull');
  ok(pick({ categories: cats({ upgrades: true }) }) === undefined, 'last activity: nothing matching gives nothing');
}
await d.notifyDiscord(event());
ok(hits.length === 1, `a 4 star pull reaches the Pulls channel (the deleted webhook answers 404 and affects nobody else; got ${hits.length})`);
ok(hits.some(h => h.path.includes('/1/')), 'the Pulls channel got it');
ok(!hits.some(h => h.path.includes('/2/')), 'the 5 star channel did not');
ok(!hits.some(h => h.path.includes('/3/') || h.path.includes('/4/')), 'the Cards channel and the switched-off channel did not');
hits.length = 0;
await d.notifyDiscord(event({ stars: 5 }));
ok(hits.length === 2 && hits.some(h => h.path.includes('/2/')), 'a 5 star pull also reaches the 5 star channel');
hits.length = 1;
const body0 = hits[0];
const body = body0.body;
ok(JSON.stringify(body.allowed_mentions) === '{"parse":[]}', 'mentions stay empty');
ok(!/[^\\]<@everyone>/.test(body.embeds[0].title ?? '') || /\\/.test(body.embeds[0].title ?? ''), 'names are escaped');

hits.length = 0;
await d.notifyDiscord(event({ type: 'grant', source: 'admin' }));
ok(hits.length === 1 && hits[0].path.includes('/3/'), 'a grant reaches only the Cards channel');

hits.length = 0;
await d.saveDiscordSettings({ ...(await d.getDiscordSettings()), enabled: false });
await d.notifyDiscord(event());
ok(hits.length === 0, 'the master switch silences every channel');

// ── Upgrades, trades, admin log, system (3.2) ──
{
  const o = d.normalize({ url: hook(1), enabled: true, categories: { pulls: false, cards: true, stream: false, resets: false } } as never).channels[0];
  ok(o.categories.upgrades && o.categories.trades && !o.categories.admin && !o.categories.system, 'an old channel with cards ticked gets upgrades and trades ticked');
  const o2 = d.normalize({ url: hook(1), enabled: true, categories: { pulls: true, cards: false, stream: false, resets: false } } as never).channels[0];
  ok(!o2.categories.upgrades && !o2.categories.trades, 'an old channel without cards stays without them');
  const saved = d.normalize({ enabled: true, channels: [{ id: 'x', name: 'x', url: hook(1), enabled: true, categories: { ...cats({}), cards: true }, minStars: 1, newOnly: false }] } as never).channels[0];
  ok(!saved.categories.upgrades, 'a channel saved with explicit boxes is left as it is');
}
ok(d.categoryOf(event({ type: 'upgrade' })) === 'upgrades' && d.categoryOf(event({ type: 'trade' })) === 'trades' && d.categoryOf(event({ type: 'grant' })) === 'cards', 'upgrades and trades have their own categories');
await d.saveDiscordSettings({
  enabled: true,
  channels: [
    { id: 'up', name: 'Up', url: hook(11), enabled: true, categories: cats({ upgrades: true }), minStars: 1, newOnly: false },
    { id: 'tr', name: 'Tr', url: hook(12), enabled: true, categories: cats({ trades: true }), minStars: 1, newOnly: false },
    { id: 'ad', name: 'Ad', url: hook(13), enabled: true, categories: cats({ admin: true }), minStars: 1, newOnly: false },
    { id: 'sy', name: 'Sy', url: hook(14), enabled: true, categories: cats({ system: true }), minStars: 1, newOnly: false },
    { id: 'ca', name: 'Ca', url: hook(15), enabled: true, categories: cats({ cards: true }), minStars: 1, newOnly: false },
  ],
});
const wait = () => new Promise(r => setTimeout(r, 400));
const only = (n: number) => hits.length === 1 && hits[0].path.includes(`/${n}/`);
hits.length = 0;
await d.notifyDiscord(event({ type: 'upgrade', cardName: 'Cat', from: 'regular', to: 'shiny', cost: 3, uid: 1023381, copyId: '1.3.1' }));
ok(only(11), 'an upgrade reaches only the Upgrades channel');
ok(JSON.stringify(hits[0].body).includes('Serial #1023381') && JSON.stringify(hits[0].body).includes('/c/1023381'), 'the upgrade embed names and links the edition');
hits.length = 0;
await d.notifyDiscord(event({ type: 'trade', action: 'accepted', partner: 'bob', kind: 'direct', give: ['a'], get: ['b'], givePts: 1, getPts: 1 }));
ok(only(12), 'a completed trade reaches only the Trades channel');
hits.length = 0;
await d.notifyDiscord(event({ type: 'trade', action: 'declined', partner: 'bob', kind: 'direct', give: ['a'], get: ['b'], givePts: 1, getPts: 1 }));
ok(hits.length === 0, 'a declined trade is still not posted');
hits.length = 0;
await d.notifyDiscord(event({ type: 'grant', source: 'admin', staff: 'melody' }));
ok(hits.length === 2 && hits.some(h => h.path.includes('/13/')) && hits.some(h => h.path.includes('/15/')), 'a staff grant reaches Cards and the admin log');
const withName = hits.find(h => h.path.includes('/13/'))!, without = hits.find(h => h.path.includes('/15/'))!;
ok(JSON.stringify(withName.body).includes('melody'), 'the admin log names the staff member');
ok(!JSON.stringify(without.body).includes('melody'), 'other channels never name staff');
hits.length = 0;
await d.notifyAdminLog({ action: 'Tag added', subject: 'alice', detail: 'vip', by: 'melody' }); await wait();
ok(only(13) && JSON.stringify(hits[0].body).includes('melody'), 'an audit entry reaches only the admin log, with the name');
hits.length = 0;
await d.notifyAdminLog({ action: 'Card removed', subject: 'alice', by: 'melody' }); await wait();
ok(hits.length === 0, 'an audit entry that has an activity event of its own is not posted twice');
hits.length = 0;
await d.notifySystem({ title: 'Backup saved', tone: 'good' }); await wait();
ok(only(14), 'a system notice reaches only the System channel');
hits.length = 0;
const { runInSandbox } = await import('../lib/db');
await runInSandbox('some-sandbox', async () => { await d.notifySystem({ title: 'x' }); await d.notifyAdminLog({ action: 'y' }); await d.notifyDiscord(event({ type: 'grant', source: 'admin', staff: 'a' })).catch(() => {}); });
await wait();
ok(!hits.some(h => h.path.includes('/11/') || h.path.includes('/14/')) && !hits.some(h => JSON.stringify(h.body).includes('"y"')), 'system and admin notices are silent in a sandbox');

// ── Delivery log (3.6) ──
await d.saveDiscordSettings({
  enabled: true,
  channels: [
    { id: 'dead', name: 'Dead', url: hook(999), enabled: true, categories: cats({ pulls: true }), minStars: 1, newOnly: false },
    { id: 'alive', name: 'Alive', url: hook(51), enabled: true, categories: cats({ pulls: true }), minStars: 1, newOnly: false },
  ],
});
hits.length = 0;
for (let i = 0; i < 19; i++) await d.notifyDiscord(event());
ok((await d.getDiscordSettings()).channels[0].enabled, 'a channel is not switched off before 20 failures in a row');
const logged = await d.getDiscordLog('dead');
ok(logged.length === 19 && logged.every(e => !e.ok && e.status === 404 && /Unknown Webhook/.test(e.error ?? '') && e.kind === 'pull'), 'each failed send is logged with its status and error text');
await d.notifyDiscord(event());
const after20 = (await d.getDiscordSettings()).channels;
ok(!after20[0].enabled && /20 failed sends in a row/.test(after20[0].offReason ?? ''), 'the 20th failure in a row switches the channel off and says why');
ok(after20[1].enabled && !after20[1].offReason, 'a healthy channel is untouched');
ok((await d.getDiscordLog('dead')).length === 20 && (await d.getDiscordLog('alive')).length === 20 && (await d.getDiscordLog('alive')).every(e => e.ok), 'the log keeps the last 20 and records successes');
ok((await d.autoDisabledChannels()).map(c => c.id).join() === 'dead', 'the dashboard can list the channel that was switched off');
const back = d.normalize({ enabled: true, channels: [{ ...after20[0], enabled: true }] } as never).channels[0];
ok(back.enabled && !back.offReason, 'switching it on again clears the reason');
// a success in between keeps the streak from reaching 20
await d.saveDiscordSettings({ enabled: true, channels: [{ id: 'flaky', name: 'Flaky', url: hook(999), enabled: true, categories: cats({ pulls: true }), minStars: 1, newOnly: false }] });
for (let i = 0; i < 25; i++) {
  if (i === 10) await d.saveDiscordSettings({ enabled: true, channels: [{ id: 'flaky', name: 'Flaky', url: hook(52), enabled: true, categories: cats({ pulls: true }), minStars: 1, newOnly: false }] });
  if (i === 11) await d.saveDiscordSettings({ enabled: true, channels: [{ id: 'flaky', name: 'Flaky', url: hook(999), enabled: true, categories: cats({ pulls: true }), minStars: 1, newOnly: false }] });
  await d.notifyDiscord(event());
}
ok((await d.getDiscordSettings()).channels[0].enabled, 'one success in the last 20 keeps a channel on');
// ── Webhook grants read and post like pulls ──
await d.saveDiscordSettings({ enabled: true, channels: [
  { id: 'wp', name: 'Pulls', url: hook(61), enabled: true, categories: cats({ pulls: true }), minStars: 3, newOnly: false },
  { id: 'wc', name: 'Cards', url: hook(62), enabled: true, categories: cats({ cards: true }), minStars: 1, newOnly: false },
] });
hits.length = 0;
const wg = (over: Record<string, unknown> = {}) => ({ type: 'grant', source: 'webhook', username: 'alice', cardNumber: 1, variant: 'shiny', cardName: 'Gouda Goat', stars: 4, packName: 'Base', isNew: true, copies: 1, uniqueOwned: 5, serial: 1, seq: 9, at: Date.now(), ...over }) as never;
await d.notifyDiscord(wg());
ok(hits.length === 1 && hits[0].path.includes('/61/'), 'a webhook grant goes to the Pulls channel, not the Cards channel');
const emb = hits[0].body.embeds[0] as { title?: string; description?: string; fields?: { name: string }[] };
ok(/★★★★ Gouda Goat/.test(emb.title ?? '') && /pulled/.test(emb.description ?? '') && /FIRST EVER/.test(emb.description ?? '') && /NEW!/.test(emb.description ?? ''), 'it looks like a pull: stars, pulled, first ever, new');
ok(/Granted by webhook/.test(emb.description ?? ''), 'and says it was granted by webhook');
ok(['Pack', 'Collected', 'Edition'].every(n => emb.fields?.some(f => f.name === n)), 'with the same Pack, Collected and Edition fields');
hits.length = 0;
await d.notifyDiscord(wg({ stars: 2 }));
ok(hits.length === 0, 'the Pulls channel star filter applies to it');
hits.length = 0;
await d.notifyDiscord(wg({ source: 'admin' }));
ok(hits.length === 1 && hits[0].path.includes('/62/') && /Card granted/.test(hits[0].body.embeds[0].title ?? ''), 'an admin grant still goes to the Cards channel as before');
hits.length = 0;
await d.notifyDiscord(wg({ stars: undefined, packName: undefined, cardName: undefined, uniqueOwned: undefined, isNew: undefined, copies: undefined, serial: undefined }));
ok(hits.length === 1 && /Granted by webhook/.test(hits[0].body.embeds[0].description ?? ''), 'an older webhook grant without the extra facts still posts');
// ── Trade listings (3.4) ──
await d.saveDiscordSettings({
  enabled: true,
  channels: [
    { id: 'li', name: 'Li', url: hook(31), enabled: true, categories: cats({ listings: true }), minStars: 1, newOnly: false },
    { id: 'tr2', name: 'Tr2', url: hook(32), enabled: true, categories: cats({ trades: true }), minStars: 1, newOnly: false },
  ],
});
hits.length = 0;
await d.notifyListing({ id: 'abc-123', from: 'al_ice', expiresAt: Date.now() + 3600_000, give: ['2× Cat (Shiny) · #7, #3'], get: ['1× Dog'], givePts: 120, getPts: 80, note: '@everyone hi' }); await wait();
ok(only(31), 'a listing reaches only the Trade listings channel');
const lj = JSON.stringify(hits[0].body);
ok(lj.includes('/trade/abc-123') && lj.includes('#7, #3') && lj.includes('<t:') && lj.includes('Gives') && lj.includes('Wants'), 'the listing links to its trade page and shows both sides, editions and the end time');
ok(JSON.stringify(hits[0].body.allowed_mentions) === '{"parse":[]}', 'listing mentions stay empty');
const lc = d.normalize({ url: hook(1), enabled: true, categories: { pulls: true, cards: true, stream: false, resets: false } } as never).channels[0];
ok(lc.categories.listings === false, 'an old channel does not start posting listings');

// ── Feedback kind filter (15.5) ──
{
  const fc = (over: Record<string, unknown>) => ({ id: 'f', name: 'F', url: hook(1), enabled: true, categories: cats({ feedback: true }), minStars: 1, newOnly: false, ...over });
  ok(d.normalize({ enabled: true, channels: [fc({})] } as never).channels[0].feedbackKinds === undefined, 'no list stays no list (everything)');
  ok(JSON.stringify(d.normalize({ enabled: true, channels: [fc({ feedbackKinds: ['bug', 'nope', 'idea', 'bug'] })] } as never).channels[0].feedbackKinds) === '["idea","bug"]', 'the list keeps known kinds once each, in order');
  ok(d.normalize({ enabled: true, channels: [fc({ feedbackKinds: ['idea', 'bug', 'deletion', 'report'] })] } as never).channels[0].feedbackKinds === undefined, 'all four kinds is stored as everything');
  ok(JSON.stringify(d.normalize({ enabled: true, channels: [fc({ feedbackKinds: [] })] } as never).channels[0].feedbackKinds) === '[]', 'an empty list means no feedback');
  ok(d.normalize({ enabled: true, channels: [fc({ feedbackKinds: 'idea' })] } as never).channels[0].feedbackKinds === undefined, 'a malformed list is ignored');
  ok(d.wantsFeedbackKind({}, 'bug') && !d.wantsFeedbackKind({ feedbackKinds: ['idea'] }, 'bug') && d.wantsFeedbackKind({ feedbackKinds: ['deletion', 'report'] }, 'report'), 'wantsFeedbackKind');
  const { presetChannel } = await import('../lib/discord-config');
  ok(JSON.stringify(presetChannel('feedback').feedbackKinds) === '["idea","bug"]', 'the Feedback preset is ideas and problems');
  ok(JSON.stringify(presetChannel('requests').feedbackKinds) === '["deletion","report"]' && presetChannel('requests').categories.feedback, 'the Requests and reports preset is deletions and reports');
  ok(presetChannel('pulls').feedbackKinds === undefined, 'other presets have no feedback filter');
  await d.saveDiscordSettings({ enabled: true, channels: [
    fc({ id: 'all', url: hook(21) }), fc({ id: 'ideas', url: hook(22), feedbackKinds: ['idea'] }), fc({ id: 'req', url: hook(23), feedbackKinds: ['deletion', 'report'] }),
  ] } as never);
  const item = (kind: string) => ({ id: 'x', kind, user: 'alice', title: 'T', body: 'B', status: 'new', at: 1 }) as never;
  const got = async (kind: string) => { hits.length = 0; await d.notifyFeedback(item(kind)); await wait(); return hits.map(h => /\/(\d+)\//.exec(h.path)?.[1]).sort().join(','); };
  ok(await got('idea') === '21,22', 'a suggestion reaches the all-kinds channel and the ideas channel');
  ok(await got('bug') === '21', 'a problem reaches only the all-kinds channel');
  ok(await got('deletion') === '21,23', 'a deletion request reaches the all-kinds and the requests channel');
}

// ── Per-category test sends: a real example when one exists, made-up data otherwise ──
{
  const { sampleMessage } = await import('../lib/discord-samples');
  const dc = await import('../lib/discord-config');
  const footer = (m: { embeds: { footer?: { text: string } }[] }) => m.embeds[0]?.footer?.text ?? '';
  for (const k of ['activity:log', 'activity:seq', 'stream:recap:latest', 'digest:latest']) await kv.del(k);
  for (const { key } of dc.DISCORD_CATEGORIES) {
    const m = await sampleMessage(key);
    ok(m.embeds.length === 1 && m.embeds[0].title && JSON.stringify(m.allowed_mentions) === '{"parse":[]}', `the ${key} test is one embed that pings nobody`);
    ok(key === 'feedback' || footer(m).includes('made-up'), `with no data the ${key} test says it is made up (${footer(m)})`);
  }
  const { recordActivity } = await import('../lib/activity');
  await recordActivity({ type: 'upgrade', username: 'realviewer', cardNumber: 1, cardName: 'Real Card', from: 'regular', to: 'shiny', cost: 5 });
  const up = await sampleMessage('upgrades');
  ok(footer(up).includes('real') && JSON.stringify(up).includes('realviewer'), 'with an upgrade in the log the upgrades test uses it');
  ok(footer(await sampleMessage('pulls')).includes('made-up'), 'other categories still fall back to made-up data');
}

// ── Shares: off until a channel is ticked, and no channel means no request ──
{
  const cfg = await import('../lib/discord-config');
  const { presetChannel } = await import('../lib/discord-config');
  ok(cfg.DEFAULT_CATEGORIES.shares === false, 'shares starts off');
  ok(presetChannel('shares').categories.shares && !presetChannel('pulls').categories.shares, 'the Shares preset is the one that ticks it');
  const oldCh = d.normalize({ url: hook(1), enabled: true, categories: { pulls: true, cards: true, stream: false, resets: false } } as never).channels[0];
  ok(oldCh.categories.shares === false, 'a channel saved before shares stays off');
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  hits.length = 0;
  await d.saveDiscordSettings({ enabled: true, channels: [] });
  const none = await d.postShareImage('alice', png);
  ok(!none.ok && none.error.includes('not turned this on') && hits.length === 0, 'no channel means no request');
  await d.saveDiscordSettings({ enabled: false, channels: [{ id: 'sh', name: 'Shares', url: hook(30), enabled: true, categories: cats({ shares: true }), minStars: 1, newOnly: false }] });
  const master = await d.postShareImage('alice', png);
  ok(!master.ok && hits.length === 0, 'the master switch means no request');
  await d.saveDiscordSettings({ enabled: true, channels: [{ id: 'sh', name: 'Shares', url: hook(30), enabled: false, categories: cats({ shares: true }), minStars: 1, newOnly: false }] });
  const quiet = await d.postShareImage('alice', png);
  ok(!quiet.ok && hits.length === 0, 'a switched-off shares channel means no request');
  await d.saveDiscordSettings({ enabled: true, channels: [{ id: 'sh', name: 'Shares', url: hook(30), enabled: true, categories: cats({ shares: true }), minStars: 1, newOnly: false }] });
  const bad = await d.postShareImage('alice', Uint8Array.from([1, 2, 3, 4]));
  ok(!bad.ok && hits.length === 0, 'a non-png is refused before any request');
  const big = new Uint8Array(d.SHARE_MAX_BYTES + 1);
  big.set(png.subarray(0, 8));
  const tooBig = await d.postShareImage('alice', big);
  ok(!tooBig.ok && hits.length === 0, 'an image over the cap is refused before any request');
  const sent = await d.postShareImage('alice', png, 'Ann *');
  ok(sent.ok && hits.length === 1 && hits[0].path.includes('/30/'), 'an enabled shares channel gets the file');
  const raw = hits[0].raw;
  const channel = [...raw.matchAll(/https:\/\/[^"\\\s]+/g)].map(m => { try { return new URL(m[0]); } catch { return null; } }).find(u => u?.hostname === 'www.twitch.tv' && u.pathname === '/cheesygidds');
  ok(raw.includes('payload_json') && raw.includes('Ann') && raw.includes('\\\\*') && raw.includes('The Cheesy TCG') && !!channel && raw.includes('image/png'), 'the post is one line plus the png, with the name escaped');
  ok(JSON.stringify({ parse: [] }) && raw.includes('"parse":[]'), 'share mentions stay empty');
  hits.length = 0;
  const again = await d.postShareImage('alice', png);
  ok(!again.ok && again.error.includes('minute') && hits.length === 0, 'a second post in the same minute makes no request');
  const log = await d.getDiscordLog('sh');
  ok(log[0]?.kind === 'shares' && log[0].ok, 'the send is on the delivery log');
}

// ── Discord User Linking and DM alerts (ROADMAP 4.4) ──
{
  process.env.DISCORD_CLIENT_ID = 'test-client-id';
  process.env.DISCORD_CLIENT_SECRET = 'test-client-secret';
  process.env.DISCORD_BOT_TOKEN = 'test-bot-token';
  process.env.DISCORD_API_BASE = `http://localhost:${port}/api/v10`;

  const dmCore = await import('../lib/discord-dm-core');
  const discordUser = await import('../lib/discord-user');
  const userExport = await import('../lib/user-export');
  const accountDeletion = await import('../lib/account-deletion');
  const tradeNotify = await import('../lib/trade-notify');

  // Payload formatting
  const testPayload = dmCore.buildDiscordDmPayload({ id: 'n1', kind: 'offer', text: 'Alice offered you a trade', tradeId: 't1' }, 'https://cheesytcg.app');
  ok(testPayload.embeds.length === 1, 'embed is built');
  ok(testPayload.embeds[0].title === 'New trade offer', 'title matches kind');
  ok(testPayload.embeds[0].color === 0xeab308, 'embed color is yellow');
  ok(testPayload.embeds[0].url === 'https://cheesytcg.app/trade', 'url points to /trade');

  // Filtering
  const linkSample = { id: '112233', username: 'DiscUser', linkedAt: Date.now(), kinds: ['offers' as const], dmStatus: 'ok' as const };
  ok(dmCore.discordWants(linkSample, 'offer'), 'wants offer');
  ok(!dmCore.discordWants(linkSample, 'accepted'), 'does not want accepted when results unchecked');
  ok(!dmCore.discordWants({ ...linkSample, dmStatus: 'closed' }, 'offer'), 'does not want when dmStatus is closed');

  // Configuration check
  ok(discordUser.isDiscordDmConfigured(), 'discord DM is configured with env');

  // Auth URL
  const authUrl = discordUser.getDiscordAuthUrl('random-state', 'http://localhost/callback');
  ok(authUrl.includes('client_id=test-client-id') && authUrl.includes('scope=identify') && authUrl.includes('state=random-state'), 'auth url is formatted');

  // Code exchange & token revoke
  dmHits.length = 0;
  const user = await discordUser.exchangeDiscordCode('test-code', 'http://localhost/callback');
  ok(user.id === '1122334455' && user.username === 'Discorder', 'code exchange returns user');
  ok(dmHits.some(h => h.path.includes('/oauth2/token/revoke')), 'token is revoked immediately');

  // KV storage: save, get, update, unlink
  await discordUser.saveDiscordLink('viewer1', { id: '1122334455', username: 'Discorder', linkedAt: 1000, dmStatus: 'ok', kinds: ['offers', 'results'] });
  const readLink = await discordUser.getDiscordLink('viewer1');
  ok(readLink?.id === '1122334455' && readLink.username === 'Discorder' && readLink.kinds.length === 2, 'stored link is read');
  ok((await discordUser.getTwitchUserByDiscordId('1122334455')) === 'viewer1', 'twitch user is looked up by discord id');

  await discordUser.updateDiscordKinds('viewer1', ['watch']);
  ok((await discordUser.getDiscordLink('viewer1'))?.kinds[0] === 'watch', 'kinds updated');

  await discordUser.unlinkDiscord('viewer1');
  ok((await discordUser.getDiscordLink('viewer1')) === null, 'link deleted');
  ok((await discordUser.getTwitchUserByDiscordId('1122334455')) === null, 'id lookup cleared');

  // Send DM & rate-limit retry
  await discordUser.saveDiscordLink('viewer2', { id: '1122334455', username: 'Discorder', linkedAt: 1000, dmStatus: 'ok', kinds: ['offers', 'results'] });
  rateLimitNext = true;
  const dmRes = await discordUser.sendTestDiscordDm('viewer2');
  ok(dmRes.ok, 'test DM succeeds after 429 retry');
  const again = await discordUser.sendTestDiscordDm('viewer2');
  ok(!again.ok && again.error === 'cooldown', 'second test DM inside 30 seconds is refused');

  // Second collector is refused a held id; relink frees the old id
  const link9 = { id: '1122334455', username: 'X', linkedAt: 1, dmStatus: 'ok' as const, kinds: [] };
  ok(!(await discordUser.saveDiscordLink('viewer9', link9)), 'second collector is refused a held discord id');
  ok((await discordUser.getTwitchUserByDiscordId('1122334455')) === 'viewer2' && (await discordUser.getDiscordLink('viewer9')) === null, 'refused link writes nothing');
  ok(await discordUser.saveDiscordLink('viewer2', { ...link9, id: 'second_acct' }), 'collector relinks to another account');
  ok((await discordUser.getTwitchUserByDiscordId('1122334455')) === null, 'relink frees the old discord id');
  ok(await discordUser.saveDiscordLink('viewer9', link9), 'freed id can be linked by someone else');
  await discordUser.unlinkDiscord('viewer9');
  await discordUser.saveDiscordLink('viewer2', { ...link9, username: 'Discorder', kinds: ['offers', 'results'] });

  // Closed DMs (error 50007)
  await discordUser.saveDiscordLink('viewer3', { id: 'blocked_user', username: 'BlockedUser', linkedAt: 1000, dmStatus: 'ok', kinds: ['offers'] });
  const blockedRes = await discordUser.sendTestDiscordDm('viewer3');
  ok(!blockedRes.ok && blockedRes.error === 'closed', 'closed DM returns closed error');
  const blockedLink = await discordUser.getDiscordLink('viewer3');
  ok(blockedLink?.dmStatus === 'closed', 'dmStatus is set to closed');

  // trade-notify integration
  dmHits.length = 0;
  await tradeNotify.notify('viewer2', { kind: 'offer', text: 'You received a new trade offer!' });
  ok(dmHits.some(h => h.path.includes('/channels/dm-chan-456/messages')), 'notify sends discord DM to linked account');

  // Export
  const exp = await userExport.buildExport('viewer2');
  ok(exp.discord?.id === '1122334455' && exp.discord.username === 'Discorder', 'export contains discord info');

  // Account deletion
  await accountDeletion.deleteViewerAccount('viewer2');
  ok((await discordUser.getDiscordLink('viewer2')) === null, 'account deletion unlinks discord');
  ok((await discordUser.getTwitchUserByDiscordId('1122334455')) === null, 'account deletion removes id lookup');
}

server.close();
console.log('discord ok');
process.exit(0);
