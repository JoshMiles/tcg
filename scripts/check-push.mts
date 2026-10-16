// Checks Web Push (ROADMAP 4.3): subscription validation, the device cap, kind gating, removal on 410 and silence in a sandbox,
// against the mock KV and the fake push service in scripts/mock-push.cjs. Delivery on a real phone is not checkable here.
// Run: node scripts/run-checks.mjs push
import { createRequire } from 'node:module';
import { createECDH, randomBytes } from 'node:crypto';

const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const eq = (a: unknown, b: unknown, msg: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
const b64u = (b: Buffer) => b.toString('base64url');

const require = createRequire(import.meta.url);
const mock = await require('./mock-push.cjs').start(0) as { port: number; received: { path: string; kind: string; headers: Record<string, string>; bytes: number }[]; stop: () => void };
const base = `http://127.0.0.1:${mock.port}`;

// A browser-shaped subscription for the fake endpoint.
const sub = (path: string) => {
  const e = createECDH('prime256v1'); e.generateKeys();
  return { endpoint: `${base}${path}`, keys: { p256dh: b64u(e.getPublicKey()), auth: b64u(randomBytes(16)) } };
};

const core = await import('../lib/push-core');
// ── validation ──
ok(core.validEndpoint('https://fcm.googleapis.com/fcm/send/abc', false), 'https endpoints are accepted');
ok(!core.validEndpoint('http://example.com/x', true), 'plain http is refused except on localhost');
ok(core.validEndpoint('http://localhost:4333/x', true) && !core.validEndpoint('http://localhost:4333/x', false), 'localhost http only outside production');
ok(!core.validEndpoint('javascript:alert(1)', true) && !core.validEndpoint(42, true) && !core.validEndpoint('https://x.test/' + 'a'.repeat(700), true), 'junk endpoints are refused');
ok(core.parseSubscription(sub('/push/a')) !== null, 'a good subscription parses');
ok(core.parseSubscription({ ...sub('/push/a'), keys: { p256dh: 'short', auth: 'short' } }) === null, 'wrong key lengths are refused');
ok(core.parseSubscription({ endpoint: sub('/push/a').endpoint }) === null && core.parseSubscription(null) === null, 'missing keys / no body are refused');
eq(core.deviceLabel('Mozilla/5.0 (Linux; Android 14) AppleWebKit Chrome/120 Mobile Safari/537.36'), 'Chrome on Android', 'device label');
ok(!core.deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/604.1').includes('Mozilla'), 'the raw user agent is never stored');
// kind gating (pure)
ok(core.allowsPush(['offers'], 'offer') && core.allowsPush(['offers'], 'countered') && !core.allowsPush(['offers'], 'accepted'), 'offers group');
ok(core.allowsPush(['results'], 'expired') && core.allowsPush(['watch'], 'watch') && core.allowsPush(['admin'], 'admin') && !core.allowsPush([], 'admin'), 'other groups');
eq(core.payloadFor({ id: 'a', kind: 'offer', text: 'x', tradeId: 't1' }).tag, 'trade-t1', 'a trade notice replaces the earlier one (tag per trade)');
ok(core.payloadFor({ id: 'a', kind: 'offer', text: 'x' }).urgent === true && !core.payloadFor({ id: 'a', kind: 'declined', text: 'x' }).urgent, 'offers are urgent');
const us = await import('../lib/user-settings');
eq(us.sanitizeUserSettings({ pushKinds: ['watch', 'bogus', 'offers'] }).pushKinds, ['offers', 'watch'], 'pushKinds are known kinds only');
eq(us.sanitizeUserSettings({}).pushKinds, [...core.PUSH_KINDS], 'every kind is on by default');

// ── not set up: nothing happens ──
delete process.env.VAPID_PUBLIC_KEY; delete process.env.VAPID_PRIVATE_KEY;
const push = await import('../lib/push');
ok(!push.pushConfigured(), 'without keys push is off');
ok(!(await push.addDevice('ann', sub('/push/a'), '')).ok, 'no subscribing without keys');

// ── set up ──
const wp = (await import('web-push')).default;
const keys = wp.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = keys.publicKey; process.env.VAPID_PRIVATE_KEY = keys.privateKey; process.env.VAPID_SUBJECT = 'mailto:test@example.com';
ok(push.pushConfigured(), 'keys switch push on');
ok(!(await push.addDevice('ann', { endpoint: 'ftp://x', keys: {} }, '')).ok, 'a bad subscription is refused');
ok((await push.listDevices('ann')).length === 0, 'and nothing was stored');

// the 5 device cap drops the oldest
for (let i = 1; i <= 6; i++) { ok((await push.addDevice('ann', sub(`/push/d${i}`), 'Chrome/1 Windows')).ok, `device ${i} added`); await new Promise(r => setTimeout(r, 5)); }
let devs = await push.listDevices('ann');
eq(devs.length, 5, 'at most 5 devices');
ok(!devs.some(d => d.ua === '' ) && devs.every(d => !('endpoint' in d) && !('keys' in d)), 'the list never exposes endpoints or keys');
const again = await push.addDevice('ann', sub('/push/d6'), 'x'); // new keys, new endpoint? same path = same hash only if the endpoint matches
ok(again.ok, 'adding again works');
await push.deleteAllDevices('ann');
eq((await push.listDevices('ann')).length, 0, 'delete all clears them');

// ── sending through notify(): kind gating ──
const { notify } = await import('../lib/trade-notify');
const { saveUserSettings } = await import('../lib/user-settings-store');
const seen = () => mock.received.filter(r => r.kind === 'push').length;
await push.addDevice('bob', sub('/push/bob'), 'Firefox/1 Linux');
await notify('bob', { kind: 'offer', text: '@ann offered you a trade.', tradeId: 't9' });
eq(seen(), 1, 'an offer is pushed');
const first = mock.received[0];
ok(first.headers.ttl === '86400' && first.headers.urgency === 'high', 'TTL one day, urgency high for offers');
ok(String(first.headers.authorization).startsWith('vapid '), 'signed with VAPID');
ok(first.bytes > 0, 'an encrypted body was sent');
await notify('bob', { kind: 'declined', text: '@ann declined.', tradeId: 't9' });
eq(seen(), 2, 'a result is pushed');
ok(mock.received[1].headers.urgency === 'normal', 'normal urgency otherwise');
await saveUserSettings('bob', { pushKinds: ['offers'] });
await notify('bob', { kind: 'declined', text: 'again', tradeId: 't9' });
eq(seen(), 2, 'a kind the viewer unticked is not pushed');
await notify('bob', { kind: 'offer', text: 'again', tradeId: 't10' });
eq(seen(), 3, 'a ticked kind still is');
await saveUserSettings('bob', { pushKinds: ['offers', 'results'], notifyOffers: false });
await notify('bob', { kind: 'offer', text: 'muted in the bell', tradeId: 't11' });
eq(seen(), 3, 'a kind switched off in the bell is not pushed either');

// ── a 410 / 404 removes the device, a 500 keeps it ──
await push.deleteAllDevices('cat');
await push.addDevice('cat', sub('/gone/c1'), 'Chrome/1 Android');
await push.addDevice('cat', sub('/missing/c2'), 'Chrome/1 Android');
await push.addDevice('cat', sub('/fail/c3'), 'Chrome/1 Android');
await push.addDevice('cat', sub('/push/c4'), 'Chrome/1 Android');
const r = await push.pushToUser('cat', { title: 't', body: 'b', url: '/trade', tag: 'x' });
eq([r.sent, r.removed, r.failed], [1, 2, 1], 'sent / removed / failed counts');
devs = await push.listDevices('cat');
eq(devs.length, 2, 'the gone devices were removed, the failing one kept');

// ── removal by id and by endpoint ──
const left = (await push.removeDevice('cat', { id: devs[0].id })).length;
eq(left, 1, 'remove by id');
await push.removeDevice('cat', { endpoint: `${base}/push/c4` });
await push.removeDevice('cat', { endpoint: `${base}/fail/c3` });
eq((await push.listDevices('cat')).length, 0, 'remove by endpoint');
ok((await push.removeDevice('cat', { id: '../../x' })).length === 0, 'a junk id is ignored');

// ── a sandbox never sends ──
const { runInSandbox } = await import('../lib/db');
await push.addDevice('dan', sub('/push/dan'), 'Chrome/1 Mac');
const before = mock.received.length;
await runInSandbox('testbox', async () => {
  await push.pushNotice('dan', { id: 'n1', at: Date.now(), kind: 'offer', text: 'x' });
  const t = await push.sendTestPush('dan');
  eq(t.sent, 0, 'test alert is silent in a sandbox');
});
eq(mock.received.length, before, 'nothing reached the push service from a sandbox');
ok((await push.sendTestPush('dan')).sent === 1, 'but the real thing sends a test alert');

// ── the export lists devices without secrets ──
const { buildExport } = await import('../lib/user-export');
const ex = await buildExport('dan') as unknown as { alertDevices: Record<string, unknown>[] };
eq(ex.alertDevices.length, 1, 'the export has the alert device');
ok(!JSON.stringify(ex.alertDevices).includes('push/dan') && !('keys' in ex.alertDevices[0]), 'without its address or keys');

mock.stop();
console.log('push checks ok');
