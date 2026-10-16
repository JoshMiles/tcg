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
const cats = (p: Record<string, boolean>) => ({ pulls: false, cards: false, stream: false, resets: false, ...p });
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

server.close();
console.log('discord ok');
process.exit(0);
