import { NextRequest, NextResponse } from 'next/server';
import { cleanQuery } from '@/lib/site-search';
import { searchPublic } from '@/lib/site-search-data';

export const dynamic = 'force-dynamic';

// GET /api/search?q=… : the public site's collector and card search. Only already-public information (collector names and card
// names); collectors an admin hid from the boards are left out. Pages are searched in the browser.
export async function GET(req: NextRequest) {
  const q = cleanQuery(req.nextUrl.searchParams.get('q') ?? '');
  if (!q) return NextResponse.json({ results: [] }, { headers: { 'Cache-Control': 'no-store' } });
  try {
    return NextResponse.json({ results: await searchPublic(q) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ results: [] }, { status: 200, headers: { 'Cache-Control': 'no-store' } }); // search is a convenience: never an error page
  }
}
