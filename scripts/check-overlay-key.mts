// The overlay key (ROADMAP 13.2): the queue, "collection shown" and heartbeat endpoints answer only a request that carries the key.
// Mock KV: node scripts/mock-kv.cjs. Run: npx tsx scripts/check-overlay-key.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const k = await import('../lib/overlay-key');
const { enqueueEvent } = await import('../lib/webhooks');
const { NextRequest } = await import('next/server');
const queue = await import('../app/api/webhooks/queue/route');
const notify = await import('../app/api/webhooks/notify/route');
const beat = await import('../app/api/overlay/heartbeat/route');

ok(k.keyMatches('abc', 'abc') && !k.keyMatches('abd', 'abc') && !k.keyMatches('', '') && !k.keyMatches(null, 'abc') && !k.keyMatches('abcd', 'abc'), 'keys match exactly and only exactly');
ok(k.overlayUrl('https://x.test', 'K', { preset: 'v' }) === 'https://x.test/overlay.html?preset=v&key=K', 'the OBS address carries the key');

const key = await k.getOverlayKey();
ok(key.length >= 32 && (await k.getOverlayKey()) === key, 'a key is made once and then kept');

const H = (h: Record<string, string> = {}) => ({ headers: { 'content-type': 'application/json', ...h } });
const status = (p: Promise<Response>) => p.then(r => r.status, () => 500);

await enqueueEvent({ id: 'e1', type: 'pull', username: 'ann', queuedAt: Date.now() });
ok((await status(queue.GET(new Request('http://x/api/webhooks/queue')))) !== 200, 'the queue refuses a request with no key');
ok((await status(queue.GET(new Request('http://x/api/webhooks/queue', H({ 'x-overlay-key': 'wrong' }))))) !== 200, 'the queue refuses a wrong key');
const taken = await queue.GET(new Request('http://x/api/webhooks/queue', H({ 'x-overlay-key': key })));
const ev = await taken.json();
ok(taken.status === 200 && ev?.id === 'e1', 'with the key the overlay gets the queued pull, which was still there (a refused caller did not take it)');
ok((await (await queue.GET(new Request('http://x/api/webhooks/queue', H({ 'x-overlay-key': key })))).json()) === null, 'and it is gone after');

const nreq = (h?: Record<string, string>) => new NextRequest('http://x/api/webhooks/notify', { method: 'POST', body: JSON.stringify({ event: 'collectionShown', username: 'ann' }), ...H(h) });
ok((await status(notify.POST(nreq()))) !== 200 && (await status(notify.POST(nreq({ 'x-overlay-key': key })))) === 200, 'notify needs the key');
const breq = (h?: Record<string, string>) => new NextRequest('http://x/api/overlay/heartbeat', { method: 'POST', body: JSON.stringify({ id: 'abcdef123456' }), ...H(h) });
ok((await status(beat.POST(breq()))) !== 200, 'a heartbeat with no key is refused');
ok((await status(beat.POST(breq({ 'x-overlay-key': key })))) === 200, 'a heartbeat with the key is taken');

const fresh = await k.regenerateOverlayKey();
ok(fresh !== key && (await k.getOverlayKey()) === fresh, 'a new key replaces the old one');
ok((await status(queue.GET(new Request('http://x/api/webhooks/queue', H({ 'x-overlay-key': key }))))) !== 200, 'and the old key stops working');

console.log('overlay key checks passed');
