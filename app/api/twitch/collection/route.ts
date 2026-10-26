import { NextRequest, NextResponse } from 'next/server';
import { listSeasons, getCollection } from '@/lib/kv';
import { getSession } from '@/lib/session';
import { getHiddenUsers } from '@/lib/user-admin';
import { extensionViewer } from '@/lib/twitch-viewer';
import { limitTwitch } from '@/lib/rate-limit';

// Returns the viewer's owned card numbers across every published season.
// Shape allows the panel to show per-season indicators on cards.
// A private or admin-hidden profile gets its cards only when the caller is that viewer (extension token or website session); anyone else
// gets the same shape with no collections, so an old panel still loads.
export async function GET(req: NextRequest) {
  const limited = await limitTwitch(req);
  if (limited) return limited;
  const username = req.nextUrl.searchParams.get('username')?.toLowerCase().trim();
  if (!username) {
    return NextResponse.json({ error: 'username required' }, { status: 400 });
  }

  if ((await getHiddenUsers()).has(username)) {
    const ext = await extensionViewer(req);
    const session = await getSession().catch(() => null); // outside a request there is no caller
    if (!(('username' in ext && ext.username === username) || session?.username === username)) {
      return NextResponse.json({ username, collections: [] });
    }
  }

  const seasons = (await listSeasons()).filter(s => s.status !== 'draft');

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
