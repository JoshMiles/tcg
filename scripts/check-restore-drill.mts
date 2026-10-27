// Checks the monthly restore drill (ROADMAP 51.14): the pure report, and the whole drill on the mock KV with a locally built backup
// (throwaway key, stubbed download) posting to a local fake webhook. The drill must write nothing but its own lock key.
// Needs the mock KV (node scripts/mock-kv.cjs); refuses anything non-local. Run: npx tsx scripts/check-restore-drill.mts
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
process.env.BACKUP_ENCRYPTION_KEY = 'throwaway-key-for-the-check';
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const hits: { embeds: { title?: string; description?: string }[] }[] = [];
const server = createServer((req, res) => {
  let data = '';
  req.on('data', d => (data += d));
  req.on('end', () => { hits.push(JSON.parse(data)); res.statusCode = 204; res.end(); });
});
await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
const hook = `http://localhost:${(server.address() as AddressInfo).port}/api/webhooks/1/token`;

const D = await import('../lib/restore-drill');
const core = await import('../lib/backup-core');
const { collectEntries } = await import('../lib/backup');
const { kv, prodKv } = await import('../lib/db');
const DAY = 86_400_000;
const now = Date.UTC(2026, 10, 1, 20); // Sunday 1 November 2026

// ---- pure report ----
const prev = (added: number, replaced: number, unchanged: number, notInBackup: number) => ({
  added: Array(added).fill('a'), replaced: Array(replaced).fill('r'), unchanged, notInBackup: Array(notInBackup).fill('n'),
  byPrefix: { 'user:': { added: 0, replaced: replaced, unchanged: 5, notInBackup: 1 }, 'pack:': { added, replaced: 0, unchanged: 0, notInBackup: 0 }, 'seasons:list': { added: 0, replaced: 0, unchanged: 1, notInBackup: 0 } },
});
const pass = D.buildDrillReport({ now, backupAt: now - 3 * DAY, backupKeys: 100, liveKeys: 100, preview: prev(1, 4, 95, 0) });
ok(pass.status === 'passed' && pass.title.includes('PASSED'), 'passes');
ok(pass.text.includes('2026-10-29 (3 days old)') && pass.text.includes('100 in the backup, 100 live') && pass.text.includes('add 1, replace 4, leave 95'), `pass text: ${pass.text}`);
ok(pass.text.includes('Most changed prefixes: user: 5, pack: 1') && !pass.text.includes('seasons:list'), 'top differing prefixes, unchanged ones left out');
const warn = D.buildDrillReport({ now, backupAt: now - DAY, backupKeys: 89, liveKeys: 100, preview: prev(0, 0, 89, 11) });
ok(warn.status === 'warning' && warn.text.includes('Warning: the backup has fewer than 90%'), 'a short backup warns');
ok(D.buildDrillReport({ now, backupAt: now, backupKeys: 90, liveKeys: 100, preview: prev(0, 0, 90, 10) }).status === 'passed', '90% is fine');
const fail = D.buildDrillReport({ now, backupAt: now - DAY, error: 'Could not decrypt: wrong BACKUP_ENCRYPTION_KEY, or the file is damaged.' });
ok(fail.status === 'failed' && fail.title.includes('FAILED') && fail.text.includes('Could not decrypt'), 'a decrypt error fails');

// ---- the drill on the mock KV ----
await kv.set('discord:settings', { enabled: true, channels: [
  { id: 'adm', name: 'Admin', url: hook, enabled: true, categories: { admin: true }, minStars: 1, newOnly: false },
  { id: 'pub', name: 'Public', url: hook, enabled: true, categories: { pulls: true }, minStars: 1, newOnly: false },
] });
for (let i = 0; i < 20; i++) await kv.set(`user:u${i}:profile`, { n: i });
await kv.set('seasons:list', ['s1']);
await kv.hset('coll:S1', { a: '1' });
await kv.rpush('audit:all', 'x');
await kv.sadd('users:hidden', 'h');
const snapshot = await collectEntries(prodKv as never, now);
const encrypted = core.encryptBackup(core.serializeBackup(snapshot), process.env.BACKUP_ENCRYPTION_KEY);
// Live moves on after the backup: one changed, one new.
await kv.set('user:u0:profile', { n: 'changed' });
await kv.set('user:new:profile', { n: 'new' });

const dump = async () => {
  const keys: string[] = []; let cursor: string | number = 0;
  do { const [next, batch] = await prodKv.scan(cursor, { match: '*', count: 500 }); keys.push(...batch); cursor = next; } while (String(cursor) !== '0');
  const out: Record<string, unknown> = {};
  for (const k of [...new Set(keys)].sort()) { const t = await prodKv.type(k); out[k] = [t, t === 'hash' ? await prodKv.hgetall(k) : t === 'list' ? await prodKv.lrange(k, 0, -1) : t === 'set' ? await prodKv.smembers(k) : await prodKv.get(k)]; }
  return out;
};
const live = async () => (await collectEntries(prodKv as never)).entries;
const good = { newestBackup: async () => ({ url: 'stub://b', uploadedAt: now - 2 * DAY }), download: async () => encrypted, live };

const before = await dump();
ok((await D.restoreDrillOncePerMonth(Date.UTC(2026, 10, 8, 20), good)).status === 'skipped', 'not the first Sunday: skipped');
const first = await D.restoreDrillOncePerMonth(now, good);
ok(first.status === 'passed' && 'channels' in first && first.channels === 1, `posted to the admin channel only: ${JSON.stringify(first)}`);
ok(hits.length === 1 && hits[0].embeds[0].title === 'Restore drill PASSED', `title: ${hits[0]?.embeds[0].title}`);
const text = (hits[0].embeds[0].description ?? '').replace(/\\/g, ''); // Discord escaping
ok(text.includes('2026-10-30 (2 days old)') && text.includes('replace 1') && text.includes('1 live keys are not in the backup'), `message: ${text}`);
ok((await D.restoreDrillOncePerMonth(now, good)).status === 'already' && hits.length === 1, 'a second run the same month sends nothing');

const after = await dump();
const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(k => JSON.stringify(before[k]) !== JSON.stringify(after[k]) && !k.startsWith('discord:log:')); // the delivery log is what every Discord post records
ok(changed.length === 1 && changed[0] === 'drill:month:2026-11', `only the lock key changed: ${changed.join(', ')}`);

// A backup that cannot be decrypted reports FAILED (next month).
const dec = Date.UTC(2026, 11, 6, 20); // Sunday 6 December 2026
const bad = await D.restoreDrillOncePerMonth(dec, { ...good, download: async () => core.encryptBackup(core.serializeBackup(snapshot), 'some-other-key-entirely') });
ok(bad.status === 'failed' && hits.length === 2 && hits[1].embeds[0].title === 'Restore drill FAILED' && (hits[1].embeds[0].description ?? '').includes('Could not decrypt'), 'a wrong key posts FAILED');
// No backup at all.
const none = await D.runRestoreDrill(now, { ...good, newestBackup: async () => null });
ok(none.status === 'failed' && none.text.includes('No backup exists'), 'no backup fails');
// A short backup warns end to end.
const small = core.encryptBackup(core.serializeBackup({ ...snapshot, entries: snapshot.entries.slice(0, 5) }), process.env.BACKUP_ENCRYPTION_KEY);
ok((await D.runRestoreDrill(now, { ...good, download: async () => small })).status === 'warning', 'a short backup warns');

server.close();
console.log(text);
console.log('restore drill checks passed');
