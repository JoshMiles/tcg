// TCG Bridge on the dashboard (ROADMAP 56.2): picking the newest bridge release from a GitHub answer, its commit, the semver compare and the
// out-of-date line, plus the cached lookup. The mock KV is needed because lib/bridge-release imports the KV client; GitHub is never called
// (fetch is replaced). Run: npx tsx scripts/check-bridge-release.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const r = await import('../lib/bridge-release');
const { kv } = await import('../lib/db');

const sha = 'a'.repeat(40);
const rel = (over: Record<string, unknown>) => ({ tag_name: 'bridge-v0.12.0', draft: false, prerelease: false, target_commitish: 'main', published_at: '2026-10-28T10:00:00Z', html_url: 'https://github.com/JoshMiles/tcg/releases/tag/bridge-v0.12.0', body: '', assets: [], ...over });
const exe = { name: 'TCG-Bridge-Setup-0.12.0.exe', browser_download_url: 'https://github.com/JoshMiles/tcg/releases/download/bridge-v0.12.0/TCG-Bridge-Setup-0.12.0.exe' };

// ── semver ──
ok(r.compareSemver('0.12.0', '0.13.0')! < 0 && r.compareSemver('0.13.0', '0.12.0')! > 0 && r.compareSemver('0.13.0', 'bridge-v0.13.0') === 0, 'compare by number, not by text');
ok(r.compareSemver('0.9.0', '0.10.0')! < 0 && r.compareSemver('1.0.0', '0.99.9')! > 0, '0.9 is older than 0.10');
ok(r.compareSemver('', '0.1.0') === null && r.compareSemver('dev', '0.1.0') === null, 'an unreadable version compares as unknown');

// ── the newest bridge release ──
const list = [
  rel({ tag_name: 'v9.9.9' }), // not a bridge release
  rel({ tag_name: 'bridge-v0.14.0', draft: true }),
  rel({ tag_name: 'bridge-v0.15.0', prerelease: true }),
  rel({ tag_name: 'bridge-v0.9.0' }),
  rel({ tag_name: 'bridge-v0.13.0', target_commitish: sha, assets: [{ name: 'latest.yml', browser_download_url: 'x' }, exe] }),
  rel({ tag_name: 'bridge-v0.10.0' }),
];
const pick = r.pickBridgeRelease(list)!;
ok(pick.version === '0.13.0' && pick.commit === sha && pick.date === '2026-10-28' && pick.installerUrl === exe.browser_download_url, 'the newest published bridge release, by version, with its installer');
ok(r.pickBridgeRelease([rel({ tag_name: 'v1.0.0' }), rel({ tag_name: 'bridge-v0.1.0', draft: true })]) === null && r.pickBridgeRelease('nope') === null && r.pickBridgeRelease([]) === null, 'nothing usable gives null');
const notes = r.pickBridgeRelease([rel({ body: 'Changelog\n\nCommit: https://github.com/JoshMiles/tcg/commit/ABCDEF1234567\n' })])!;
ok(notes.commit === 'abcdef1234567' && notes.installerUrl === '', 'a branch name as target: the commit comes from the notes line');
ok(r.pickBridgeRelease([rel({})])!.commit === '', 'no sha anywhere: no commit');

// ── the line ──
ok(r.bridgeVersionLine('0.12.0', '0.13.0') === 'Out of date: 0.12.0 running, 0.13.0 available.', 'out of date names both');
ok(r.bridgeVersionLine('0.13.0', '0.13.0') === 'Up to date: 0.13.0 running.' && r.bridgeVersionLine('0.14.0', '0.13.0').startsWith('Up to date'), 'current or newer is up to date');
ok(r.bridgeVersionLine('', '0.13.0') === 'Latest TCG Bridge is 0.13.0.' && r.bridgeVersionLine('0.12.0', null) === '0.12.0 running.' && r.bridgeVersionLine('', null) === '', 'a missing side is said plainly');

// ── the cached lookup ──
await kv.del('bridge:release');
const realFetch = globalThis.fetch;
let calls = 0, mode: 'ok' | 'down' = 'ok';
globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => { // the KV client uses fetch too, so only GitHub is faked
  if (!String(input instanceof Request ? input.url : input).startsWith('https://api.github.com/')) return realFetch(input, init);
  calls++; if (mode === 'down') throw new Error('offline'); return new Response(JSON.stringify(list), { status: 200 }); }) as typeof fetch;
const t0 = 1_800_000_000_000;
let l = await r.latestBridgeRelease(t0);
ok(l.release?.version === '0.13.0' && !l.failed && calls === 1, 'the first call asks GitHub');
l = await r.latestBridgeRelease(t0 + 9 * 60_000);
ok(l.release?.version === '0.13.0' && calls === 1, 'inside 10 minutes the cache answers');
mode = 'down';
l = await r.latestBridgeRelease(t0 + 11 * 60_000);
ok(calls === 2 && l.failed && l.release?.version === '0.13.0', 'GitHub down: the cached release comes back, marked failed');
l = await r.latestBridgeRelease(t0 + 11 * 60_000 + 30_000);
ok(calls === 2 && l.failed, 'a failure is not retried for a minute');
mode = 'ok';
l = await r.latestBridgeRelease(t0 + 12 * 60_000 + 1);
ok(calls === 3 && !l.failed, 'after the minute it asks again and recovers');
globalThis.fetch = realFetch;
await kv.del('bridge:release');

console.log('bridge release checks passed');
setTimeout(() => process.exit(0), 100); // let open sockets close first (Windows asserts on an immediate exit)
