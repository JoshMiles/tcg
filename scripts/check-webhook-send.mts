// The guarded sender (lib/webhook-send.ts): resolves the host, refuses private answers, never follows a redirect. DNS and fetch are stubbed,
// nothing leaves the machine. Run: npx tsx scripts/check-webhook-send.mts
import { sendWebhook, webhookDns } from '../lib/webhook-send';

const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

let answers: string[] | Error = ['93.184.216.34'];
webhookDns.lookup = (async () => { if (answers instanceof Error) throw answers; return answers.map(address => ({ address, family: address.includes(':') ? 6 : 4 })); }) as typeof webhookDns.lookup;
const realFetch = globalThis.fetch;
let status = 200;
let calls = 0;
let lastInit: RequestInit | undefined;
globalThis.fetch = (async (_u: unknown, init?: RequestInit) => { calls++; lastInit = init; return new Response('ok', { status }); }) as typeof fetch;
const send = (url: string) => sendWebhook(url, { method: 'POST', body: '{}' });

try {
  let r = await send('http://hooks.example.com/stored');
  ok(r.ok && calls === 1, 'a stored http address on a public host is sent');
  ok(lastInit?.redirect === 'manual', 'redirects are never followed');
  r = await send('https://hooks.example.com/x');
  ok(r.ok && calls === 2, 'an https address on a public host is sent');

  for (const bad of ['10.1.2.3', '127.0.0.1', '::1', '::ffff:192.168.1.1', '169.254.169.254']) {
    answers = ['93.184.216.34', bad];
    const before = calls;
    r = await send('https://sneaky.example.com/x');
    ok(!r.ok && r.error === 'The address resolves to a private network.' && calls === before, `a host resolving to ${bad} (among other answers) is refused`);
  }

  answers = new Error('ENOTFOUND');
  r = await send('https://gone.example.com/x');
  ok(!r.ok && r.error === 'Could not look up the address.' && calls === 2, 'a failed lookup is refused');
  answers = [];
  r = await send('https://empty.example.com/x');
  ok(!r.ok, 'a lookup with no answers is refused');

  const before = calls;
  answers = new Error('should not be used');
  r = await send('https://93.184.216.34/x');
  ok(r.ok && calls === before + 1, 'a literal public IP is sent without a lookup');
  r = await send('https://10.0.0.5/x');
  ok(!r.ok && calls === before + 1, 'a literal private IP is refused without a lookup');
  r = await send('https://[::ffff:10.0.0.1]/x');
  ok(!r.ok && calls === before + 1, 'a literal IPv4-mapped private address is refused');

  answers = ['93.184.216.34'];
  for (const s of [301, 302, 307, 308]) {
    status = s;
    r = await send('https://hooks.example.com/x');
    ok(!r.ok && r.error === 'The address redirected; webhooks do not follow redirects.', `a ${s} is a failed send`);
  }
  status = 500;
  r = await send('https://hooks.example.com/x');
  ok(r.ok && r.res.status === 500, 'a plain server error is returned for the caller to judge');

  // An injected fetch (the Mix It Up checks) skips the lookup but keeps every other rule.
  answers = new Error('should not be used');
  const fake = (async () => new Response('{}')) as typeof fetch;
  ok((await sendWebhook('https://hook.example/a', {}, fake)).ok, 'an injected fetch skips the lookup');
  ok(!(await sendWebhook('http://localhost:8911/x', {}, fake)).ok, 'an injected fetch still cannot reach a private address');
} finally {
  globalThis.fetch = realFetch;
}

console.log('webhook-send checks passed');
