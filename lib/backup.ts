// Nightly backup of the production keyspace (server side). Pure rules live in lib/backup-core.ts.
//
// Uses the raw `prodKv` on purpose: a backup is of PRODUCTION (never a sandbox's namespace), and refuses to run anywhere else.
// `collectEntries` / `restoreEntries` take a minimal client so they can run against the mock KV in scripts/check-backup.mts.

import { list, put, del } from '@vercel/blob';
import { inSandbox, prodKv } from './db';
import {
  BACKUP_KEEP, BACKUP_PREFIX, backupIsStale, backupName, encryptBackup, isBackedUp, pickBackupsToDelete, serializeBackup,
  type BackupEntry, type BackupFile, type BackupType,
} from './backup-core';

/** The few KV commands a backup needs. `prodKv` and the mock both satisfy it. */
export interface BackupClient {
  scan(cursor: string | number, opts: { match?: string; count?: number }): Promise<[string | number, string[]]>;
  type(key: string): Promise<string>;
  get(key: string): Promise<unknown>;
  hgetall(key: string): Promise<Record<string, unknown> | null>;
  lrange(key: string, start: number, end: number): Promise<unknown[]>;
  smembers(key: string): Promise<unknown[]>;
}
/** The few KV commands a restore needs. */
export interface RestoreClient {
  set(key: string, value: unknown): Promise<unknown>;
  hset(key: string, fields: Record<string, unknown>): Promise<unknown>;
  rpush(key: string, ...items: unknown[]): Promise<unknown>;
  sadd(key: string, ...members: unknown[]): Promise<unknown>;
  del(...keys: string[]): Promise<unknown>;
}

const SUPPORTED = new Set<string>(['string', 'hash', 'list', 'set']);
const CONCURRENCY = 25;

/** Every key that is worth keeping, with its type and value. `prefix` reads a sandbox namespace (`sbx:<id>:`) and returns the keys without it. Unsupported types are listed in `skipped`, never dropped silently. */
export async function collectEntries(client: BackupClient, now = Date.now(), prefix = ''): Promise<BackupFile> {
  const found = new Set<string>(); // SCAN may repeat a key
  let cursor: string | number = 0;
  do {
    const [next, batch] = await client.scan(cursor, { match: prefix + '*', count: 500 });
    for (const k of batch) if (k.startsWith(prefix) && isBackedUp(k.slice(prefix.length))) found.add(k);
    cursor = next;
  } while (String(cursor) !== '0');
  const keys = [...found].sort();

  const entries: BackupEntry[] = [];
  const skipped: { key: string; type: string }[] = [];
  for (let i = 0; i < keys.length; i += CONCURRENCY) {
    const part = await Promise.all(keys.slice(i, i + CONCURRENCY).map(async key => {
      const type = await client.type(key);
      if (type === 'none') return null; // expired between SCAN and now
      if (!SUPPORTED.has(type)) return { skip: { key, type } };
      const value = type === 'hash' ? await client.hgetall(key)
        : type === 'list' ? await client.lrange(key, 0, -1)
        : type === 'set' ? await client.smembers(key)
        : await client.get(key);
      return { entry: { key: key.slice(prefix.length), type: type as BackupType, value } as BackupEntry };
    }));
    for (const p of part) {
      if (p?.entry) entries.push(p.entry);
      else if (p?.skip) skipped.push(p.skip);
    }
  }
  return { version: 1, createdAt: now, entries, skipped };
}

/**
 * Writes entries into a target. `mapKey` renames each key (a sandbox restore prefixes `sbx:<id>:`); each key is deleted first so a
 * restore replaces rather than merges. Returns how many keys were written.
 */
