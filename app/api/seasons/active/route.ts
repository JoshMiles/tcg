import { NextResponse } from 'next/server';
import { getActiveSeasonWithPacks } from '@/lib/kv';
import { cardThumbUrl } from '@/lib/card-art';

export async function GET() {
  const result = await getActiveSeasonWithPacks();
  if (!result) return NextResponse.json({ error: 'No active season' }, { status: 404 });

  // Each card also gets `thumbUrl`, a tiny static first-frame image. The overlay uses it for the
  // collection grid so it never has to decode ~25 animated WebPs at once.
  return NextResponse.json({
    ...result,
    packs: result.packs.map(({ pack, cards }) => ({
      pack,
      cards: cards.map(c => ({
        ...c,
        thumbUrl: cardThumbUrl(c.imageUrl),
        ...(c.fullArtImageUrl && { fullArtThumbUrl: cardThumbUrl(c.fullArtImageUrl) }),
      })),
    })),
  });
}
