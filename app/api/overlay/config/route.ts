import { NextRequest, NextResponse } from 'next/server';
import { getActiveSeason, getPacksForSeason } from '@/lib/kv';
import { cardBackFor } from '@/lib/card-back-store';
import { overlayBack, overlayFontCatalog, type OverlayBack } from '@/lib/card-back-overlay';
import { getOverlaySettings, getPackOverrides, getActiveScheduledLook, getPreset, getSeasonLookPreset } from '@/lib/overlay-settings';
import { DEFAULT_LAYOUT } from '@/lib/overlay-layout';
import { DEFAULT_PROPS, mergePropValues } from '@/lib/overlay-props';

export const dynamic = 'force-dynamic';

// Public (like the rest of the overlay's endpoints): how to draw the overlay. Its size/position, the look & animation
// properties (sparse; the widget fills in defaults) and any per-pack overrides keyed by pack id. A season's look (a preset
// attached to the active season) is layered over the global values; a scheduled look (active between its start and end) goes over that; per-pack overrides still win over both.
// `backs`: each pack's designed card back, laid out for the flip reveal's `design` option (ROADMAP 20.3c).
export async function GET(req: NextRequest) {
  const [settings, packOverrides, season] = await Promise.all([
    getOverlaySettings().catch(() => ({ layout: DEFAULT_LAYOUT, props: {} })),
    getPackOverrides().catch(() => ({})),
    getActiveSeason().catch((): null => null),
  ]);
  const look = await getSeasonLookPreset(season?.id).catch((): null => null);
  const scheduled = await getActiveScheduledLook().catch((): null => null);
  const backs: Record<string, OverlayBack> = {};
  if (season) {
    for (const pack of await getPacksForSeason(season).catch(() => [])) {
      try { backs[pack.id] = overlayBack(await cardBackFor(pack, season.name)); } catch { /* that pack keeps the cover */ }
    }
  }
  // ?preset=<id>: a scene. Its own layout (when it has one) replaces the global layout and its values go on top of the global look and
  // the season's look. An unknown id just means the global overlay.
  const scene = await getPreset(req.nextUrl.searchParams.get('preset')).catch((): null => null);
  return NextResponse.json(
    { layout: scene?.layout ?? settings.layout, defaults: DEFAULT_PROPS, props: mergePropValues(settings.props, look?.props, scheduled?.preset?.props, scene?.props), packOverrides, backs, fonts: overlayFontCatalog() },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
