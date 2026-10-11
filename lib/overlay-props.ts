// Every adjustable property of the OBS overlay, in one registry. Browser-safe (no KV) so the admin editor can import it.
//
// Design:
//  - A property is addressed by a dotted key ("collection.perRow", "variant.shiny.holoSpeed") and its value is a plain
//    number / boolean / string / string[]. A whole configuration is a flat map of key -> value.
//  - Only values that DIFFER from the default are stored ("sparse"), so new properties and changed defaults flow through.
//  - The same flat map is used for the global settings, per-pack overrides, named presets and JSON export/import, and
//    the editor UI is generated from this registry — so adding a property is one entry here plus using it in widget.js.
//  - The defaults reproduce the overlay's original look exactly, so an untouched install is unchanged.

export type PropValue = number | boolean | string | string[];
export type PropValues = Record<string, PropValue>;

export type PropType = 'number' | 'boolean' | 'select' | 'color' | 'colors' | 'text';

export interface PropDef {
  key: string;
  group: string;
  label: string;
  help?: string;
  type: PropType;
  default: PropValue;
  // number
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  // select
  options?: { value: string; label: string }[];
  // colors: how many entries are allowed
  minItems?: number;
  maxItems?: number;
  // text
  maxLength?: number;
  /** Shown with an "experimental" badge: works, but is new or unusual and may change. */
  experimental?: boolean;
}

export interface PropGroup {
  id: string;
  label: string;
  icon: string;
  description: string;
}

// ── Reveal animation styles ───────────────────────────────

export const REVEAL_STYLES: { value: string; label: string; experimental?: boolean; description: string }[] = [
  { value: 'classic',  label: 'Classic — pack tears, card rises', description: 'The original: the pack tilts in, the tear strip flies off and the card rises.' },
  { value: 'simple',   label: 'Simple — card zooms in', description: 'No pack. The card just zooms in. Quick, good for busy streams.' },
  { value: 'slide',    label: 'Slide up', description: 'The card slides up from below with its info following.' },
  { value: 'flip',     label: 'Flip reveal', description: 'A card back flips over to reveal the art.' },
  { value: 'rip-shake', label: 'Rip — shake & burst', experimental: true, description: 'The pack shakes harder and harder, the tear strip flies off and the card bursts out.' },
  { value: 'rip-peel',  label: 'Rip — peel open', experimental: true, description: 'The tear strip peels back from one side like a wrapper, then the card rises.' },
];

export const BLEND_MODES = [
  { value: 'overlay', label: 'Overlay (default)' },
  { value: 'soft-light', label: 'Soft light (gentle)' },
  { value: 'hard-light', label: 'Hard light (punchy)' },
  { value: 'color-dodge', label: 'Color dodge (bright)' },
  { value: 'screen', label: 'Screen (glowy)' },
  { value: 'plus-lighter', label: 'Add (very bright)' },
];

export const VARIANT_IDS = ['regular', 'reverse', 'full', 'shiny'] as const;
export type VariantId = (typeof VARIANT_IDS)[number];

export const PROP_GROUPS: PropGroup[] = [
  { id: 'reveal', label: 'Pack opening', icon: '🎴', description: 'How a pulled card is revealed on stream.' },
  { id: 'collection', label: 'Collection view', icon: '📋', description: 'The "show collection" grid.' },
  { id: 'variant.regular', label: 'Regular cards', icon: '🃏', description: 'Label and holo for standard cards.' },
  { id: 'variant.reverse', label: 'Reverse Holo', icon: '🌈', description: 'Holographic shimmer on the regular art.' },
  { id: 'variant.full', label: 'Full Art', icon: '🖼️', description: 'The full-art version.' },
  { id: 'variant.shiny', label: 'Shiny Full Art', icon: '✨', description: 'The rarest version: full art with holo.' },
];

const GROUP_LABEL: Record<VariantId, string> = { regular: 'Regular cards', reverse: 'Reverse Holo', full: 'Full Art', shiny: 'Shiny Full Art' };

