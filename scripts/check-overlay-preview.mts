// The overlay preview (ROADMAP 57.10): a staff PC gets a short-lived, read-only key for TCG Bridge's Preview overlay window. The key expires, is refused for a PC
// without the staff switch, is never the OBS overlay key, and can never take a queued pull or change anything the live overlay owns. Against the mock KV.
// Run: npx tsx scripts/check-overlay-preview.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

import { createRequire } from 'node:module';
(createRequire(import.meta.url)('next/cache') as { revalidatePath: () => void }).revalidatePath = () => {};

const kvLib = await import('../lib/kv');
const { kv, runInSandbox } = await import('../lib/db');
const b = await import('../lib/bridge');
const ok2 = await import('../lib/overlay-key');
const p = await import('../lib/overlay-preview');
const { enqueueEvent, peekQueue, queueLength } = await import('../lib/webhooks');
const { NextRequest } = await import('next/server');
const staffRoute = await import('../app/api/bridge/staff/route');
const queue = await import('../app/api/webhooks/queue/route');
const notify = await import('../app/api/webhooks/notify/route');
const beat = await import('../app/api/overlay/heartbeat/route');
const collection = await import('../app/api/collection/route');

await kvLib.seedSeason1();
const code = await b.createPairCode('josh');
const token = (await b.pairBridge(code.code, 'Stream PC'))!.token;
const id = (await b.listBridges())[0].id;

const post = async (body: Record<string, unknown>) => {
  const res = await staffRoute.POST(new Request('http://localhost/api/bridge/staff', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body) }));
  return { status: res.status, ...(await res.json()) } as { status: number; ok: boolean; message: string; url?: string; expiresAt?: number; needsForce?: boolean };
};
const audits = async () => (await kv.lrange<{ action: string }>('audit:all', 0, 50)) ?? [];
const H = (h: Record<string, string>) => ({ headers: { 'content-type': 'application/json', ...h } });
const status = (pr: Promise<Response>) => pr.then(r => r.status, () => 500);
const poll = (h: Record<string, string>, q = '') => queue.GET(new Request(`http://x/api/webhooks/queue${q}`, H(h)));

// ── Only a staff-enabled PC gets a key ──
ok((await post({ action: 'preview-url' })).status === 403, 'a PC without the staff switch gets no preview address');
ok((await kv.get('overlay:preview:on')) == null, 'and no key was made');
await b.setBridgeStaff(id, true);

// Nothing is copied for the preview while no preview key exists.
await enqueueEvent({ id: 'before', type: 'pull', username: 'ann', queuedAt: Date.now() });
ok((await kv.llen('overlay:preview:feed')) === 0, 'no preview open: events are not copied');
ok((await queue.GET(new Request('http://x/api/webhooks/queue', H({ 'x-overlay-key': await ok2.getOverlayKey() })))).status === 200, 'OBS takes that one');

const r = await post({ action: 'preview-url' });
const pk = new URL(`http://x${r.url}`).searchParams.get('pk') ?? '';
const obsKey = await ok2.getOverlayKey();
ok(r.status === 200 && r.ok && r.url === `/overlay.html?pk=${pk}` && /^[a-f0-9]{48}$/.test(pk), `a staff PC gets a preview address: ${JSON.stringify(r)}`);
ok(!JSON.stringify(r).includes(obsKey) && pk !== obsKey, 'the OBS overlay key is never handed out');
ok((await audits()).some(e => e.action.includes('Overlay preview opened') && e.action.includes('via TCG Bridge on Stream PC, paired by josh')), 'opening it is audited, naming the PC');
ok((await kv.ttl(`overlay:preview:key:${pk}`)) > 0 && (await kv.ttl(`overlay:preview:key:${pk}`)) <= p.PREVIEW_TTL_S && p.PREVIEW_TTL_S === 7200, 'the key lives at most 2 hours');
ok(await p.isPreviewKey(pk) && !(await p.isPreviewKey('0'.repeat(48))) && !(await p.isPreviewKey('short')) && !(await p.isPreviewKey(null)), 'only the issued key is a preview key');
ok(!(await ok2.isOverlayRequest(new Request('http://x/', H({ 'x-overlay-key': pk })))) && !(await ok2.isOverlayRequest(new Request('http://x/', H({ 'x-preview-key': pk })))), 'the preview key does not pass as the overlay key');

