import { NextRequest, NextResponse } from 'next/server';
import { getSeason } from '@/lib/kv';
import { getCopy, isTracking, mintedCounts } from '@/lib/serials';
import { copyId } from '@/lib/serials-core';
import { getHiddenUsers } from '@/lib/user-admin';
import { VARIANTS, encodeEntry } from '@/lib/variants';

export const dynamic = 'force-dynamic';

// Public: the first copy ever made of each version of a card (who pulled it, when, who holds it now) and how many exist. This is the
// same history the copy pages show. Collectors an admin hid or who made their profile private are returned as `private`.
export async function GET(req: NextRequest) {
  const seasonId = req.nextUrl.searchParams.get('season') ?? '';
  const card = Number(req.nextUrl.searchParams.get('card'));
  if (!seasonId || !Number.isInteger(card) || card < 1 || card >= 1_000_000) return NextResponse.json({ error: 'season and card are required' }, { status: 400 });
  const season = await getSeason(seasonId).catch(() => null);
  if (!season || season.status === 'draft') return NextResponse.json({ error: 'No such season' }, { status: 404 });
  if (!(await isTracking(season.collectionName))) return NextResponse.json({ tracking: false, firsts: [] });

  const [made, hidden] = await Promise.all([mintedCounts(season.collectionName), getHiddenUsers().catch(() => new Set<string>())]);
  const firsts = await Promise.all(VARIANTS.map(async (variant, i) => {
    const total = made.get(encodeEntry(card, variant)) ?? 0;
    if (total === 0) return { variant, made: 0 };
    const first = await getCopy(season.collectionName, copyId(card, variant, 1));
    if (!first) return { variant, made: total };
    const pulledBy = first.ev[0]?.who;
    const priv = (u?: string) => !!u && !u.startsWith('escrow:') && hidden.has(u);
    return {
      variant, made: total, id: first.id, at: first.at, est: !!first.est, origin: first.origin,
      pulledBy: priv(pulledBy) ? 'private' : pulledBy,
      holder: !first.owner ? null : first.owner.startsWith('escrow:') ? 'offer' : priv(first.owner) ? 'private' : first.owner,
    };
  }));
  return NextResponse.json({ tracking: true, firsts }, { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=30, stale-while-revalidate=60' } });
}
