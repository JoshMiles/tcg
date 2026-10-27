// Monthly restore drill (ROADMAP 51.14). READ-ONLY on purpose: it proves the newest backup can be restored by doing everything a restore
// does except the writes (find it, download it, decrypt it, parse it, compare it with the live keyspace), then posts the result to the
// Discord admin log. It never imports `restoreEntries`, and the only KV write is its own once-a-month lock key.

import { inSandbox, kv, prodKv } from './db';
import { postAdminDigest } from './discord';
import { listBackups, collectEntries, type BackupClient } from './backup';
import { decryptBackup, parseBackup, previewRestore, dayStamp, type BackupEntry, type RestorePreview } from './backup-core';

/** Below this share of the live key count the backup is suspiciously small: the drill still passes, with a warning. */
export const DRILL_MIN_KEY_SHARE = 0.9;
const MONTH_TTL_S = 21 * 24 * 3600;
const DAY_MS = 86_400_000;

export type DrillStatus = 'passed' | 'warning' | 'failed';
export interface DrillInput {
  now: number;
  backupAt: number | null;
  error?: string;
  backupKeys?: number;
  liveKeys?: number;
  preview?: Pick<RestorePreview, 'added' | 'replaced' | 'unchanged' | 'notInBackup' | 'byPrefix'>;
}

/** The pure result: a status and the message text. */
export function buildDrillReport(i: DrillInput): { status: DrillStatus; title: string; text: string } {
  const age = i.backupAt === null ? null : Math.max(0, Math.floor((i.now - i.backupAt) / DAY_MS));
  const when = i.backupAt === null ? 'no backup found' : `${dayStamp(i.backupAt)} (${age} day${age === 1 ? '' : 's'} old)`;
  if (i.error || !i.preview || i.backupKeys === undefined || i.liveKeys === undefined) {
    return { status: 'failed', title: 'Restore drill FAILED', text: `Backup: ${when}\nProblem: ${i.error ?? 'The drill did not finish.'}\nThe newest backup could not be restored. Fix this before the next backup rotates the last good one out.` };
  }
  const p = i.preview;
  const short = i.backupKeys < i.liveKeys * DRILL_MIN_KEY_SHARE;
  const top = Object.entries(p.byPrefix)
    .map(([prefix, c]) => ({ prefix, n: c.added + c.replaced + c.notInBackup }))
    .filter(x => x.n > 0).sort((a, b) => b.n - a.n || a.prefix.localeCompare(b.prefix)).slice(0, 5)
    .map(x => `${x.prefix} ${x.n}`).join(', ');
  const text = [
    `Backup: ${when}`,
    `Keys: ${i.backupKeys} in the backup, ${i.liveKeys} live`,
    `A restore would add ${p.added.length}, replace ${p.replaced.length}, leave ${p.unchanged} unchanged; ${p.notInBackup.length} live keys are not in the backup`,
    `Most changed prefixes: ${top || 'none'}`,
    short ? `Warning: the backup has fewer than ${Math.round(DRILL_MIN_KEY_SHARE * 100)}% of the live keys.` : 'Replaced keys are expected: data changed since the backup.',
    'Read-only: nothing was written.',
  ].join('\n');
  return { status: short ? 'warning' : 'passed', title: short ? 'Restore drill passed with a warning' : 'Restore drill PASSED', text };
}

export interface DrillDeps {
  newestBackup(): Promise<{ url: string; uploadedAt: number } | null>;
  download(url: string): Promise<Buffer>;
  live(): Promise<BackupEntry[]>;
}
const realDeps: DrillDeps = {
  newestBackup: async () => (await listBackups())[0] ?? null,
  download: async url => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Downloading the backup failed (${res.status}).`);
    return Buffer.from(await res.arrayBuffer());
  },
  live: async () => (await collectEntries(prodKv as unknown as BackupClient)).entries,
};

/** Does the drill and returns the report; never throws, never writes. */
export async function runRestoreDrill(now = Date.now(), deps: DrillDeps = realDeps) {
  let backupAt: number | null = null;
  try {
    const newest = await deps.newestBackup();
    if (!newest) throw new Error('No backup exists to restore.');
    backupAt = newest.uploadedAt;
    const secret = process.env.BACKUP_ENCRYPTION_KEY ?? '';
    if (secret.length < 16) throw new Error('BACKUP_ENCRYPTION_KEY is not set, so the backup cannot be decrypted.');
    const backup = parseBackup(decryptBackup(await deps.download(newest.url), secret));
    const live = await deps.live();
    return buildDrillReport({ now, backupAt, backupKeys: backup.entries.length, liveKeys: live.length, preview: previewRestore(backup.entries, live) });
  } catch (e) {
    return buildDrillReport({ now, backupAt, error: e instanceof Error ? e.message : 'The drill failed.' });
  }
}

export type DrillOutcome = { status: DrillStatus; month: string; channels: number } | { status: 'skipped' | 'already'; month: string };

/** The weekly cron's step: on the first Sunday of the month (UTC day 1 to 7), once per month, runs the drill and posts it to the admin log. */
export async function restoreDrillOncePerMonth(now = Date.now(), deps?: DrillDeps): Promise<DrillOutcome> {
  const month = new Date(now).toISOString().slice(0, 7);
  if (new Date(now).getUTCDate() > 7 || (await inSandbox())) return { status: 'skipped', month };
  if (!(await kv.set(`drill:month:${month}`, now, { nx: true, ex: MONTH_TTL_S }))) return { status: 'already', month };
  const r = await runRestoreDrill(now, deps);
  return { status: r.status, month, channels: await postAdminDigest(r.text, r.title) };
}
