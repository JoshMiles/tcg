// A lock is released only by the request that still owns it (ROADMAP 46.1). If the 10 second TTL runs out mid-release and
// another request takes the lock, the first one must not delete the new owner's lock. Needs the mock KV (node scripts/mock-kv.cjs);
// refuses anything non-local.  Run: npx tsx scripts/check-lock-release.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

// Sends a command straight to the mock (not through the app's client), and lets us act between two of the app's commands.
const realFetch = globalThis.fetch;
const raw = async (...cmd: string[]) => ((await (await realFetch(url, { method: 'POST', headers: { authorization: 'Bearer dev' }, body: JSON.stringify(cmd) })).json()) as { result: unknown }).result;
let afterFirstRead: (() => Promise<void>) | null = null;
globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  const res = await realFetch(input, init);
  const body = String(init?.body); // the client sends commands as a pipeline: [["get", key]]
  if (afterFirstRead && body.includes('"lock:race"') && !/^\[\["set"/i.test(body)) {
    const hook = afterFirstRead; afterFirstRead = null; // the first non-SET command on the lock key is the release starting
    await hook();
  }
  return res;
}) as typeof fetch;

const { withLock } = await import('../lib/kv');
const { runInSandbox } = await import('../lib/db');

// The lock is freed when the work ends, and when it throws.
await withLock('plain', async () => { ok(await raw('GET', 'lock:plain'), 'the lock is held while the work runs'); });
ok((await raw('GET', 'lock:plain')) === null, 'the lock is gone after the work');
await withLock('boom', async () => { throw new Error('x'); }).catch(() => {});
ok((await raw('GET', 'lock:boom')) === null, 'the lock is gone after the work throws');

// The lock expired during the work and another request took it: releasing must leave theirs alone.
await withLock('stolen', async () => {
  await raw('DEL', 'lock:stolen');
  ok(await raw('SET', 'lock:stolen', 'other-owner', 'NX', 'EX', '10') === 'OK', 'another request takes the expired lock');
});
ok((await raw('GET', 'lock:stolen')) === 'other-owner', "releasing after the lock was taken does not delete the new owner's lock");

// The lock expires and is taken in the middle of the release itself (between a check and a delete, if there are two commands).
afterFirstRead = async () => { await raw('DEL', 'lock:race'); await raw('SET', 'lock:race', 'other-owner', 'NX', 'EX', '10'); };
await withLock('race', async () => {});
ok((await raw('GET', 'lock:race')) === 'other-owner', "a takeover in the middle of the release does not lose the new owner's lock");

// Inside a sandbox the lock lives under the sandbox prefix and is released there; a preview deployment may release too.
await runInSandbox('lockbox', () => withLock('boxed', async () => { ok(await raw('GET', 'sbx:lockbox:lock:boxed'), 'the sandbox lock is held under the prefix'); }));
ok((await raw('GET', 'sbx:lockbox:lock:boxed')) === null, 'the sandbox lock is released');
process.env.VERCEL_ENV = 'preview';
await withLock('prev', async () => { ok(await raw('GET', 'sbx:preview:lock:prev'), 'the preview lock is held under the preview prefix'); });
delete process.env.VERCEL_ENV;
ok((await raw('GET', 'sbx:preview:lock:prev')) === null, 'the preview lock is released');

console.log('lock release checks passed');
