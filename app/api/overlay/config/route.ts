import { NextResponse } from 'next/server';
import { getOverlaySettings, getPackOverrides } from '@/lib/overlay-settings';
import { DEFAULT_LAYOUT } from '@/lib/overlay-layout';
import { DEFAULT_PROPS } from '@/lib/overlay-props';

export const dynamic = 'force-dynamic';

// Public (like the rest of the overlay's endpoints): how to draw the overlay — its size/position, the look & animation
// properties (sparse; the widget fills in defaults) and any per-pack overrides keyed by pack id.
export async function GET() {
  const [settings, packOverrides] = await Promise.all([
    getOverlaySettings().catch(() => ({ layout: DEFAULT_LAYOUT, props: {} })),
    getPackOverrides().catch(() => ({})),
  ]);
  return NextResponse.json(
    { layout: settings.layout, defaults: DEFAULT_PROPS, props: settings.props, packOverrides },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