// Per-variant defaults (they reproduce the original hard-coded effects).
interface VariantDefaults {
  labelText: string;
  labelColors: string[];
  holoMode: 'auto' | 'on' | 'off';
  holoColors: string[];
  glow: boolean; glowColorA: string; glowColorB: string; glowBlur: number; glowSpread: number; glowSpeed: number;
  pop: boolean; popScale: number; popTilt: number;
  rock: boolean; rockAmount: number; rockSpeed: number;
  burstColor: string; burstHue: boolean;
}

const HOLO_PALETTE = ['#fffee3', '#ffe078', '#afffb5', '#fffee3', '#96f5ff', '#fffee3', '#ffe078', '#fffee3'];
const NO_FX = { glow: false, glowColorA: '#ffffff', glowColorB: '#ffffff', glowBlur: 40, glowSpread: 8, glowSpeed: 1.4, pop: false, popScale: 1.1, popTilt: 0, rock: false, rockAmount: 2, rockSpeed: 3.6 };

const VARIANT_DEFAULTS: Record<VariantId, VariantDefaults> = {
  regular: { labelText: 'new', labelColors: ['#f1bb06'], holoMode: 'auto', holoColors: HOLO_PALETTE, ...NO_FX, burstColor: '#fff08c', burstHue: false },
  reverse: { labelText: 'Reverse Holo', labelColors: ['#8b5cf6', '#ec4899'], holoMode: 'on', holoColors: HOLO_PALETTE, ...NO_FX, burstColor: '#fff08c', burstHue: false },
  full: {
    labelText: 'Full Art', labelColors: ['#0ea5e9', '#6366f1'], holoMode: 'auto', holoColors: HOLO_PALETTE,
    glow: true, glowColorA: '#60beff', glowColorB: '#60beff', glowBlur: 46, glowSpread: 12, glowSpeed: 1.6,
    pop: true, popScale: 1.12, popTilt: 0, rock: false, rockAmount: 2, rockSpeed: 3.6, burstColor: '#78c8ff', burstHue: false,
  },
  shiny: {
    labelText: '✨ Shiny Full Art', labelColors: ['#f59e0b', '#ef4444', '#a855f7'], holoMode: 'on', holoColors: HOLO_PALETTE,
    glow: true, glowColorA: '#ffc828', glowColorB: '#ff78c8', glowBlur: 70, glowSpread: 20, glowSpeed: 1.1,
    pop: true, popScale: 1.22, popTilt: -2, rock: true, rockAmount: 2, rockSpeed: 3.6, burstColor: '#fff08c', burstHue: true,
  },
};

