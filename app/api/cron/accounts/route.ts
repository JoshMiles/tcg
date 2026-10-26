import { NextRequest, NextResponse } from 'next/server';
import { cronAuthorised } from '@/lib/cron-auth';
import { runAccountCheck } from '@/lib/account-helix-check';

export const maxDuration = 300;

// GET /api/cron/accounts, called nightly by Vercel Cron (vercel.json), same CRON_SECRET guard as the other jobs. It asks Twitch for the current
// login of every known player and follows renames (lib/account-helix-check.ts). runAccountCheck itself refuses outside production and inside a sandbox.
export async function GET(req: NextRequest) {
  if (!cronAuthorised(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const run = await runAccountCheck();
    return NextResponse.json({ ok: !run.error, ...run });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Account check failed.';
    console.error('account check failed:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
