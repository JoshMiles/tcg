// Checks the small hardening fixes (ROADMAP 47.7): the sandbox exit only redirects inside the site, push endpoints must sit on a
// known push service, uploads are typed by their bytes, and a failed trade call sends a fixed sentence instead of the raw error.
// No KV needed. Run: node scripts/run-checks.mjs small-hardening
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

// ── sandbox exit ──
const exit = await import('../app/api/sandbox/exit/route');
const go = async (to?: string) => {
  const res = await exit.POST(new Request('http://localhost/api/sandbox/exit' + (to === undefined ? '' : '?to=' + encodeURIComponent(to)), { method: 'POST' }));
  const loc = new URL(res.headers.get('location')!);
  return loc.pathname + loc.search;
};
ok((await go('/trade?x=1')) === '/trade?x=1', 'a same-site path is followed');
for (const bad of ['//evil.example', '/\\evil.example', 'https://evil.example', 'evil', '/a\nb']) ok((await go(bad)) === '/', `refused: ${JSON.stringify(bad)}`);
ok((await go()) === '/', 'no target goes home');

// ── push endpoints ──
const push = await import('../lib/push-core');
for (const good of ['https://fcm.googleapis.com/fcm/send/a', 'https://updates.push.services.mozilla.com/wpush/v2/a', 'https://web.push.apple.com/a', 'https://wns2-par02p.notify.windows.com/w/?token=a', 'https://eu.push.services.mozilla.com/a']) {
  ok(push.validEndpoint(good, false), `accepted: ${good}`);
}
for (const bad of ['https://example.com/push', 'https://fcm.googleapis.com.evil.test/a', 'https://evilnotify.windows.com.test/a', 'https://notify.windows.com.evil.test/a', 'http://web.push.apple.com/a']) {
  ok(!push.validEndpoint(bad, false), `refused: ${bad}`);
}
ok(push.validEndpoint('http://127.0.0.1:4333/x', true), 'the local fake endpoint still works outside production');

// ── upload typing ──
const { sniffUpload } = await import('../lib/upload-sniff');
const bytes = (...b: number[]) => Uint8Array.from([...b, ...new Array(16).fill(0)]);
const text = (s: string) => Uint8Array.from([...Buffer.from(s), ...new Array(16).fill(0)]);
ok(sniffUpload(bytes(0x89, 0x50, 0x4e, 0x47))?.type === 'image/png', 'png');
ok(sniffUpload(bytes(0xff, 0xd8, 0xff, 0xe0))?.ext === 'jpg', 'jpeg');
ok(sniffUpload(text('GIF89a'))?.type === 'image/gif', 'gif');
ok(sniffUpload(text('RIFF\0\0\0\0WEBPVP8 '))?.type === 'image/webp' && sniffUpload(text('RIFF\0\0\0\0WAVEfmt '))?.type === 'audio/wav', 'riff types');
ok(sniffUpload(text('OggS'))?.type === 'audio/ogg' && sniffUpload(bytes(0x1a, 0x45, 0xdf, 0xa3))?.type === 'audio/webm', 'ogg and webm');
ok(sniffUpload(text('ID3'))?.type === 'audio/mpeg' && sniffUpload(bytes(0xff, 0xfb, 0x90, 0x00))?.type === 'audio/mpeg', 'mp3');
ok(sniffUpload(text('<svg xmlns="http://www.w3.org/2000/svg">')) === null && sniffUpload(text('<html><script>')) === null && sniffUpload(new Uint8Array(4)) === null, 'markup and short files are refused');

// ── trade errors ──
const { serverError } = await import('../lib/trade-api');
const realError = console.error; console.error = () => {};
const res = serverError(new Error('ECONNREFUSED kv.internal:6379'), 'check', 'Please try again.');
console.error = realError;
ok(res.status === 503 && JSON.stringify(await res.json()) === '{"error":"Please try again."}', 'the browser gets the fixed sentence, not the raw error');

console.log('ok: small hardening');
