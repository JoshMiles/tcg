// Brie Bucks backups and the ledger of adjusts (ROADMAP 55.10). Plain files, no Electron: main.ts gives it the folders.
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { MixItUpUser } from './mixitup';

export const BACKUPS_KEPT = 30;
export const LEDGER_MAX = 2000;

/** One deduct or add this app was asked for. `amount` is signed (a deduct is negative), `at` is when the site queued the job, `answer` is 'ok' or what Mix It Up said. */
export interface LedgerRow { id: string; user: string; amount: number; at: number; answer: string }

/** Every adjust the app made, newest last, kept in a file so a restart loses nothing. */
export class Ledger {
  private rows: LedgerRow[] = [];
  constructor(private file: string) {
    try {
      const raw = JSON.parse(readFileSync(file, 'utf8')) as unknown;
      if (Array.isArray(raw)) this.rows = raw.filter((r): r is LedgerRow => !!r && typeof r.id === 'string' && typeof r.amount === 'number').slice(-LEDGER_MAX);
    } catch { /* no file yet */ }
  }

  add(row: LedgerRow): void {
    this.rows = [...this.rows, row].slice(-LEDGER_MAX);
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      writeFileSync(this.file + '.tmp', JSON.stringify(this.rows));
      renameSync(this.file + '.tmp', this.file);
    } catch { /* the ledger in memory still serves this run */ }
  }

  all(): LedgerRow[] { return [...this.rows]; }
}

const cell = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** The CSV of every viewer who owns some of the currency. */
export function csvOf(users: MixItUpUser[], currencyId: string): string {
  const rows = users.flatMap(u => {
    const a = u.amounts.find(x => x.id.toLowerCase() === currencyId.toLowerCase());
    return a && a.amount > 0 ? [`${cell(u.username)},${cell(u.twitchId)},${a.amount}`] : [];
  });
  return ['username,twitch_id,amount', ...rows].join('\r\n') + '\r\n';
}

/** Saves a backup in `dir` and deletes the oldest beyond the newest 30 (the names sort by time). Returns the file name. */
export function writeBackup(dir: string, phase: string, csv: string, now = Date.now()): string {
  mkdirSync(dir, { recursive: true });
  const name = `brie-bucks-${new Date(now).toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-')}-${phase === 'end' ? 'end' : 'start'}.csv`;
  writeFileSync(join(dir, name), csv);
  const all = readdirSync(dir).filter(f => /^brie-bucks-.+\.csv$/.test(f)).sort();
  for (const f of all.slice(0, Math.max(0, all.length - BACKUPS_KEPT))) rmSync(join(dir, f), { force: true });
  return name;
}