function variantProps(v: VariantId): PropDef[] {
  const g = `variant.${v}`;
  const d = VARIANT_DEFAULTS[v];
  const name = GROUP_LABEL[v];
  return [
    { key: `${g}.labelText`, group: g, label: 'Label text', type: 'text', default: d.labelText, maxLength: 30, help: `The tag above the card for ${name}.` },
    { key: `${g}.labelColors`, group: g, label: 'Label colors', type: 'colors', default: d.labelColors, minItems: 1, maxItems: 3, help: 'One colour is solid; two or three make a gradient.' },
    {
      key: `${g}.holoMode`, group: g, label: 'Holographic shimmer', type: 'select', default: d.holoMode,
      options: [{ value: 'auto', label: 'Auto (pack\'s min-stars rule)' }, { value: 'on', label: 'Always on' }, { value: 'off', label: 'Off' }],
      help: 'Auto shimmers cards at or above the pack\'s "Holo min stars"; On/Off force it for this version.',
    },
    { key: `${g}.holoColors`, group: g, label: 'Shimmer colors', type: 'colors', default: d.holoColors, minItems: 1, maxItems: 8, help: 'The bands of light that sweep across the card, in order (up to 8).' },
    { key: `${g}.holoOpacity`, group: g, label: 'Shimmer strength', type: 'number', default: 0.9, min: 0, max: 1, step: 0.05, help: 'How bright the bands are.' },
    { key: `${g}.holoSpeed`, group: g, label: 'Shimmer sweep time', type: 'number', default: 10.5, min: 1, max: 40, step: 0.5, unit: 's', help: 'Seconds for one sweep across the card. Lower is faster.' },
    { key: `${g}.holoAngle`, group: g, label: 'Shimmer angle', type: 'number', default: 120, min: 0, max: 360, step: 5, unit: '°', help: 'The tilt of the bands.' },
    { key: `${g}.holoBlend`, group: g, label: 'Shimmer blending', type: 'select', default: 'overlay', options: BLEND_MODES, help: 'How the light mixes with the art. Overlay is the original.' },
    { key: `${g}.holoLoop`, group: g, label: 'Keep sweeping', type: 'boolean', default: false, help: 'Off: one pass then it fades. On: sweeps repeatedly while the card is shown.' },
    { key: `${g}.glow`, group: g, label: 'Glow', type: 'boolean', default: d.glow, help: 'A pulsing coloured halo around the card.' },
    { key: `${g}.glowColorA`, group: g, label: 'Glow colour A', type: 'color', default: d.glowColorA, help: 'The glow pulses between colour A and colour B.' },
    { key: `${g}.glowColorB`, group: g, label: 'Glow colour B', type: 'color', default: d.glowColorB },
    { key: `${g}.glowBlur`, group: g, label: 'Glow size', type: 'number', default: d.glowBlur, min: 0, max: 200, step: 2, unit: 'px', help: 'How far the glow reaches at its brightest.' },
    { key: `${g}.glowSpread`, group: g, label: 'Glow thickness', type: 'number', default: d.glowSpread, min: 0, max: 60, step: 1, unit: 'px' },
    { key: `${g}.glowSpeed`, group: g, label: 'Glow pulse time', type: 'number', default: d.glowSpeed, min: 0.3, max: 6, step: 0.1, unit: 's' },
    { key: `${g}.pop`, group: g, label: 'Pop-in', type: 'boolean', default: d.pop, help: 'The card swells for a moment when it is revealed.' },
    { key: `${g}.popScale`, group: g, label: 'Pop size', type: 'number', default: d.popScale, min: 1, max: 1.6, step: 0.01, unit: '×' },
    { key: `${g}.popTilt`, group: g, label: 'Pop tilt', type: 'number', default: d.popTilt, min: -15, max: 15, step: 0.5, unit: '°', help: 'A little rotation during the pop.' },
    { key: `${g}.rock`, group: g, label: 'Rocking', type: 'boolean', default: d.rock, help: 'A gentle left-to-right sway while shown.' },
    { key: `${g}.rockAmount`, group: g, label: 'Rock amount', type: 'number', default: d.rockAmount, min: 0, max: 8, step: 0.25, unit: '°' },
    { key: `${g}.rockSpeed`, group: g, label: 'Rock cycle time', type: 'number', default: d.rockSpeed, min: 0.8, max: 10, step: 0.1, unit: 's' },
    { key: `${g}.burstColor`, group: g, label: 'Light-burst colour', type: 'color', default: d.burstColor, help: 'The rays behind the card.' },
    { key: `${g}.burstHue`, group: g, label: 'Cycle burst colours', type: 'boolean', default: d.burstHue, experimental: true, help: 'The rays slowly shift through the rainbow.' },
  ];
}

