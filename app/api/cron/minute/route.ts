import { NextRequest, NextResponse } from 'next/server';
import { inSandbox } from '@/lib/db';
import { cronAuthorised } from '@/lib/cron-auth';
import { getLiveStatus } from '@/lib/twitch-live';
import { sweepTrades } from '@/lib/trades';
import { flushDueEmails } from '@/lib/email';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// GET /api/cron/minute, called by Vercel Cron every minute (vercel.json), same CRON_SECRET guard as the other jobs. It keeps the live
// status fresh with nobody on the site (so went-live / went-offline notices and the stream recap still fire) and refunds expired
// trades and sends notification emails the 15 minute window held back. Production only, never in a sandbox; a failing step never stops the next.
export async function GET(req: NextRequest) {
  if (!cronAuthorised(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (process.env.VERCEL_ENV !== 'production') return NextResponse.json({ ok: true, skipped: 'The minute job only runs on the production deployment.' });
  if (await inSandbox()) return NextResponse.json({ ok: true, skipped: 'The minute job never runs inside a sandbox.' });

  const steps: Record<string, unknown> = {};
  try { steps.live = (await getLiveStatus())?.live ?? null; }
  catch (e) { steps.live = { error: e instanceof Error ? e.message : 'Live check failed.' }; }
  try { steps.tradesExpired = await sweepTrades(); }
  catch (e) { steps.tradesExpired = { error: e instanceof Error ? e.message : 'Trade sweep failed.' }; }
  try { steps.emailsSent = await flushDueEmails(); }
  catch (e) { steps.emailsSent = { error: e instanceof Error ? e.message : 'Email flush failed.' }; }
  return NextResponse.json({ ok: true, steps });
}
