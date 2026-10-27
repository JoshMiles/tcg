import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { hasStaffCapability } from '@/lib/staff-guard';
import { getOverlayStatus } from '@/lib/overlay';
import { liveGate } from '@/lib/overlay-settings';

// Polled by the admin UI and the mod stream desk (read-only). (/api/admin/* isn't covered by the /admin middleware, so check explicitly.)
// `pullsBlocked` is the reason pack triggers are being dropped right now (the "only when live" switch), or null.
export async function GET() {
  if (!(await isAuthenticated()) && !(await hasStaffCapability('mod'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const [status, pullsBlocked] = await Promise.all([getOverlayStatus(), liveGate('pull')]);
  return NextResponse.json({ ...status, pullsBlocked }, { headers: { 'Cache-Control': 'no-store' } });
}
