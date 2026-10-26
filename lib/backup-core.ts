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
