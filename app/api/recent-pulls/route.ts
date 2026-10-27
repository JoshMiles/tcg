import { NextResponse, connection } from 'next/server';
import { getActive, getSeasonOverview } from '@/lib/site-data';
import { recentPullItems } from '@/lib/home-pulls';
import { recordServerError } from '@/lib/error-spike';

// Public: the home page's recent pulls, polled while the tab is visible. The same data the home page shows (pulls are public on
// stream); collectors an admin hid are left out by getRecentPulls. A short shared cache keeps many open tabs to a few calls.
export async function GET() {
  await connection();
  try {
    const { season } = await getActive();
    if (!season) return NextResponse.json({ items: [] });
    const overview = await getSeasonOverview(season);
    const items = await recentPullItems(season, overview.cards, 8);
    return NextResponse.json({ items }, { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=15, stale-while-revalidate=30' } });
  } catch {
    recordServerError();
    return NextResponse.json({ items: [] }, { status: 503 });
  }
}