export const PROPS: PropDef[] = [
  // ── Pack opening ──
  { key: 'reveal.style', group: 'reveal', label: 'Reveal animation', type: 'select', default: 'classic', options: REVEAL_STYLES.map(s => ({ value: s.value, label: s.label + (s.experimental ? ' (experimental)' : '') })), help: 'How the pulled card appears.' },
  { key: 'reveal.speed', group: 'reveal', label: 'Animation speed', type: 'number', default: 1, min: 0.5, max: 2.5, step: 0.05, unit: '×', help: '1 is the designed speed. 2 plays everything twice as fast (the on-screen hold time is not changed).' },
  { key: 'reveal.packSounds', group: 'reveal', label: 'Pack-opening sounds', type: 'boolean', default: true, help: 'The rip and shake sounds for the pack styles. (Card sounds are set on each card.)' },
  { key: 'reveal.showBurst', group: 'reveal', label: 'Light burst', type: 'boolean', default: true, help: 'Rays spinning behind the revealed card.' },
  { key: 'reveal.burstOpacity', group: 'reveal', label: 'Burst strength', type: 'number', default: 0.85, min: 0, max: 1, step: 0.05 },
  { key: 'reveal.showLabel', group: 'reveal', label: 'Label above the card', type: 'boolean', default: true, help: 'The tag: "new", or the version name.' },
  { key: 'reveal.showInfoBar', group: 'reveal', label: 'Name and stars bar', type: 'boolean', default: true, help: 'The card name and star rating at the bottom of the card.' },
  { key: 'reveal.showGotLine', group: 'reveal', label: '"… got:" line', type: 'boolean', default: true },
  { key: 'reveal.gotText', group: 'reveal', label: '"… got:" wording', type: 'text', default: '{user} got:', maxLength: 60, help: 'Use {user} for the viewer\'s name.' },
  { key: 'reveal.showMiniList', group: 'reveal', label: 'Collection strip below the card', type: 'boolean', default: true, help: 'The row of small cards showing what they already own.' },
  { key: 'reveal.showUncollectedStrip', group: 'reveal', label: 'Show uncollected in the strip', type: 'boolean', default: true, help: 'Off: only cards they own appear.' },

  // ── Collection view ──
  { key: 'collection.perRow', group: 'collection', label: 'Cards per row', type: 'number', default: 0, min: 0, max: 30, step: 1, help: '0 = fit as many as the width allows (the original). Otherwise rows hold exactly this many.' },
  { key: 'collection.cardWidth', group: 'collection', label: 'Card size', type: 'number', default: 48, min: 24, max: 200, step: 2, unit: 'px', help: 'Width of each small card (the height follows).' },
  { key: 'collection.gap', group: 'collection', label: 'Gap between cards', type: 'number', default: 13, min: 0, max: 60, step: 1, unit: 'px' },
  { key: 'collection.showUncollected', group: 'collection', label: 'Show uncollected cards', type: 'boolean', default: true, help: 'Off: only the cards the viewer owns are shown (no "?" placeholders).' },
  { key: 'collection.showCounts', group: 'collection', label: 'Show ×N counts', type: 'boolean', default: true, help: 'The duplicate-count badge.' },
  { key: 'collection.showVariantMarkers', group: 'collection', label: 'Show ✨ on upgraded cards', type: 'boolean', default: true },
  { key: 'collection.showHeading', group: 'collection', label: 'Show the heading', type: 'boolean', default: true, help: 'The "name\'s collection:" line.' },
  { key: 'collection.headingText', group: 'collection', label: 'Heading wording', type: 'text', default: "{user}'s collection:", maxLength: 60, help: 'Use {user} for the viewer\'s name.' },
  { key: 'collection.hold', group: 'collection', label: 'Time on screen', type: 'number', default: 4, min: 1, max: 30, step: 0.5, unit: 's' },
  {
    key: 'collection.appear', group: 'collection', label: 'Entrance', type: 'select', default: 'fade',
    options: [{ value: 'fade', label: 'Fade in' }, { value: 'zoom', label: 'Zoom in' }, { value: 'slide', label: 'Slide up' }],
  },
  { key: 'collection.borderColor', group: 'collection', label: 'Card border colour', type: 'color', default: '#ffffff', help: 'The outline around collected cards.' },
  { key: 'collection.placeholderColor', group: 'collection', label: 'Placeholder colour', type: 'color', default: '#f1bb06', help: 'The fill of uncollected "?" cards.' },

  // ── Per-variant (regular, reverse, full, shiny) ──
  ...VARIANT_IDS.flatMap(variantProps),
];

export const PROP_BY_KEY: Record<string, PropDef> = Object.fromEntries(PROPS.map(p => [p.key, p]));

/** Every key mapped to its default — the full configuration of an untouched install. */
export const DEFAULT_PROPS: PropValues = Object.fromEntries(PROPS.map(p => [p.key, Array.isArray(p.default) ? [...p.default] : p.default]));

// ── Validation ────────────────────────────────────────────

