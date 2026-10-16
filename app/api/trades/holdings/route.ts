import { NextRequest, NextResponse } from 'next/server';
import { getCollection, getSeason } from '@/lib/kv';
import { decodeEntry } from '@/lib/variants';
import { loadSerialIndex } from '@/lib/serials';
import { poolOf } from '@/lib/serials-core';
import { getPrintPool } from '@/lib/trade-view';
import { getUserSettings } from '@/lib/user-settings-store';
import type { Variant } from '@/lib/types';

export const dynamic = 'force-dynamic';

// What a viewer owns in a season, as { cardNumber: { variant: copies } }. This is the same information the public collection
// page already shows; the trade composer uses it to offer only cards the other person actually has.
export async function GET(req: NextRequest) {
  const username = (req.nextUrl.searchParams.get('username') ?? '').toLowerCase().trim();
  const seasonId = req.nextUrl.searchParams.get('season') ?? '';
  if (!username || !seasonId) return NextResponse.json({ error: 'username and season are required' }, { status: 400 });
  const season = await getSeason(seasonId);
  if (!season || season.status === 'draft') return NextResponse.json({ error: 'Season not found' }, { status: 404 });
  const owned = (await getCollection(season.collectionName))[username];
  if (!owned) return NextResponse.json({ error: `Nobody called ${username} has played this season.` }, { status: 404 });
  const holdings: Record<number, Partial<Record<Variant, number>>> = {};
  for (const entry of owned) {
    const { cardNumber, variant } = decodeEntry(entry);
    holdings[cardNumber] = { ...holdings[cardNumber], [variant]: (holdings[cardNumber]?.[variant] ?? 0) + 1 };
  }
  // Their Looking for list is public on their profile, so the composer may suggest cards they want.
  const wanted = (await getUserSettings(username)).wanted;
  // The serial numbers they hold (the newest move first in a trade), so the composer can price the bonuses.
  const pool = poolOf((await loadSerialIndex(season.collectionName))?.held.get(username));
  // Their exact prints (id, edition, print number) by collection entry, so a direct offer can ask for one; {} while prints are not numbered.
  const prints = await getPrintPool(season, username);
  return NextResponse.json({ username, holdings, wanted, pool, prints });
}
