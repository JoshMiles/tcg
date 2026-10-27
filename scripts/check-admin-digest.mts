// Checks the weekly admin digest (TRIAL, ROADMAP 51.10): the pure builder and the once-a-week cron step posting to a local fake
// webhook with the admin log ticked. Needs the mock KV (node scripts/mock-kv.cjs); refuses anything non-local.
// Run: npx tsx scripts/check-admin-digest.mts
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const hits: { embeds: { title?: string; description?: string }[] }[] = [];
const server = createServer((req, res) => {
  let data = '';
  req.on('data', d => (data += d));
  req.on('end', () => { hits.push(JSON.parse(data)); res.statusCode = 204; res.end(); });
});
await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
const hook = `http://localhost:${(server.address() as AddressInfo).port}/api/webhooks/1/token`;

const W = await import('../lib/weekly-digest');
const DAY = 86_400_000;
const now = Date.UTC(2026, 9, 18, 20);

// ── pure builder ──
const quiet = W.buildAdminDigest({ now, staffCounts: {}, bigReversals: 0, lastEmergencyAt: null, backup: { lastAt: null, problem: 'No backup has been made yet.' } });
ok(quiet.includes('Staff actions, last 7 days: none'), 'a quiet week says none');
ok(quiet.includes('none recorded') && quiet.includes('No backup has been made yet.') && quiet.includes('Failed jobs are not recorded'), 'quiet week lines');
const busy = W.buildAdminDigest({ now, staffCounts: { bob: 3, ann: 12, cat: 3 }, bigReversals: 2, lastEmergencyAt: now - 2 * DAY, backup: { lastAt: now - 3 * DAY } });
ok(busy.includes('ann 12, bob 3, cat 3'), 'staff sorted by count then name');
ok(busy.includes('Emergency password login: yes, last on 2026-10-16'), 'a recent emergency login is flagged');
ok(busy.includes('reversals needing a second approval: 2'), 'big reversals counted');
ok(busy.includes('Backup: newest 2026-10-15 (3 days old)'), 'backup age');
ok(W.buildAdminDigest({ now, staffCounts: {}, bigReversals: 0, lastEmergencyAt: now - 9 * DAY, backup: { lastAt: now } }).includes('none this week (last 2026-10-09)'), 'an old emergency login is not "this week"');

// ── cron step ──
const { kv } = await import('../lib/db');
const store = await import('../lib/weekly-digest-store');
const { SECOND_APPROVAL_NOTE } = await import('../lib/trade-core');
await kv.del('audit:all');
const e = (by: string, at: number, action = 'Tags changed', detail?: string) => ({ at, username: 'v', action, by, ...(detail ? { detail } : {}) });
for (const x of [e('ann', now - DAY), e('ann', now - 2 * DAY), e('bob', now - 3 * DAY), e('old', now - 10 * DAY),
  e('ann', now - DAY, 'Trade reversed', `abcd1234 ${SECOND_APPROVAL_NOTE}`), e('bob', now - DAY, 'Trade reversed', `abcd1234 ${SECOND_APPROVAL_NOTE}`)]) await kv.lpush('audit:all', x);
await kv.set('discord:settings', { enabled: true, channels: [
  { id: 'adm', name: 'Admin', url: hook, enabled: true, categories: { admin: true }, minStars: 1, newOnly: false },
  { id: 'pub', name: 'Public', url: hook, enabled: true, categories: { pulls: true }, minStars: 1, newOnly: false },
] });
await (await import('../lib/admin-cookie')).recordEmergencyLogin(now - DAY);
const first = await store.adminDigestOncePerWeek(now);
ok(first.status === 'posted' && first.channels === 1, `posted to the admin channel only: ${JSON.stringify(first)}`);
ok(hits.length === 1, 'one message arrived');
const text = hits[0].embeds[0].description ?? '';
ok(hits[0].embeds[0].title?.includes('Weekly admin digest'), 'title');
ok(text.includes('ann 3, bob 2'), `staff counts from the audit log (old entry excluded): ${text}`);
ok(text.includes('second approval: 1'), `one distinct big reversal: ${JSON.stringify(text.slice(-150))}`);
ok(text.includes('Emergency password login: yes, last on 2026-10-17'), `emergency login shown: ${text}`);
ok((await store.adminDigestOncePerWeek(now)).status === 'already' && hits.length === 1, 'a second run the same week sends nothing');
console.log(text);
server.close();
console.log('admin digest checks passed');