// ── The preview only watches: it can never take a queued pull ──
const first = await (await poll({ 'x-preview-key': pk })).json();
ok(first.event === null && typeof first.now === 'number', 'the first look only learns the clock; nothing old is replayed');
await enqueueEvent({ id: 'ticket-1', type: 'pull', username: 'ann', queuedAt: first.now + 5, paid: true, draw: { packId: 'p1', cardNumber: 1, variant: 'regular' } });
for (let i = 0; i < 3; i++) {
  const seen = await (await poll({ 'x-preview-key': pk }, `?since=${first.now}`)).json();
  ok(seen.event?.type === 'pull' && seen.event.username === 'ann' && seen.event.draw.cardNumber === 1, 'the preview sees a copy of the pull');
  ok(seen.event.id !== 'ticket-1' && !('paid' in seen.event) && !JSON.stringify(seen).includes('ticket-1'), 'the copy has no ticket, so it can never be saved');
}
ok((await queueLength()) === 1 && (await peekQueue())[0].id === 'ticket-1', 'three preview polls took nothing from the real queue');
const after = await (await poll({ 'x-preview-key': pk }, `?since=${first.now + 5}`)).json();
ok(after.event === null, 'a copy is played once (the window moves its clock past it)');
ok((await p.previewFeed(first.now, first.now + 120_000)).event === null, 'a copy older than a minute is not played');
const taken = await (await poll({ 'x-overlay-key': obsKey })).json();
ok(taken?.id === 'ticket-1' && taken.paid === true, 'OBS still gets the real pull, with its ticket, afterwards');

// Anything else with the preview key is refused and takes nothing.
await enqueueEvent({ id: 'ticket-2', type: 'pull', username: 'bob', queuedAt: Date.now() });
ok((await status(poll({ 'x-overlay-key': pk }))) === 401, 'the preview key in the overlay-key header takes nothing');
ok((await status(poll({ 'x-preview-key': 'f'.repeat(48) }))) === 401, 'a wrong preview key is refused');
ok((await status(poll({ 'x-preview-key': 'f'.repeat(48), 'x-overlay-key': obsKey }))) === 401, 'a wrong preview key beside the real overlay key is still refused (the preview branch never pops)');
ok((await queueLength()) === 1, 'none of those touched the queue');
const nreq = new NextRequest('http://x/api/webhooks/notify', { method: 'POST', body: JSON.stringify({ event: 'collectionShown', username: 'ann' }), ...H({ 'x-preview-key': pk }) });
ok((await status(notify.POST(nreq))) === 401, '"collection shown" refuses the preview key');
const breq = (body: object) => new NextRequest('http://x/api/overlay/heartbeat', { method: 'POST', body: JSON.stringify(body), ...H({ 'x-preview-key': pk }) });
ok((await status(beat.POST(breq({ id: 'abcdef123456' })))) === 401 && (await status(beat.POST(breq({ id: 'abcdef123456', reveal: 'abcdef123456' })))) === 401, 'a heartbeat and a reveal report refuse the preview key');
ok((await status(collection.GET(new NextRequest('http://x/api/collection?name=season-1', H({}))))) === 401, 'the collection list needs a key');
ok((await status(collection.GET(new NextRequest('http://x/api/collection?name=season-1', H({ 'x-preview-key': pk }))))) === 200, 'the preview may read the collection list');
const save = await collection.POST(new NextRequest('http://x/api/collection?name=season-1', { method: 'POST', body: JSON.stringify({ pull: { username: 'bob', ticket: 'ticket-2' } }), ...H({ 'x-preview-key': pk }) }));
ok((await peekQueue())[0].id === 'ticket-2' && save.status !== 200, 'the preview key cannot save a pull');

// ── Expiry ──
await kv.del(`overlay:preview:key:${pk}`);
ok(!(await p.isPreviewKey(pk)) && (await status(poll({ 'x-preview-key': pk }, '?since=0'))) === 401, 'an expired key is refused');

// ── Test pull: free, for a test viewer, staff only, audited ──
ok((await post({ action: 'test-pull' })).needsForce === true, 'with no overlay connected the test pull asks to be forced');
const t = await post({ action: 'test-pull', force: true });
ok(t.ok && /free/.test(t.message) && (await audits()).some(e => e.action.includes('Test pull simulated') && e.action.includes('via TCG Bridge on Stream PC')), `a test pull starts and is audited: ${JSON.stringify(t)}`);
ok((await peekQueue()).some(e => e.type === 'pull' && e.paid !== true), 'it queued a free pull');
ok(!(await post({ action: 'test-pull', username: 'not_a_test_viewer', force: true })).ok, 'a viewer who is not a test viewer is refused');

// ── Not in a sandbox, not after the switch goes off ──
ok((await runInSandbox('previewbox', () => post({ action: 'preview-url' }))).status !== 200, 'a sandbox gets no preview key');
await b.setBridgeStaff(id, false);
ok((await post({ action: 'preview-url' })).status === 403, 'switched off, no new key');

console.log('check-overlay-preview: ok');
