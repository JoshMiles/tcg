import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { inSandbox } from '@/lib/db';
import { pickOncePerWeek } from '@/lib/print-of-week-store';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// GET /api/cron/weekly, called by Vercel Cron on Sundays at 20:00 UTC (vercel.json). Guarded like the backup route: Vercel sends
// `Authorization: Bearer ${CRON_SECRET}`; with CRON_SECRET unset (or short) the route refuses everyone. It does nothing outside
// production or inside a sandbox. Each step is once per ISO week and a failing step never stops the next one.
function authorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET ?? '';
  if (secret.length < 16) return false;
  const given = Buffer.from(req.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${secret}`);
  return given.length === want.length && timingSafeEqual(given, want);
}

export async function GET(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (process.env.VERCEL_ENV !== 'production') return NextResponse.json({ ok: true, skipped: 'The weekly job only runs on the production deployment.' });
  if (await inSandbox()) return NextResponse.json({ ok: true, skipped: 'The weekly job never runs inside a sandbox.' });

  const started = Date.now();
  const steps: Record<string, unknown> = {};

  try { steps.printOfTheWeek = await pickOncePerWeek(); }
  catch (e) { steps.printOfTheWeek = { status: 'error', error: e instanceof Error ? e.message : 'Pick failed.' }; console.error('print of the week failed:', e); }

  // HOOK for ROADMAP 6.3 (weekly digest): run it here, after the print of the week is picked, once per ISO week
  // (`digest:week:<yyyy-ww>` NX), and put its outcome in `steps.digest`. The pick above is what the digest links to.

  return NextResponse.json({ ok: true, ms: Date.now() - started, steps });
}
