import type { Variant } from './types';
import { VARIANTS } from './variants';
import { effectiveProps, type PropValue, type PropValues } from './overlay-props';

// The holographic shimmer shown on cards on the website and in the Twitch panel, driven by the SAME per-variant settings the
// admin sets in the Overlay Editor (Variants -> a variant -> Holographic shimmer): on / off / auto, colours, strength,
// sweep time, angle, blend and loop. The overlay builds its shimmer in public/widget.js (applyLook); this mirrors it so a
// card looks the same wherever it is shown. Geometry (kept identical): an 8-slot gradient tile 5 card-widths wide and tall
// that slides 8 card-widths in one sweep; a looping sweep slides exactly one tile.

/** What a client needs to draw one variant's shimmer on one card. `style` holds CSS custom properties to set on the art. */
export interface HoloSpec {
  on: boolean;
  style: Record<string, string>;
}
export type HoloSpecs = Record<Variant, HoloSpec>;

const NONE: HoloSpec = { on: false, style: {} };
export const NO_HOLO: HoloSpecs = { regular: NONE, reverse: NONE, full: NONE, shiny: NONE };

/** The overlay's gradient: 8 colour bands (cycling through the palette) separated by transparent gaps. */
export function holoGradient(colors: string[], angle: number): string {
  const palette = colors.length ? colors : ['#fffee3'];
  const stops: string[] = [];
  for (let i = 0; i < 8; i++) stops.push('#ffffff00', palette[i % palette.length]);
  stops.push('#ffffff00');
  return `linear-gradient(${angle}deg, ${stops.join(', ')})`;
}

/** Builds the shimmer for each variant of a card, from the effective overlay properties. */
export function buildHoloSpecs(props: PropValues, stars: number, holoMinStars: number): HoloSpecs {
  const out = { ...NO_HOLO } as HoloSpecs;
  for (const v of VARIANTS) {
    const g = (name: string): PropValue | undefined => props[`variant.${v}.${name}`];
    const mode = String(g('holoMode'));
    const on = mode === 'on' || (mode === 'auto' && stars >= holoMinStars);
    if (!on) { out[v] = NONE; continue; }
    const loop = g('holoLoop') === true;
    out[v] = {
      on: true,
      style: {
        '--holo-gradient': holoGradient(Array.isArray(g('holoColors')) ? (g('holoColors') as string[]) : [], Number(g('holoAngle'))),
        '--holo-opacity': String(g('holoOpacity')),
        '--holo-time': `${Number(g('holoSpeed'))}s`,
        '--holo-blend': String(g('holoBlend')),
        '--holo-name': loop ? 'holoSiteLoop' : 'holoSite',
        '--holo-iter': loop ? 'infinite' : '1',
        '--holo-timing': loop ? 'linear' : 'ease',
      },
    };
  }
  return out;
}

/** The CSS custom properties for a variant's shimmer, as a React style object (client-safe). Empty when the shimmer is off. */
export function holoVars(spec: HoloSpec | undefined): React.CSSProperties {
  return (spec?.on ? spec.style : {}) as React.CSSProperties;
}

/** Class names to add to a card's art for its shimmer: always the base class, plus .holo-live where it should sweep by itself. */
export function holoClass(spec: HoloSpec | undefined, live = false): string {
  return spec?.on ? (live ? 'holo-fx holo-live' : 'holo-fx') : '';
}
