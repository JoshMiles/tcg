import { NextRequest, NextResponse } from 'next/server';
import { listSeasons, getCollection } from '@/lib/kv';

export const dynamic = 'force-dynamic';

// Returns the viewer's owned card numbers across every season.
// Shape allows the panel to show per-season indicators on cards.
export async function GET(req: NextRequest) {
  const username = req.nextUrl.searchParams.get('username')?.toLowerCase().trim();
  if (!username) {
    return NextResponse.json({ error: 'username required' }, { status: 400 });
  }

  const seasons = await listSeasons();

  const collections = await Promise.all(
    seasons.map(async s => {
      const col = await getCollection(s.collectionName);
      return {
        seasonId: s.id,
        seasonName: s.name,
        active: s.active,
        ownedNumbers: col[username] ?? [],
      };
    })
  );

  // Only return seasons where the user actually has cards (or the active season)
  const filtered = collections.filter(c => c.active || c.ownedNumbers.length > 0);

  return NextResponse.json({ username, collections: filtered });
}