const HEX = /^#[0-9a-fA-F]{6}$/;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Validates one value for a property. Returns the cleaned value, or undefined when it can't be made valid. */
export function cleanValue(def: PropDef, raw: unknown): PropValue | undefined {
  switch (def.type) {
    case 'number': {
      const n = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
      if (typeof n !== 'number' || !Number.isFinite(n)) return undefined;
      const v = clamp(n, def.min ?? -Infinity, def.max ?? Infinity);
      const step = def.step ?? 0;
      return step > 0 && step < 1 ? Number((Math.round(v / step) * step).toFixed(4)) : v === Math.trunc(v) ? v : Math.round(v * 1000) / 1000;
    }
    case 'boolean':
      return typeof raw === 'boolean' ? raw : raw === 'true' ? true : raw === 'false' ? false : undefined;
    case 'select': {
      const s = typeof raw === 'string' ? raw : undefined;
      return s && def.options?.some(o => o.value === s) ? s : undefined;
    }
    case 'color':
      return typeof raw === 'string' && HEX.test(raw) ? raw.toLowerCase() : undefined;
    case 'colors': {
      if (!Array.isArray(raw)) return undefined;
      const colors = raw.filter((c): c is string => typeof c === 'string' && HEX.test(c)).map(c => c.toLowerCase());
      const min = def.minItems ?? 1;
      if (colors.length < min) return undefined;
      return colors.slice(0, def.maxItems ?? 8);
    }
    case 'text':
      // Strip control characters; keep it to one line.
      return typeof raw === 'string' ? raw.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, def.maxLength ?? 80) : undefined;
  }
}

const same = (a: PropValue, b: PropValue) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Cleans an arbitrary object (stored data, an imported file, a form post) into a SPARSE map: unknown keys are dropped,
 * invalid values are dropped, and values equal to the default are not kept — unless `keepDefaults` (a pack override must
 * keep a value equal to the default, because the global setting it overrides may not be the default).
 */
export function sanitizePropValues(input: unknown, opts: { keepDefaults?: boolean } = {}): PropValues {
  const out: PropValues = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  for (const [key, raw] of Object.entries(input as Record<string, unknown>)) {
    const def = PROP_BY_KEY[key];
    if (!def) continue;
    const v = cleanValue(def, raw);
    if (v !== undefined && (opts.keepDefaults || !same(v, def.default))) out[key] = v;
  }
  return out;
}

/** Fills in defaults under a sparse map: the full effective configuration. */
export function withDefaults(sparse: PropValues | null | undefined): PropValues {
  const full: PropValues = {};
  for (const [k, v] of Object.entries(DEFAULT_PROPS)) full[k] = Array.isArray(v) ? [...v] : v;
  for (const [k, v] of Object.entries(sparse ?? {})) if (k in DEFAULT_PROPS) full[k] = v;
  return full;
}

/** Global settings with a pack's overrides on top (all sparse in, full out). */
export function effectiveProps(global: PropValues | null | undefined, packOverrides?: PropValues | null): PropValues {
  return withDefaults({ ...(global ?? {}), ...(packOverrides ?? {}) });
}

export const isChanged = (key: string, value: PropValue | undefined) => value !== undefined && !same(value, PROP_BY_KEY[key].default);

/** Export format: a small versioned JSON document. */
export interface PropsExport { app: 'the-cheesy-tcg'; kind: 'overlay-properties'; version: 1; values: PropValues }

export function exportProps(sparse: PropValues): PropsExport {
  return { app: 'the-cheesy-tcg', kind: 'overlay-properties', version: 1, values: sanitizePropValues(sparse) };
}

/** Parses an exported document (or a bare map of values). Throws a readable Error when it isn't usable. */
export function importProps(text: string): PropValues {
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new Error('That is not valid JSON.'); }
  const values = data && typeof data === 'object' && 'values' in (data as object) ? (data as { values: unknown }).values : data;
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('No overlay properties found in that JSON.');
  const clean = sanitizePropValues(values);
  const given = Object.keys(values as object).length;
  if (given > 0 && Object.keys(clean).length === 0 && !Object.keys(values as object).some(k => k in PROP_BY_KEY)) {
    throw new Error('None of the properties in that JSON are recognised.');
  }
  return clean;
}
