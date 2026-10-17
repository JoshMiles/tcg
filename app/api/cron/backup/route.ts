import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { runBackup } from '@/lib/backup';
import { flushDueEmails } from '@/lib/email';
import { reportBackup, reportDataHealth } from '@/lib/system-notices';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// GET /api/cron/backup, called daily by Vercel Cron (vercel.json). Vercel sends `Authorization: Bearer ${CRON_SECRET}`; with
// CRON_SECRET unset (or short) the route refuses everyone. runBackup itself refuses outside production and inside a sandbox.
function authorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET ?? '';
  if (secret.length < 16) return false;
  const given = Buffer.from(req.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${secret}`);
  return given.length === want.length && timingSafeEqual(given, want);
}

export async function GET(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    await flushDueEmails().catch(() => 0); // emails the 15 minute window held back
    const run = await runBackup();
    await reportBackup(run);
    await reportDataHealth();
    return NextResponse.json({ ok: true, ...run });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Backup failed.';
    await reportBackup({ error: message });
    console.error('backup failed:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
