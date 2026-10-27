import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { paletteRecords } from '@/lib/palette-items';

// The command palette's searchable records: packs, seasons and viewers. (/api/admin/* isn't covered by the /admin middleware,
// so check explicitly.) Runs through `kv`, so inside a sandbox it lists the sandbox's records.
export async function GET() {
  if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(await paletteRecords(), { headers: { 'Cache-Control': 'no-store' } });
}
