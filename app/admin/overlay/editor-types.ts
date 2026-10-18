import type { IconName } from '@/app/components/Icon';
import type { PropValue, PropValues, VariantId } from '@/lib/overlay-props';
import type { OverlayLayout } from '@/lib/overlay-layout';
import type { MomentId } from '@/lib/overlay-moments';
import type { PerfLevel } from '@/lib/overlay-perf';

// Shared types and small pure helpers of the Overlay Editor (see OverlayEditor.tsx).

export interface PackInfo { id: string; name: string }
export interface PresetInfo { id: string; name: string; props: PropValues; layout?: OverlayLayout; updatedAt: number }
export interface VersionInfo { id: string; at: number; note: string; layout: OverlayLayout; props: PropValues; packs: Record<string, PropValues> }
export interface SeasonInfo { id: string; name: string; active: boolean }
export interface CardInfo { number: number; name: string; stars: number }
export type Snap = { g: PropValues; p: Record<string, PropValues>; l: Record<string, OverlayLayout> };   // p / l also hold the scenes, keyed "scene:<preset id>"
export type Bg = 'checker' | 'dark' | 'light' | 'green' | 'image';
export const PERF_STYLE: Record<PerfLevel, string> = { light: 'text-emerald-300 border-emerald-400/30 bg-emerald-500/10', medium: 'text-amber-300 border-amber-400/30 bg-amber-500/10', heavy: 'text-red-300 border-red-400/30 bg-red-500/10' };
export type Mode = 'pack' | 'collection';
export type MomentPick = '' | MomentId;
/** One entry of the category rail (the registry's groups plus the Layout pseudo-category). */
export interface RailItem { id: string; label: string; icon: IconName; description: string }

export const VARIANT_LABELS: Record<VariantId, string> = { regular: 'Regular', reverse: 'Reverse Holo', full: 'Full Art', shiny: 'Shiny' };

// Which other property switches a property's controls on or off (so the panel can grey out what has no effect).
export function dependsOn(key: string): { key: string; when: (v: PropValue) => boolean } | null {
  const m = key.match(/^(variant\.[a-z]+)\.(.+)$/);
  if (m) {
    const [, g, name] = m;
    if (/^glow(ColorA|ColorB|Blur|Spread|Speed)$/.test(name)) return { key: `${g}.glow`, when: v => v === true };
    if (/^pop(Scale|Tilt)$/.test(name)) return { key: `${g}.pop`, when: v => v === true };
    if (/^tilt(Axis|Amount|Speed|Perspective)$/.test(name)) return { key: `${g}.tilt`, when: v => v === true };
    if (/^rock(Amount|Speed)$/.test(name)) return { key: `${g}.rock`, when: v => v === true };
    if (/^sparkle(Count|Color)$/.test(name)) return { key: `${g}.sparkles`, when: v => v === true };
    if (/^holo(Colors|Opacity|Speed|Angle|Blend|Loop)$/.test(name)) return { key: `${g}.holoMode`, when: v => v !== 'off' };
    if (/^burst(Opacity|Size|Rays|Speed|Color|Hue)$/.test(name)) return { key: `${g}.burst`, when: v => v === true };
  }
  const mo = key.match(/^moment\.(firstPull|newCard)\.(.+)$/);
  if (mo && mo[2] !== 'on') return { key: `moment.${mo[1]}.on`, when: v => v === true };
  if (/^reveal\.firstEver(Text|Hold)$/.test(key)) return { key: 'reveal.firstEver', when: v => v === true };
  const fe = key.match(/^moment\.firstEver\.(.+)$/);
  if (fe) return { key: 'reveal.firstEver', when: v => v === true };
  if (/^show\.(labelColor|labelTextColor)$/.test(key)) return { key: 'show.ownLabelLook', when: v => v === true };
  if (/^show\.(text|ownLabelLook|labelSize|labelX|labelY)$/.test(key)) return { key: 'show.showLabel', when: v => v === true };
  if (key === 'show.printFormat') return { key: 'show.showPrint', when: v => v === true };
  if (key === 'show.soundUrl') return { key: 'show.sound', when: v => v === 'custom' };
  if (key === 'show.volume') return { key: 'show.sound', when: v => v !== 'off' };
  if (key === 'reveal.gotText') return { key: 'reveal.showGotLine', when: v => v === true };
  if (key === 'collection.headingText') return { key: 'collection.showHeading', when: v => v === true };
  return null;
}

export type SidebarWindow = Window & { __tcgSidebarForce?: boolean };
