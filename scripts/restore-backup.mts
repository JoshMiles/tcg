// Restores a nightly backup (lib/backup.ts) into a KV store. Safe by default: the keys go into a SANDBOX namespace
// (sbx:<id>:*) and the sandbox is registered, so you can open it in Admin > Sandbox and look before anything real is touched.
//
//   BACKUP_ENCRYPTION_KEY=... KV_REST_API_URL=... KV_REST_API_TOKEN=... \
//     npx tsx scripts/restore-backup.mts <backup file> [--sandbox <id>] [--dry-run]
//   and to put the keys back where they were (overwrites live data, key by key):
//     npx tsx scripts/restore-backup.mts <backup file> --raw --i-mean-production
//
// Get the file by opening the backup's Blob URL (Settings > Environment shows the newest) and saving it. KV_* point at the
// target store; for a sandbox restore into production that is the production store, and nothing outside sbx:<id>: is written.

import { readFileSync } from 'node:fs';
import { decryptBackup, describeBackup, parseBackup } from '../lib/backup-core';

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(n);
const opt = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const file = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--sandbox');
if (!file) throw new Error('Usage: restore-backup.mts <backup file> [--sandbox <id>] [--dry-run] | --raw --i-mean-production');

if (flag('--dry-run') || flag('--dry')) console.log('DRY RUN: nothing will be written.');
const secret = process.env.BACKUP_ENCRYPTION_KEY ?? '';
const backup = parseBackup(decryptBackup(readFileSync(file), secret));
console.log(`Backup from ${new Date(backup.createdAt).toISOString()}: ${describeBackup(backup)}`);

const raw = flag('--raw');
if (raw && !flag('--i-mean-production')) throw new Error('--raw writes over the original keys. Add --i-mean-production if that is what you want.');
const id = (opt('--sandbox') ?? `restore-${new Date(backup.createdAt).toISOString().slice(0, 10)}`).toLowerCase();
if (!raw && !/^[a-z0-9][a-z0-9-]{1,22}[a-z0-9]$/.test(id)) throw new Error(`"${id}" is not a valid sandbox id.`);
if (!raw && id === 'preview') throw new Error('"preview" is reserved.');
if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) throw new Error('Set KV_REST_API_URL and KV_REST_API_TOKEN for the target store.');

const { kv } = await import('@vercel/kv');
if (flag('--dry-run') || flag('--dry')) {
  // Preview only: reads the target, never writes. The restore code is in the else branch and is not even imported here.
  const { collectEntries } = await import('../lib/backup');
  const { previewRestore } = await import('../lib/backup-core');
  const current = await collectEntries(kv as unknown as Parameters<typeof collectEntries>[0], Date.now(), raw ? '' : `sbx:${id}:`);
  const p = previewRestore(backup.entries, current.entries);
  const list = (title: string, keys: string[]) => {
    console.log(`${title}: ${keys.length}`);
    for (const k of keys.slice(0, 20)) console.log(`  ${k}`);
    if (keys.length > 20) console.log(`  ... and ${keys.length - 20} more`);
  };
  console.log(`Would add ${p.added.length}, replace ${p.replaced.length}, leave ${p.unchanged} unchanged; ${p.notInBackup.length} at the target are not in the backup (left as they are).`);
  console.log('By prefix (added / replaced / unchanged / not in backup):');
  for (const [prefix, c] of Object.entries(p.byPrefix).sort()) console.log(`  ${prefix.padEnd(16)} ${c.added} / ${c.replaced} / ${c.unchanged} / ${c.notInBackup}`);
  list('Added (missing at the target)', p.added);
  list('Replaced (different value)', p.replaced);
  list('Not in backup (left as they are)', p.notInBackup);
} else {
  const { restoreEntries } = await import('../lib/backup');
  const target = kv as unknown as Parameters<typeof restoreEntries>[0];
  const n = await restoreEntries(target, backup.entries, raw ? (k: string) => k : (k: string) => `sbx:${id}:${k}`);

  if (!raw) {
    const registry = (await kv.get<{ id: string }[]>('sandbox:registry')) ?? [];
    if (!registry.some(s => s.id === id)) {
      await kv.set('sandbox:registry', [...registry, { id, name: `Restore ${id.replace(/^restore-/, '')}`, createdAt: Date.now(), lastUsedAt: Date.now(), source: 'empty' }]);
    }
    console.log(`Restored ${n} keys into sandbox "${id}". Open Admin > Sandbox and enter it to inspect.`);
  } else {
    console.log(`Restored ${n} keys over the original keys.`);
  }
}
