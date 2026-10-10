import { NextResponse } from 'next/server';
import { getActiveSeasonWithPacks } from '@/lib/kv';
import { cardThumbUrl } from '@/lib/card-art';

export const dynamic = 'force-dynamic';

export async function GET() {
  const result = await getActiveSeasonWithPacks();
  if (!result) {
    return NextResponse.json({ error: 'No active season' }, { status: 404 });
  }

  const { season, packs } = result;

  return NextResponse.json({
    seasonId: season.id,
    seasonName: season.name,
    collectionName: season.collectionName,
    packs: packs.map(({ pack, cards }) => ({
      packId: pack.id,
      packName: pack.name,
      accentColor: pack.accentColor,
      coverImageUrl: pack.coverImageUrl,
      upgradesEnabled: pack.upgradesEnabled,
      upgradeCosts: pack.upgradeCosts,
      cards: cards
        .sort((a, b) => a.number - b.number)
        .map(c => ({
          number: c.number,
          name: c.name,
          imageUrl: c.imageUrl,
          // Static first-frame thumbnail; the panel only loads the animated imageUrl on hover.
          thumbUrl: cardThumbUrl(c.imageUrl),
          stars: c.stars,
          upgradesEnabled: pack.upgradesEnabled && c.upgradesEnabled !== false,
          ...(c.fullArtImageUrl && {
            fullArtImageUrl: c.fullArtImageUrl,
            fullArtThumbUrl: cardThumbUrl(c.fullArtImageUrl),
          }),
        })),
    })),
  });
}