export async function restoreEntries(client: RestoreClient, entries: BackupEntry[], mapKey: (key: string) => string = k => k): Promise<number> {
  let n = 0;
  for (const e of entries) {
    const key = mapKey(e.key);
    await client.del(key);
    if (e.type === 'string') await client.set(key, e.value);
    else if (e.type === 'hash') { const h = (e.value ?? {}) as Record<string, unknown>; if (Object.keys(h).length) await client.hset(key, h); }
    else if (e.type === 'list') { const l = (e.value ?? []) as unknown[]; if (l.length) await client.rpush(key, ...l); }
    else if (e.type === 'set') { const s = (e.value ?? []) as unknown[]; if (s.length) await client.sadd(key, ...s); }
    else continue;
    n++;
  }
  return n;
}

// ---- Blob ----

export interface StoredBackup { pathname: string; url: string; size: number; uploadedAt: number }

/** The stored backups, newest first. Throws when Blob is not connected. */
export async function listBackups(): Promise<StoredBackup[]> {
  const out: StoredBackup[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: BACKUP_PREFIX, cursor });
    for (const b of page.blobs) out.push({ pathname: b.pathname, url: b.url, size: b.size, uploadedAt: new Date(b.uploadedAt).getTime() });
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return out.sort((a, b) => b.uploadedAt - a.uploadedAt);
}

export interface BackupStatus { ok: boolean; lastAt: number | null; size: number | null; url: string | null; count: number; stale: boolean; problem?: string }

/** For the Settings page: when the newest backup was made, how big it is, and whether that is too long ago. Never throws. */
export async function backupStatus(now = Date.now()): Promise<BackupStatus> {
  const none = { lastAt: null, size: null, url: null, count: 0, stale: true };
  if (!process.env.BLOB_READ_WRITE_TOKEN) return { ok: false, ...none, problem: 'Blob storage is not connected, so backups cannot be stored.' };
  try {
    const all = await listBackups();
    const last = all[0] ?? null;
    const stale = backupIsStale(last?.uploadedAt ?? null, now);
    return { ok: !stale, lastAt: last?.uploadedAt ?? null, size: last?.size ?? null, url: last?.url ?? null, count: all.length, stale, ...(last ? {} : { problem: 'No backup has been made yet.' }) };
  } catch (e) {
    return { ok: false, ...none, problem: e instanceof Error ? e.message : 'Could not list backups.' };
  }
}

export interface BackupRun { name: string; keys: number; skipped: number; bytes: number; deleted: number }

/**
 * Takes a backup now: snapshot the production keyspace, encrypt it, store it as `backups/<date>.json.gz.enc` and delete anything
 * older than the newest 14. Refuses outside production and inside a sandbox, and refuses without an encryption key (a backup is
 * never stored in the clear: Blob files are public).
 */
export async function runBackup(now = Date.now()): Promise<BackupRun> {
  if (process.env.VERCEL_ENV !== 'production') throw new Error('Backups only run on the production deployment.');
  if (await inSandbox()) throw new Error('Backups never run inside a sandbox.');
  const secret = process.env.BACKUP_ENCRYPTION_KEY ?? '';
  if (secret.length < 16) throw new Error('BACKUP_ENCRYPTION_KEY is not set (at least 16 characters), so no backup was written.');
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error('Blob storage is not connected (BLOB_READ_WRITE_TOKEN).');

  const file = await collectEntries(prodKv as unknown as BackupClient, now);
  const body = encryptBackup(serializeBackup(file), secret);
  const name = backupName(now);

  // One file per day: a second run the same day replaces the first.
  const existing = (await listBackups()).filter(b => b.pathname === name);
  if (existing.length) await del(existing.map(b => b.url));
  await put(name, body, { access: 'public', addRandomSuffix: false, contentType: 'application/octet-stream' });

  const all = await listBackups();
  const old = new Set(pickBackupsToDelete(all.map(b => b.pathname), BACKUP_KEEP));
  const doomed = all.filter(b => old.has(b.pathname)).map(b => b.url);
  if (doomed.length) await del(doomed);
  return { name, keys: file.entries.length, skipped: file.skipped.length, bytes: body.length, deleted: doomed.length };
}
