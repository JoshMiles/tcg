import { NextResponse } from 'next/server';
import { getOverlaySettings } from '@/lib/overlay-settings';
import { DEFAULT_LAYOUT } from '@/lib/overlay-layout';

export const dynamic = 'force-dynamic';

// Public (like the rest of the overlay's endpoints): just how big/where to draw the overlay.
export async function GET() {
  const { layout } = await getOverlaySettings().catch(() => ({ layout: DEFAULT_LAYOUT }));
  return NextResponse.json({ layout }, { headers: { 'Cache-Control': 'no-store' } });
}
