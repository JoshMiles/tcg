import { NextRequest, NextResponse } from 'next/server';
import { inSandbox } from '@/lib/db';
import { cronAuthorised } from '@/lib/cron-auth';
import { pickOncePerWeek } from '@/lib/print-of-week-store';
import { digestOncePerWeek } from '@/lib/weekly-digest-store';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// GET /api/cron/weekly, called by Vercel Cron on Sundays at 20:00 UTC (vercel.json). Guarded like the backup route: Vercel sends
// `Authorization: Bearer ${CRON_SECRET}`; with CRON_SECRET unset (or short) the route refuses everyone. It does nothing outside
// production or inside a sandbox. Each step is once per ISO week and a failing step never stops the next one.

export async function GET(req: NextRequest) {
  if (!cronAuthorised(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (process.env.VERCEL_ENV !== 'production') return NextResponse.json({ ok: true, skipped: 'The weekly job only runs on the production deployment.' });
  if (await inSandbox()) return NextResponse.json({ ok: true, skipped: 'The weekly job never runs inside a sandbox.' });

  const started = Date.now();
  const steps: Record<string, unknown> = {};

  try { steps.printOfTheWeek = await pickOncePerWeek(); }
  catch (e) { steps.printOfTheWeek = { status: 'error', error: e instanceof Error ? e.message : 'Pick failed.' }; console.error('edition of the week failed:', e); }

  // The digest links to the print picked above, so it runs second.
  try { steps.digest = await digestOncePerWeek(); }
  catch (e) { steps.digest = { status: 'error', error: e instanceof Error ? e.message : 'Digest failed.' }; console.error('weekly digest failed:', e); }

  return NextResponse.json({ ok: true, ms: Date.now() - started, steps });
}
