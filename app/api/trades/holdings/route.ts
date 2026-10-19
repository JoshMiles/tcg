import { siteClosedResponse } from '@/lib/access';
import { NextRequest, NextResponse } from 'next/server';
import { getStaff } from '@/lib/staff-guard';
import { getSession } from '@/lib/session';
import { getCollection, getSeason } from '@/lib/kv';
import { mayReadHoldings } from '@/lib/holdings-access';
import { decodeEntry } from '@/lib/variants';
import { loadSerialIndex } from '@/lib/serials';
import { poolOf } from '@/lib/serials-core';
import { getPrintPool } from '@/lib/trade-view';
import { getUserSettings } from '@/lib/user-settings-store';
import type { Variant } from '@/lib/types';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

// What a viewer owns in a season, as { cardNumber: { variant: copies } }, plus their Looking for list and print ids.
// The trade composer uses it to offer only cards the other person actually has. A private profile is visible only to
// that viewer and to staff. Everyone else must be signed in, same as the composer page.
export async function GET(req: NextRequest) {
  const closed = await siteClosedResponse();
  if (closed) return closed;
  const username = (req.nextUrl.searchParams.get('username') ?? '').toLowerCase().trim();
  const seasonId = req.nextUrl.searchParams.get('season') ?? '';
  if (!username || !seasonId) return NextResponse.json({ error: 'username and season are required' }, { status: 400, headers: NO_STORE });
  const season = await getSeason(seasonId);
  if (!season || season.status === 'draft') return NextResponse.json({ error: 'Season not found' }, { status: 404, headers: NO_STORE });
  let viewer: string | null = null;
  let staff = false;
  try {
    const [session, who] = await Promise.all([getSession(), getStaff()]);
    viewer = session?.username ?? null;
    staff = !!who;
  } catch { /* outside a request there is no caller */ }
  const privateProfile = (await getUserSettings(username)).privateProfile;
  if (!mayReadHoldings(username, viewer, { privateProfile, staff })) {
    const status = !viewer && !staff ? 401 : 404;
    const error = status === 401 ? 'Log in with Twitch first.' : 'This profile is private.';
    return NextResponse.json({ error }, { status, headers: NO_STORE });
  }
  const owned = (await getCollection(season.collectionName))[username];
  if (!owned) return NextResponse.json({ error: `Nobody called ${username} has played this season.` }, { status: 404, headers: NO_STORE });
  const holdings: Record<number, Partial<Record<Variant, number>>> = {};
  for (const entry of owned) {
    const { cardNumber, variant } = decodeEntry(entry);
    holdings[cardNumber] = { ...holdings[cardNumber], [variant]: (holdings[cardNumber]?.[variant] ?? 0) + 1 };
  }
  // Their Looking for list, so the composer may suggest cards they want. A private profile never reaches this line.
  const wanted = (await getUserSettings(username)).wanted;
  // The serial numbers they hold (the newest move first in a trade), so the composer can price the bonuses.
  const pool = poolOf((await loadSerialIndex(season.collectionName))?.held.get(username));
  // Their exact prints (id, edition, print number) by collection entry, so a direct offer can ask for one; {} while prints are not numbered.
  const prints = await getPrintPool(season, username);
  return NextResponse.json({ username, holdings, wanted, pool, prints }, { headers: NO_STORE });
}
