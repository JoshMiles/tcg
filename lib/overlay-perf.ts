import type { PropValue, VariantId } from './overlay-props';

// A rough "how heavy is this look" rating for the stream overlay, per card version. OBS browser sources are not fast, and the
// reveal is the one moment that must stay smooth, so the editor warns about combinations that cost a lot (big blurred glows,
// many rays or sparkles, looping shimmer, 3D tilt). It is a guide, not a measurement: it adds up weights for the effects switched on.

export type PerfLevel = 'light' | 'medium' | 'heavy';
export interface PerfRating { score: number; level: PerfLevel; reasons: string[] }

const num = (v: PropValue | undefined, fallback: number) => (typeof v === 'number' ? v : fallback);

export function variantPerf(get: (key: string) => PropValue, variant: VariantId): PerfRating {
  const g = (n: string) => get(`variant.${variant}.${n}`);
  let score = 0;
  const reasons: string[] = [];
  const add = (points: number, reason?: string) => { score += points; if (reason) reasons.push(reason); };

  if (g('holoMode') !== 'off') {
    add(0.4);
    if (g('holoLoop') === true) add(0.8, 'Shimmer sweeps continuously');
    if (num(g('holoSpeed'), 10) < 3 && g('holoLoop') === true) add(0.4, 'Very fast shimmer loop');
  }
  if (g('glow') === true) {
    const blur = num(g('glowBlur'), 40);
    add(1 + blur / 80, blur >= 100 ? `Large glow (${blur}px)` : undefined);
  }
  if (g('burst') === true) {
    const rays = num(g('burstRays'), 8);
    const size = num(g('burstSize'), 1);
    add(0.6 + rays / 16 + (size > 1.6 ? 0.5 : 0), rays >= 16 ? `${rays} burst rays` : size > 1.6 ? 'Very large light burst' : undefined);
    if (g('burstHue') === true) add(0.5, 'Colour-cycling burst');
  }
  if (g('sparkles') === true) {
    const n = num(g('sparkleCount'), 28);
    add(0.5 + n / 40, n >= 50 ? `${n} sparkles` : undefined);
  }
  if (g('tilt') === true) add(0.8, '3D tilt');
  if (g('rock') === true) add(0.2);
  if (g('pop') === true) add(0.1);

  const level: PerfLevel = score < 2.5 ? 'light' : score < 4.2 ? 'medium' : 'heavy';
  return { score: Math.round(score * 10) / 10, level, reasons };
}

export const PERF_LABEL: Record<PerfLevel, string> = { light: 'Light', medium: 'Moderate', heavy: 'Heavy' };
