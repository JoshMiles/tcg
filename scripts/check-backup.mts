// Nightly backup: key rules, retention, the encrypted file, snapshot + restore round trip, and the refusals.
// Needs the mock KV (npm run check starts it); refuses anything non-local. Blob is never contacted: runBackup refuses first.
// Run: npx tsx scripts/check-backup.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';

const core = await import('../lib/backup-core');
const backup = await import('../lib/backup');
const { prodKv } = await import('../lib/db');
const { NextRequest } = await import('next/server');

const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const throws = async (fn: () => unknown) => { try { await fn(); return false; } catch { return true; } };

// ---- which keys are kept ----
for (const k of ['seasons:list', 'season:s1', 'season:s1:wrap', 'pack:p1:cards', 'tcg_Season2', 'user:alice:profile', 'user:alice:settings', 'user:alice:ach',
  'user:alice:scorehist:s1', 'copies:Season2:o:alice', 'copies:uid:seq', 'staff:members', 'trades:open', 'notif:alice', 'discord:settings', 'webhooks:settings',
  'overlay:settings', 'scoring:settings', 'twitch_opaque:U123', 'users:hidden', 'admin:dashboard', 'audit:all', 'something:nobody:thought:of']) ok(core.isBackedUp(k), `${k} is backed up`);
for (const k of ['sbx:preview:tcg_x', 'sbx:demo:seasons:list', 'sandbox:registry', 'stats:h:Season2', 'stats:last', 'twitch:live', 'twitch:avatars', 'activity:log', 'activity:seq',
  'lock:trades', 'captcha:pass:alice', 'showoff:cd:alice', 'trade:cd:alice', 'webhooks:queue', 'overlay:clients', 'overlay:reload', 'watch:idx:12', 'watch:idx:ready',
  'user:alice:snap:abc', 'user:alice:snaps']) ok(!core.isBackedUp(k), `${k} is not backed up`);
ok(core.isBackedUp('user:snapper:profile'), 'a viewer called snapper is not mistaken for a restore point');

// ---- names and retention ----
const day = (i: number) => new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10);
ok(core.backupName(Date.UTC(2026, 9, 15, 4)) === 'backups/2026-10-15.json.gz.enc', 'file name from the date');
const names = Array.from({ length: 20 }, (_, i) => `backups/${day(i)}.json.gz.enc`);
const junk = ['backups/readme.txt', 'card-art/2026-01-01.json.gz.enc', 'backups/2026-10-01.json.gz', 'backups/../x'];
const doomed = core.pickBackupsToDelete([...junk, ...[...names].reverse()], 14);
ok(doomed.length === 6 && doomed.every(d => names.slice(0, 6).includes(d)), 'the six oldest of twenty are picked, in any input order');
ok(core.pickBackupsToDelete(names.slice(0, 14), 14).length === 0, 'nothing is deleted at the limit');
ok(core.pickBackupsToDelete(junk, 0).length === 0, 'files that are not backups are never picked');
const NOW = Date.UTC(2026, 9, 15, 12);
ok(!core.backupIsStale(NOW - 35 * 3_600_000, NOW) && core.backupIsStale(NOW - 37 * 3_600_000, NOW) && core.backupIsStale(null, NOW), 'stale after 36 hours or when there is none');

// ---- encryption ----
const KEY = 'a-long-backup-key-for-the-check';
const plain = Buffer.from('{"hello":"world"}');
const enc = core.encryptBackup(plain, KEY);
ok(!enc.includes('hello'), 'ciphertext does not contain the plaintext');
ok(core.decryptBackup(enc, KEY).equals(plain), 'decrypts with the right key');
ok(!core.encryptBackup(plain, KEY).equals(enc), 'every encryption uses a fresh salt and iv');
ok(await throws(() => core.decryptBackup(enc, KEY + 'x')), 'the wrong key is refused');
const tampered = Buffer.from(enc); tampered[tampered.length - 20] ^= 1;
ok(await throws(() => core.decryptBackup(tampered, KEY)), 'a damaged file is refused');
ok(await throws(() => core.decryptBackup(Buffer.from('not a backup at all, just some text'), KEY)), 'a random file is refused');
ok(await throws(() => core.encryptBackup(plain, 'short')), 'a short key is refused');

// ---- snapshot and restore round trip against the mock KV ----
await prodKv.set('seasons:list', ['s1']);
await prodKv.set('season:s1', { id: 's1', name: 'Season 1', collectionName: 'S1' });
await prodKv.set('tcg_S1', { alice: [1, 1, 2], bob: [3] });
await prodKv.hset('staff:members', { alice: { login: 'alice', role: 'mod' }, bob: { login: 'bob', role: 'admin' } });
await prodKv.lpush('trades:history', { id: 'a' }); await prodKv.lpush('trades:history', { id: 'b' }); await prodKv.lpush('trades:history', { id: 'c' });
await prodKv.sadd('users:hidden', 'x', 'y');
await prodKv.set('sbx:demo:seasons:list', ['nope']);
await prodKv.set('stats:last', 'skip me');
await prodKv.set('lock:trades', 'skip me');
await prodKv.lpush('activity:log', { id: 1 });
await prodKv.set('user:alice:snap:1', { big: true });

