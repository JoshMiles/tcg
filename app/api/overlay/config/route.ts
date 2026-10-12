import { NextResponse } from 'next/server';
import { getActiveSeason } from '@/lib/kv';
import { getOverlaySettings, getPackOverrides, getSeasonLookPreset } from '@/lib/overlay-settings';
import { DEFAULT_LAYOUT } from '@/lib/overlay-layout';
import { DEFAULT_PROPS } from '@/lib/overlay-props';

export const dynamic = 'force-dynamic';

// Public (like the rest of the overlay's endpoints): how to draw the overlay — its size/position, the look & animation
// properties (sparse; the widget fills in defaults) and any per-pack overrides keyed by pack id. A season's look (a preset
// attached to the active season) is layered over the global values; per-pack overrides still win over it.
export async function GET() {
  const [settings, packOverrides, season] = await Promise.all([
    getOverlaySettings().catch(() => ({ layout: DEFAULT_LAYOUT, props: {} })),
    getPackOverrides().catch(() => ({})),
    getActiveSeason().catch((): null => null),
  ]);
  const look = await getSeasonLookPreset(season?.id).catch((): null => null);
  return NextResponse.json(
    { layout: settings.layout, defaults: DEFAULT_PROPS, props: { ...settings.props, ...(look?.props ?? {}) }, packOverrides },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
