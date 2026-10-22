import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { getActiveSeasonWithPacks } from '@/lib/kv';
import { getSavedSwatches, saveSwatches, toHex } from '@/lib/swatches';

export const dynamic = 'force-dynamic';

// The colour fields' swatches: the active packs' accents, the site theme (globals.css) and the staff-wide saved list.
// (/api/admin/* isn't covered by the /admin middleware, so check explicitly.)
const THEME = ['#ffcb05', '#3b4cca', '#6b7cff', '#0a0f21', '#141b36', '#1f2848', '#e6eafb'];

export async function GET() {
  if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const [active, saved] = await Promise.all([getActiveSeasonWithPacks().catch(() => null), getSavedSwatches()]);
  const packs = [...new Set((active?.packs ?? []).map(p => toHex(p.pack.accentColor ?? '')).filter((c): c is string => !!c))];
  return NextResponse.json({ packs, theme: THEME, saved }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  if (!(await isAuthenticated())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => null);
  return NextResponse.json({ saved: await saveSwatches(body?.saved) });
}
