import { NextResponse } from 'next/server';
import { getActiveSeasonWithPacks } from '@/lib/kv';

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
      cards: cards
        .sort((a, b) => a.number - b.number)
        .map(c => ({
          number: c.number,
          name: c.name,
          imageUrl: c.imageUrl,
          stars: c.stars,
        })),
    })),
  });
}
