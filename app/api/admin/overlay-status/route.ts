import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { getOverlayStatus } from '@/lib/overlay';

export const dynamic = 'force-dynamic';

// Polled by the admin UI. (/api/admin/* isn't covered by the /admin middleware, so check explicitly.)
export async function GET() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json(await getOverlayStatus(), { headers: { 'Cache-Control': 'no-store' } });
}
