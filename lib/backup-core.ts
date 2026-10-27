// Pure parts of the nightly backup (no KV, no Blob): which keys are worth keeping, the file name and retention rules, and the
// encrypted file format. The server side is lib/backup.ts.
//
// A backup is a gzipped JSON snapshot of the production keyspace, ENCRYPTED before it leaves the server. Vercel Blob (the
// version this project uses) only stores public files, and a backup holds Twitch IDs, usernames and the webhook secrets, so a
// plaintext file at a guessable address would be a leak. The key is BACKUP_ENCRYPTION_KEY; without it no backup is written.

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';

export type BackupType = 'string' | 'hash' | 'list' | 'set';
export interface BackupEntry { key: string; type: BackupType; value: unknown }
export interface BackupFile { version: 1; createdAt: number; entries: BackupEntry[]; skipped: { key: string; type: string }[] }

/**
 * Keys that are NOT backed up: sandboxes (test data), counters and caches that rebuild themselves, locks, cooldowns, queues,
 * per-viewer restore points (they are backups already, 14-day TTL) and the sandbox bookkeeping. This is a deny-list on purpose:
 * a key nobody thought about is backed up by default.
 */
export const DENY_PREFIXES = [
  'sbx:',           // sandboxes and the preview namespace
  'sandbox:',       // sandbox registry / activity / undo points
  'stats:',         // time-series counters (rebuild from now on, not from history)
  'twitch:',        // Helix caches: live status, avatars
  'activity:',      // the live activity log and its sequence counter
  'lock:',          // short-lived locks
  'potw:week:',     // the edition of the week's once-a-week lock
  'drill:month:',   // the restore drill's once-a-month lock
  'captcha:',       // short-lived pass tokens
  'showoff:cd:',    // cooldowns
  'trade:cd:',
  'webhooks:queue', // pending overlay events
  'overlay:clients', 'overlay:reload',
  'watch:idx:',     // rebuilt on first use from the viewers who have played
] as const;

/** Per-viewer restore points: `user:<name>:snap:<id>` and the `user:<name>:snaps` index. */
const SNAPSHOT_KEY = /^user:[^:]+:snaps?(:|$)/;

/** The old collection string kept after the move to hashes (`tcg_<name>:old`) and a hash being built (`coll:<name>:new`): copies, not data. */
const COLLECTION_SPARE = /^(tcg_.+:old|coll:.+:new)$/;

export function isBackedUp(key: string): boolean {
  if (DENY_PREFIXES.some(p => key.startsWith(p)) || COLLECTION_SPARE.test(key)) return false;
  return !SNAPSHOT_KEY.test(key);
}

// ---- file names and retention ----

export const BACKUP_PREFIX = 'backups/';
export const BACKUP_KEEP = 14;
export const BACKUP_STALE_HOURS = 36;
const NAME_RE = /^backups\/(\d{4}-\d{2}-\d{2})\.json\.gz\.enc$/;

export const dayStamp = (at: number) => new Date(at).toISOString().slice(0, 10);
export const backupName = (at: number) => `${BACKUP_PREFIX}${dayStamp(at)}.json.gz.enc`;

/** Which stored file names to delete so only the newest `keep` backups remain. Anything not named like a backup is never returned. */
export function pickBackupsToDelete(pathnames: string[], keep = BACKUP_KEEP): string[] {
  const dated = pathnames.map(p => ({ p, m: NAME_RE.exec(p) })).filter((x): x is { p: string; m: RegExpExecArray } => !!x.m);
  dated.sort((a, b) => (a.m[1] < b.m[1] ? 1 : a.m[1] > b.m[1] ? -1 : 0)); // newest first
  return dated.slice(keep).map(x => x.p);
}

/** True when the newest backup is missing or older than the allowed gap. */
export function backupIsStale(lastAt: number | null, now: number, hours = BACKUP_STALE_HOURS): boolean {
  return lastAt === null || now - lastAt > hours * 3_600_000;
}

// ---- format ----

const MAGIC = Buffer.from('TCGBK1');
const SALT = 16, IV = 12, TAG = 16;

export function serializeBackup(file: BackupFile): Buffer {
  return gzipSync(Buffer.from(JSON.stringify(file), 'utf8'));
}