const file = await backup.collectEntries(prodKv as unknown as Parameters<typeof backup.collectEntries>[0], NOW);
const byKey = new Map(file.entries.map(e => [e.key, e]));
ok(byKey.size === file.entries.length, 'no key twice');
for (const k of ['seasons:list', 'season:s1', 'tcg_S1', 'staff:members', 'trades:history', 'users:hidden']) ok(byKey.has(k), `${k} was collected`);
for (const k of ['sbx:demo:seasons:list', 'stats:last', 'lock:trades', 'activity:log', 'user:alice:snap:1']) ok(!byKey.has(k), `${k} was left out`);
ok(byKey.get('staff:members')!.type === 'hash' && byKey.get('trades:history')!.type === 'list' && byKey.get('users:hidden')!.type === 'set' && byKey.get('tcg_S1')!.type === 'string', 'types are recorded');
ok(file.skipped.length === 0, 'nothing skipped');

// Through the real file format: gzip, encrypt, decrypt, parse.
const reread = core.parseBackup(core.decryptBackup(core.encryptBackup(core.serializeBackup(file), KEY), KEY));
ok(reread.entries.length === file.entries.length && reread.createdAt === NOW, 'the file survives the encrypted round trip');
ok(core.describeBackup(reread).includes(`${file.entries.length} keys`), 'describe names the key count');

// Restore into a sandbox namespace: same values and the same list order, and the real keys are untouched.
const n = await backup.restoreEntries(prodKv as unknown as Parameters<typeof backup.restoreEntries>[0], reread.entries, k => `sbx:rt:${k}`);
ok(n === reread.entries.length, 'every entry was restored');
ok(JSON.stringify(await prodKv.get('sbx:rt:tcg_S1')) === JSON.stringify({ alice: [1, 1, 2], bob: [3] }), 'a string value is restored exactly');
ok(JSON.stringify(await prodKv.hgetall('sbx:rt:staff:members')) === JSON.stringify(await prodKv.hgetall('staff:members')), 'a hash is restored exactly');
ok(JSON.stringify(await prodKv.lrange('sbx:rt:trades:history', 0, -1)) === JSON.stringify(await prodKv.lrange('trades:history', 0, -1)), 'a list keeps its order');
ok(JSON.stringify(((await prodKv.smembers('sbx:rt:users:hidden')) as string[]).sort()) === JSON.stringify(['x', 'y']), 'a set is restored');
ok(JSON.stringify(await prodKv.get('tcg_S1')) === JSON.stringify({ alice: [1, 1, 2], bob: [3] }), 'the original keys were not touched');

// A restore replaces rather than merges, and --raw style (no rename) puts keys back where they were.
await prodKv.set('tcg_S1', { mallory: [9] });
await prodKv.lpush('trades:history', { id: 'later' });
await backup.restoreEntries(prodKv as unknown as Parameters<typeof backup.restoreEntries>[0], reread.entries);
ok(JSON.stringify(await prodKv.get('tcg_S1')) === JSON.stringify({ alice: [1, 1, 2], bob: [3] }), 'a raw restore replaces a changed string');
ok((await prodKv.lrange('trades:history', 0, -1)).length === 3, 'a raw restore replaces a list instead of appending');

// ---- refusals ----
delete process.env.VERCEL_ENV;
ok(await throws(() => backup.runBackup()), 'no backup outside production');
process.env.VERCEL_ENV = 'preview';
ok(await throws(() => backup.runBackup()), 'no backup on a preview');
process.env.VERCEL_ENV = 'production';
delete process.env.BACKUP_ENCRYPTION_KEY;
let msg = ''; try { await backup.runBackup(); } catch (e) { msg = String((e as Error).message); }
ok(msg.includes('BACKUP_ENCRYPTION_KEY'), 'no backup without an encryption key (it would be a public plaintext file)');
delete process.env.VERCEL_ENV;
delete process.env.BLOB_READ_WRITE_TOKEN;
ok(!(await backup.backupStatus(NOW)).ok && (await backup.backupStatus(NOW)).stale, 'status is red when Blob is not connected');

// The cron route: closed without the secret, and a refused run is reported as an error, never a success.
const route = await import('../app/api/cron/backup/route');
const call = (auth?: string) => route.GET(new NextRequest('http://localhost/api/cron/backup', { headers: auth ? { authorization: auth } : {} }));
delete process.env.CRON_SECRET;
ok((await call('Bearer anything')).status === 401, 'route is closed when CRON_SECRET is unset');
process.env.CRON_SECRET = 'cron-secret-0123456789';
ok((await call()).status === 401, 'route refuses a call with no header');
ok((await call('Bearer wrong-secret-0123456789')).status === 401, 'route refuses a wrong secret');
ok((await call('cron-secret-0123456789')).status === 401, 'route needs the Bearer prefix');
const refused = await call('Bearer cron-secret-0123456789');
ok(refused.status === 500 && (await refused.json()).ok === false, 'a valid call outside production reports the refusal');

console.log('backup checks passed');
