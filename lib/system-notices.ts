import { kv } from './db';
import { notifySystem, escapeMd } from './discord';
import { formatBytes, loadDataHealth, sizeAttention, type HealthLevel } from './data-health';
import type { BackupRun } from './backup';

// The "System" Discord notices that come from the nightly job and the manual backup: the backup result and the data-health warning.
// (Sandboxes and the live status post from where they happen.) Everything here swallows its own errors.

/** A backup finished (a run) or failed (an error message). */
export async function reportBackup(result: BackupRun | { error: string }): Promise<void> {
  try {
    if ('error' in result) {
      await notifySystem({ title: '⚠️ Backup failed', text: escapeMd(result.error).slice(0, 400), tone: 'bad' });
    } else {
      await notifySystem({
        title: '💾 Backup saved', tone: 'good',
        fields: [
          { name: 'Size', value: formatBytes(result.bytes), inline: true },
          { name: 'Keys', value: String(result.keys), inline: true },
          ...(result.skipped ? [{ name: 'Skipped', value: String(result.skipped), inline: true }] : []),
        ],
      });
    }
  } catch { /* best effort */ }
}

const RANK: Record<HealthLevel, number> = { ok: 0, warn: 1, high: 2 };
const KEY = 'discord:health:level';

/** Posts when a season's collection data gets bigger than it was at the last look (ok to warn, warn to high). Once per crossing, not daily. */
export async function reportDataHealth(): Promise<void> {
  try {
    const health = await loadDataHealth();
    const worst = health.seasons.reduce<HealthLevel>((w, s) => (RANK[s.level] > RANK[w] ? s.level : w), 'ok');
    const last = ((await kv.get<HealthLevel>(KEY)) ?? 'ok') as HealthLevel;
    await kv.set(KEY, worst);
    if (RANK[worst] <= RANK[last]) return;
    const lines = health.seasons.flatMap(s => { const a = sizeAttention(s.name, s.collection.bytes); return a ? [a.text] : []; });
    await notifySystem({ title: worst === 'high' ? '🚨 Data health: large' : '📈 Data health: growing', text: lines.join('\n'), tone: 'bad' });
  } catch { /* best effort */ }
}
