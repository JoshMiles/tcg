import { NextRequest, NextResponse } from 'next/server';
import { getSeason } from '@/lib/kv';
import { isTracking, pageCopies } from '@/lib/serials';
import { isEscrow } from '@/lib/serials-core';
import { getHiddenUsers } from '@/lib/user-admin';
import { VARIANTS } from '@/lib/variants';
import type { Variant } from '@/lib/types';

export const dynamic = 'force-dynamic';

const SIZE = 15;

export interface DexCopyRow {
  id: string; n: number; est: boolean; at: number; origin: string;
  /** Who holds it now: a name, 'private', 'offer' (in a trade offer) or null when the copy no longer exists. */
  holder: string | null;
  /** For a copy that no longer exists: how it ended. */
  ended?: 'upgraded' | 'removed' | 'gone';
  pulledBy?: string;
}

// Public: one page of the copies of a card in one version, newest first (the same facts the copy pages show). Collectors an admin hid
// or who made their profile private are returned as `private`.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const seasonId = q.get('season') ?? '';
  const card = Number(q.get('card'));
  const variant = (q.get('variant') ?? 'regular') as Variant;
  const page = Math.max(0, Math.min(10_000, Number(q.get('page')) || 0));
  if (!seasonId || !Number.isInteger(card) || card < 1 || card >= 1_000_000 || !VARIANTS.includes(variant)) return NextResponse.json({ error: 'season, card and variant are required' }, { status: 400 });
  const season = await getSeason(seasonId).catch(() => null);
  if (!season || season.status === 'draft') return NextResponse.json({ error: 'No such season' }, { status: 404 });
  if (!(await isTracking(season.collectionName))) return NextResponse.json({ tracking: false, made: 0, size: SIZE, rows: [] });

  const [{ made, copies }, hidden] = await Promise.all([
    pageCopies(season.collectionName, card, variant, page, SIZE, q.get('order') === 'oldest'),
    getHiddenUsers().catch(() => new Set<string>()),
  ]);
  const priv = (u?: string) => !!u && !isEscrow(u) && hidden.has(u);
  const rows: DexCopyRow[] = copies.map(c => {
    const last = c.ev[c.ev.length - 1];
    const pulledBy = c.ev[0]?.who;
    return {
      id: c.id, n: c.n, est: !!c.est, at: c.at, origin: c.origin,
      holder: !c.owner ? null : isEscrow(c.owner) ? 'offer' : priv(c.owner) ? 'private' : c.owner,
      ...(!c.owner ? { ended: last?.type === 'upgraded' ? 'upgraded' as const : last?.type === 'removed' ? 'removed' as const : 'gone' as const } : {}),
      ...(pulledBy && c.origin === 'pull' ? { pulledBy: priv(pulledBy) ? 'private' : pulledBy } : {}),
    };
  });
  return NextResponse.json({ tracking: true, made, size: SIZE, rows }, { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=20, stale-while-revalidate=40' } });
}
