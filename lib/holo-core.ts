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
  /** Any of shimmer, glow or rock is on: `holoVars` applies the style. */
  on: boolean;
  /** The shimmer itself is on: `holoClass` adds the sweep. */
  shimmer: boolean;
  style: Record<string, string>;
}
export type HoloSpecs = Record<Variant, HoloSpec>;

const NONE: HoloSpec = { on: false, shimmer: false, style: {} };
export const NO_HOLO: HoloSpecs = { regular: NONE, reverse: NONE, full: NONE, shiny: NONE, golden: NONE };

/** The overlay's gradient: 8 colour bands (cycling through the palette) separated by transparent gaps. */
export function holoGradient(colors: string[], angle: number): string {
  const palette = colors.length ? colors : ['#fffee3'];
  const stops: string[] = [];
  for (let i = 0; i < 8; i++) stops.push('#ffffff00', palette[i % palette.length]);
  stops.push('#ffffff00');
  return `linear-gradient(${angle}deg, ${stops.join(', ')})`;
}

/** Builds the shimmer, glow and rock for each variant of a card, from the effective overlay properties. */
export function buildHoloSpecs(props: PropValues, stars: number, holoMinStars: number): HoloSpecs {
  const out = { ...NO_HOLO } as HoloSpecs;
  for (const v of VARIANTS) {
    const g = (name: string): PropValue | undefined => props[`variant.${v}.${name}`];
    const mode = String(g('holoMode'));
    const on = mode === 'on' || (mode === 'auto' && stars >= holoMinStars);
    const glowOn = g('glow') === true;
    const rockOn = g('rock') === true;

    if (!on && !glowOn && !rockOn) {
      out[v] = NONE;
      continue;
    }

    const loop = g('holoLoop') === true;
    const style: Record<string, string> = {};

    if (on) {
      style['--holo-gradient'] = holoGradient(Array.isArray(g('holoColors')) ? (g('holoColors') as string[]) : [], Number(g('holoAngle')));
      style['--holo-opacity'] = String(g('holoOpacity'));
      style['--holo-time'] = `${Number(g('holoSpeed'))}s`;
      style['--holo-blend'] = String(g('holoBlend'));
      style['--holo-name'] = loop ? 'holoSiteLoop' : 'holoSite';
      style['--holo-iter'] = loop ? 'infinite' : '1';
      style['--holo-timing'] = loop ? 'linear' : 'ease';
    }

    if (glowOn) {
      style['--glow-color-a'] = String(g('glowColorA') ?? '#ffffff');
      style['--glow-color-b'] = String(g('glowColorB') ?? '#ffffff');
      style['--glow-blur'] = `${Number(g('glowBlur') ?? 40) / 2}px`;
      style['--glow-spread'] = `${Number(g('glowSpread') ?? 8) / 4}px`;
      style['--glow-speed'] = `${Number(g('glowSpeed') ?? 1.4)}s`;
    }

    if (rockOn) {
      style['--rock-amt'] = `${Number(g('rockAmount') ?? 2)}deg`;
      style['--rock-speed'] = `${Number(g('rockSpeed') ?? 3.6)}s`;
    }

    out[v] = { on: true, shimmer: on, style };
  }
  return out;
}

/** The CSS custom properties for a variant's shimmer, glow and rock, as a React style object (client-safe). Empty when all are off. */
export function holoVars(spec: HoloSpec | undefined): React.CSSProperties {
  return (spec?.on ? spec.style : {}) as React.CSSProperties;
}

/** Grid and binder only. A saved sweep faster than 8 seconds is raised to 8. Overlay, ceremony and the panel keep `holoVars`. */
export function siteHoloVars(spec: HoloSpec | undefined): React.CSSProperties {
  const style = { ...holoVars(spec) } as Record<string, string>;
  const seconds = Number.parseFloat(style['--holo-time'] ?? '');
  if (Number.isFinite(seconds) && seconds < 8) style['--holo-time'] = '8s';
  return style as React.CSSProperties;
}

/** Class names to add to a card's art for its shimmer: always the base class, plus .holo-live where it should sweep by itself. */
export function holoClass(spec: HoloSpec | undefined, live = false): string {
  return spec?.shimmer ? (live ? 'holo-fx holo-live' : 'holo-fx') : '';
}