export function parseBackup(gz: Buffer): BackupFile {
  const f = JSON.parse(gunzipSync(gz).toString('utf8')) as BackupFile;
  if (f?.version !== 1 || !Array.isArray(f.entries)) throw new Error('Not a backup file this version understands.');
  return f;
}

const deriveKey = (secret: string, salt: Buffer) => scryptSync(secret, salt, 32);

/** AES-256-GCM, key derived from the secret with a fresh salt: MAGIC | salt | iv | ciphertext | tag. */
export function encryptBackup(plain: Buffer, secret: string): Buffer {
  if (!secret || secret.length < 16) throw new Error('BACKUP_ENCRYPTION_KEY must be at least 16 characters.');
  const salt = randomBytes(SALT), iv = randomBytes(IV);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret, salt), iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, body, cipher.getAuthTag()]);
}

export function decryptBackup(blob: Buffer, secret: string): Buffer {
  if (blob.length < MAGIC.length + SALT + IV + TAG || !blob.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Not an encrypted backup file.');
  let o = MAGIC.length;
  const salt = blob.subarray(o, (o += SALT)), iv = blob.subarray(o, (o += IV));
  const tag = blob.subarray(blob.length - TAG), body = blob.subarray(o, blob.length - TAG);
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(secret, salt), iv);
  decipher.setAuthTag(tag);
  try { return Buffer.concat([decipher.update(body), decipher.final()]); }
  catch { throw new Error('Could not decrypt: wrong BACKUP_ENCRYPTION_KEY, or the file is damaged.'); }
}

/** A readable one-line summary of what a backup holds. */
export function describeBackup(f: BackupFile): string {
  const by: Record<string, number> = {};
  for (const e of f.entries) by[e.type] = (by[e.type] ?? 0) + 1;
  const parts = Object.entries(by).map(([t, n]) => `${n} ${t}`).join(', ');
  return `${f.entries.length} keys (${parts || 'none'})${f.skipped.length ? `, ${f.skipped.length} skipped` : ''}`;
}

// ---- restore preview (dry run) ----

export interface PrefixCount { added: number; replaced: number; unchanged: number; notInBackup: number }
export interface RestorePreview { added: string[]; replaced: string[]; unchanged: number; notInBackup: string[]; byPrefix: Record<string, PrefixCount> }

const sortKeys = (_: string, x: unknown) => x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x;
const canon = (v: unknown) => JSON.stringify(v, sortKeys);
/** Same type and same content; hash field order and set member order do not matter, list order does. */
const sameEntry = (a: BackupEntry, b: BackupEntry) =>
  a.type === b.type && (a.type === 'set'
    ? canon(((a.value ?? []) as unknown[]).map(canon).sort()) === canon(((b.value ?? []) as unknown[]).map(canon).sort())
    : canon(a.value ?? null) === canon(b.value ?? null));

/**
 * What restoring `backup` onto a target that currently holds `current` (both with the same key names, current already limited to
 * the backed-up keyspace) would do: keys added, keys replaced with different content, keys already identical, and keys at the
 * target that the backup does not have (a restore leaves those alone). Writes nothing; pure.
 */
export function previewRestore(backup: BackupEntry[], current: BackupEntry[]): RestorePreview {
  const now = new Map(current.map(e => [e.key, e]));
  const inBackup = new Set(backup.map(e => e.key));
  const out: RestorePreview = { added: [], replaced: [], unchanged: 0, notInBackup: [], byPrefix: {} };
  const bucket = (key: string) => (out.byPrefix[key.includes(':') ? key.slice(0, key.indexOf(':') + 1) : key] ??= { added: 0, replaced: 0, unchanged: 0, notInBackup: 0 });
  for (const e of backup) {
    const cur = now.get(e.key);
    if (!cur) { out.added.push(e.key); bucket(e.key).added++; }
    else if (!sameEntry(e, cur)) { out.replaced.push(e.key); bucket(e.key).replaced++; }
    else { out.unchanged++; bucket(e.key).unchanged++; }
  }
  for (const e of current) if (!inBackup.has(e.key)) { out.notInBackup.push(e.key); bucket(e.key).notInBackup++; }
  return out;
}