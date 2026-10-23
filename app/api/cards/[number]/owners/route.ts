import { NextRequest, NextResponse } from 'next/server';
import { getActive, getSeasonOverview, ownersByCard } from '@/lib/site-data';
import { getCollectionCached } from '@/lib/leaderboard';
import { getHiddenUsers } from '@/lib/user-admin';
import { getAvatars, sizeTwitchAvatar } from '@/lib/avatars';

export const dynamic = 'force-dynamic';

// GET /api/cards/<number>/owners?season=<id> : the Card Dex dialog's Top collectors (10, with avatars). Public information the Dex page
// used to carry for every card; collectors an admin hid are left out by ownersByCard.
export async function GET(req: NextRequest, { params }: { params: Promise<{ number: string }> }) {
  const n = Number((await params).number);
  if (!Number.isInteger(n) || n < 1) return NextResponse.json({ error: 'Unknown card.' }, { status: 400 });
  try {
    const { season } = await getActive(req.nextUrl.searchParams.get('season') ?? undefined);
    if (!season) return NextResponse.json({ owners: [] });
    const overview = await getSeasonOverview(season);
    const top = ownersByCard(await getCollectionCached(season), overview.values, 10, await getHiddenUsers()).get(n)?.top ?? [];
    const avatars = await getAvatars(top.map(o => o.username));
    const owners = top.map(o => ({ ...o, avatar: avatars[o.username] ? sizeTwitchAvatar(avatars[o.username], 70) : undefined }));
    return NextResponse.json({ owners }, { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=15, stale-while-revalidate=30' } });
  } catch {
    return NextResponse.json({ error: 'Could not load collectors.' }, { status: 503 });
  }
}
