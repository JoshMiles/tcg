// Discord channels: the old single-webhook settings become one "Activity" channel, events fan out to every channel that wants them (each
// failure isolated), the form's input is validated, and only discord.com / local stand-in URLs are ever called. Uses a local fake webhook
// endpoint and the mock KV (node scripts/mock-kv.cjs). Run: npx tsx scripts/check-discord.mts
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const hits: { path: string; body: { allowed_mentions: unknown; embeds: { title?: string; description?: string }[] } }[] = [];
const server = createServer((req, res) => {
  let data = '';
  req.on('data', d => (data += d));
  req.on('end', () => {
    if (req.url?.includes('/999/')) { res.statusCode = 404; res.end(JSON.stringify({ message: 'Unknown Webhook' })); return; }
    hits.push({ path: req.url ?? '', body: JSON.parse(data) });
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
ok(!d.cleanDiscordInput({ enabled: true, channels: Array.from({ length: 9 }, (_, i) => ch({ id: 'c' + i })) }).ok, 'more than 8 channels is refused');
ok(!d.cleanDiscordInput({ enabled: true, channels: [ch({ url: 'https://evil.example/x' })] }).ok, 'a bad address is refused');
ok(!d.cleanDiscordInput({ enabled: true, channels: [ch({ url: '' })] }).ok, 'an enabled channel needs an address');
const dup = d.cleanDiscordInput({ enabled: true, channels: [ch({ id: 'a' }), ch({ id: 'a', name: '  ' })] });
ok(dup.ok && dup.settings.channels[0].id !== dup.settings.channels[1].id && dup.settings.channels[1].name === 'Channel', 'ids stay unique and a blank name gets a default');

// ── Fan-out ──
const event = (over: Record<string, unknown> = {}) => ({
  type: 'pull', cardNumber: 1, cardName: 'Cheesy <@everyone> *Cat*', stars: 4, packName: 'Base', isNew: true, copies: 1, uniqueOwned: 1,
  seq: 1, at: Date.now(), username: 'alice', ...over,
}) as never;
const cats = (p: Record<string, boolean>) => ({ pulls: false, cards: false, upgrades: false, trades: false, stream: false, resets: false, admin: false, system: false, ...p });
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
ok(JSON.stringify(hits[0].body).includes('Print #1023381') && JSON.stringify(hits[0].body).includes('/c/1023381'), 'the upgrade embed names and links the print');
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

server.close();
console.log('discord ok');
process.exit(0);
