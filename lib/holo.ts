import type { Pack } from './types';
import { effectiveProps, type PropValues } from './overlay-props';
import { getOverlaySettings, getPackOverrides } from './overlay-settings';
import { buildHoloSpecs, type HoloSpecs } from './holo-core';

export * from './holo-core';

// Server side of the shimmer: reads the Overlay Editor's saved settings (global + per-pack overrides) and resolves them per card.
// Client components import the types and helpers from './holo-core' (no database access).

/**
 * One lookup of the overlay settings, then a function that gives any card's shimmer specs: the global values with that
 * pack's overrides on top. Call once per request and reuse.
 */
export async function getHoloResolver(): Promise<(pack: Pick<Pack, 'id' | 'holoMinStars'>, stars: number) => HoloSpecs> {
  const [settings, overrides] = await Promise.all([getOverlaySettings().catch(() => null), getPackOverrides().catch((): Record<string, PropValues> => ({}))]);
  const cache = new Map<string, PropValues>();
  return (pack, stars) => {
    let props = cache.get(pack.id);
    if (!props) { props = effectiveProps(settings?.props, overrides[pack.id]); cache.set(pack.id, props); }
    return buildHoloSpecs(props, stars, pack.holoMinStars);
  };
}
