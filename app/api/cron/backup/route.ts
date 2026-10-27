import { NextRequest, NextResponse } from 'next/server';
import { cronAuthorised } from '@/lib/cron-auth';
import { runBackup } from '@/lib/backup';
import { snapshotActiveSeason } from '@/lib/score-day';
import { reportBackup, reportDataHealth } from '@/lib/system-notices';

export const maxDuration = 300;

// GET /api/cron/backup, called daily by Vercel Cron (vercel.json). Vercel sends `Authorization: Bearer ${CRON_SECRET}`; with
// CRON_SECRET unset (or short) the route refuses everyone. runBackup itself refuses outside production and inside a sandbox.

export async function GET(req: NextRequest) {
  if (!cronAuthorised(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const run = await runBackup();
    await reportBackup(run);
    await reportDataHealth();
    // Daily score snapshot for the home page's Rising this week. Only reached in production (runBackup refuses elsewhere); a failure never fails the backup.
    await snapshotActiveSeason().catch(e => console.error('score snapshot failed:', e instanceof Error ? e.message : e));
    return NextResponse.json({ ok: true, ...run });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Backup failed.';
    await reportBackup({ error: message });
    console.error('backup failed:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
