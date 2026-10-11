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
  /** Sub-heading the property is listed under inside its group (set automatically by `sectionFor`). */
  section?: string;
  /** Card versions: which version this property belongs to. */
  variant?: VariantId;
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
  { value: 'rip-slice', label: 'Rip — slice off', experimental: true, description: 'The tear strip slides straight off to the side like a clean cut, the pack drops away and the card rises.' },
  { value: 'rip-explode', label: 'Rip — explode', experimental: true, description: 'The pack swells and flashes white, then bursts apart as the card slams out.' },
  { value: 'drop',     label: 'Drop in', description: 'No pack. The card drops from above and bounces into place.' },
  { value: 'spin',     label: 'Spin in', description: 'No pack. The card spins in from small, turning to face the camera.' },
  { value: 'impact',   label: 'Impact', description: 'No pack. The card slams in huge, then judders to rest, like a heavy hit.' },
  { value: 'deal',     label: 'Deal', description: 'No pack. The card is dealt from the side, spinning in and settling.' },
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
  { id: 'pack', label: 'Pack opening', icon: '🎴', description: 'How a pulled card is revealed: the animation, the card, its label and details, the light burst, and the row of cards under it.' },
  { id: 'variants', label: 'Variants', icon: '✨', description: 'Pick a card variant, then edit how it looks: label, holo shimmer, glow, motion and sound.' },
  { id: 'collection', label: 'Collection', icon: '📋', description: "The \"show collection\" view: a viewer's whole card grid." },
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
  return variantPropsRaw(v).map(p => ({ ...p, group: 'variants', variant: v }));
}

function variantPropsRaw(v: VariantId): PropDef[] {
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
    { key: `${g}.glow`, group: g, label: 'Glow', type: 'boolean', default: d.glow, help: 'A pulsing coloured halo. It follows the card\'s own shape, so rounded corners and holes in the art stay clear.' },
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
    { key: `${g}.tilt`, group: g, label: '3D tilt', type: 'boolean', default: false, help: 'The card tips toward and away from the camera, as if someone were showing it off.' },
    {
      key: `${g}.tiltAxis`, group: g, label: 'Tilt direction', type: 'select', default: 'x',
      options: [{ value: 'x', label: 'Nod: tips forward and back (X axis)' }, { value: 'y', label: 'Turn: swings side to side (Y axis)' }, { value: 'xy', label: 'Diagonal: both at once' }],
    },
    { key: `${g}.tiltAmount`, group: g, label: 'Tilt angle', type: 'number', default: 14, min: 2, max: 45, step: 1, unit: '°', help: 'How far it tips each way.' },
    { key: `${g}.tiltSpeed`, group: g, label: 'Tilt cycle time', type: 'number', default: 4, min: 1, max: 12, step: 0.1, unit: 's' },
    { key: `${g}.tiltPerspective`, group: g, label: '3D depth', type: 'number', default: 900, min: 300, max: 2500, step: 50, unit: 'px', help: 'Lower is a stronger, closer 3D effect; higher is flatter.' },
    { key: `${g}.holdExtra`, group: g, label: 'Extra time on screen', type: 'number', default: 0, min: 0, max: 15, step: 0.5, unit: 's', help: 'Keep this version on screen longer, so a rare pull gets its moment.' },
    { key: `${g}.volume`, group: g, label: 'Reveal sound volume', type: 'number', default: 1, min: 0, max: 2, step: 0.05, unit: '×', help: "Multiplies the card's reveal sound on top of the pack's volume. Playback is capped at full volume, so above 1 only helps where the pack volume is below 1." },
    { key: `${g}.sparkles`, group: g, label: 'Sparkle burst', type: 'boolean', default: false, experimental: true, help: 'A burst of sparkles flies out from the card when it is revealed.' },
    { key: `${g}.sparkleCount`, group: g, label: 'Sparkle amount', type: 'number', default: 28, min: 6, max: 80, step: 1 },
    { key: `${g}.sparkleColor`, group: g, label: 'Sparkle colour', type: 'color', default: '#ffe27a' },
    {
      key: `${g}.style`, group: g, label: 'Reveal animation', type: 'select', default: 'inherit',
      options: [{ value: 'inherit', label: 'Same as the pack opening' }, ...REVEAL_STYLES.map(x => ({ value: x.value, label: x.label + (x.experimental ? ' (experimental)' : '') }))],
      help: `Give ${name} its own entrance, e.g. rarer pulls could always rip the pack open.`,
    },
    { key: `${g}.burst`, group: g, label: 'Light burst', type: 'boolean', default: true, help: 'Rays spinning behind the revealed card.' },
    { key: `${g}.burstOpacity`, group: g, label: 'Burst strength', type: 'number', default: 0.85, min: 0, max: 1, step: 0.05 },
    { key: `${g}.burstSize`, group: g, label: 'Burst size', type: 'number', default: 1, min: 0.4, max: 2.5, step: 0.05, unit: '×' },
    { key: `${g}.burstRays`, group: g, label: 'Number of rays', type: 'number', default: 8, min: 3, max: 24, step: 1 },
    { key: `${g}.burstSpeed`, group: g, label: 'Spin cycle time', type: 'number', default: 4, min: 1, max: 20, step: 0.5, unit: 's', help: 'Seconds for one full turn. Lower is faster.' },
    { key: `${g}.burstColor`, group: g, label: 'Light-burst colour', type: 'color', default: d.burstColor, help: 'The rays behind the card.' },
    { key: `${g}.burstHue`, group: g, label: 'Cycle burst colours', type: 'boolean', default: d.burstHue, experimental: true, help: 'The rays slowly shift through the rainbow.' },
  ];
}

export const PROPS: PropDef[] = [
  // ── Pack opening ──
  { key: 'reveal.style', group: 'pack', label: 'Reveal animation', type: 'select', default: 'classic', options: REVEAL_STYLES.map(s => ({ value: s.value, label: s.label + (s.experimental ? ' (experimental)' : '') })), help: 'How the pulled card appears.' },
  { key: 'reveal.speed', group: 'pack', label: 'Animation speed', type: 'number', default: 1, min: 0.5, max: 2.5, step: 0.05, unit: '×', help: '1 is the designed speed. 2 plays everything twice as fast (the on-screen hold time is not changed).' },
  { key: 'reveal.startDelay', group: 'pack', label: 'Start delay', type: 'number', default: 0, min: 0, max: 5, step: 0.1, unit: 's', help: 'Wait this long before the reveal begins (handy to line it up with a bot message or alert).' },
  { key: 'reveal.packScale', group: 'pack', label: 'Pack size', type: 'number', default: 1, min: 0.5, max: 1.5, step: 0.05, unit: '×', help: 'Scales the pack in the styles that show one.' },
  { key: 'reveal.packSounds', group: 'pack', label: 'Pack-opening sounds', type: 'boolean', default: true, help: 'The rip and shake sounds for the pack styles. (Card sounds are set on each card.)' },
  { key: 'reveal.cardScale', group: 'pack', label: 'Revealed card size', type: 'number', default: 1, min: 0.5, max: 1.5, step: 0.05, unit: '×', help: 'Scales the card itself (the pack and the strip stay as they are).' },
  { key: 'reveal.labelSize', group: 'pack', label: 'Label text size', type: 'number', default: 14, min: 10, max: 30, step: 1, unit: 'px' },
  { key: 'reveal.nameColor', group: 'pack', label: 'Card name colour', type: 'color', default: '#f1bb06' },
  { key: 'reveal.starColor', group: 'pack', label: 'Star colour', type: 'color', default: '#f1bb06' },
  { key: 'reveal.infoBg', group: 'pack', label: 'Name & stars bar colour', type: 'color', default: '#fffefe' },
  { key: 'reveal.gotColor', group: 'pack', label: '"got:" pill colour', type: 'color', default: '#f1bb06' },
  { key: 'reveal.gotTextColor', group: 'pack', label: '"got:" text colour', type: 'color', default: '#fffefe' },
  { key: 'reveal.showLabel', group: 'pack', label: 'Label above the card', type: 'boolean', default: true, help: 'The tag: "new", or the version name.' },
  { key: 'reveal.labelOwned', group: 'pack', label: 'Label for a card they already own', type: 'text', default: '', maxLength: 30, help: 'Regular pulls say "new" even when it is a duplicate. Put a word here (e.g. "again") to use it for cards the viewer already has. Empty keeps the normal label.' },
  { key: 'reveal.showInfoBar', group: 'pack', label: 'Name and stars bar', type: 'boolean', default: true, help: 'The card name and star rating at the bottom of the card.' },
  { key: 'reveal.showGotLine', group: 'pack', label: '"… got:" line', type: 'boolean', default: true },
  { key: 'reveal.gotText', group: 'pack', label: '"… got:" wording', type: 'text', default: '{user} got:', maxLength: 60, help: 'Use {user} for the viewer\'s name.' },
  { key: 'reveal.stripPerRow', group: 'pack', label: 'Cards per row', type: 'number', default: 0, min: 0, max: 30, step: 1, help: '0 = fit as many as the width allows (the original). Otherwise each row holds exactly this many.' },
  { key: 'reveal.stripCardWidth', group: 'pack', label: 'Card size', type: 'number', default: 48, min: 24, max: 200, step: 2, unit: 'px', help: 'Width of each small card (the height follows).' },
  { key: 'reveal.stripGap', group: 'pack', label: 'Gap between cards', type: 'number', default: 13, min: 0, max: 60, step: 1, unit: 'px' },
  { key: 'reveal.showMiniList', group: 'pack', label: 'Collection strip below the card', type: 'boolean', default: true, help: 'The row of small cards showing what they already own.' },
  { key: 'reveal.showUncollectedStrip', group: 'pack', label: 'Show uncollected in the strip', type: 'boolean', default: true, help: 'Off: only cards they own appear.' },

  { key: 'reveal.stripSort', group: 'pack', label: 'Order', type: 'select', default: 'number', options: [{ value: 'number', label: 'Card number' }, { value: 'owned', label: 'Collected first' }, { value: 'rarity', label: 'Rarest first' }], help: 'How the cards under the revealed card are arranged.' },
  { key: 'reveal.stripCardRadius', group: 'pack', label: 'Corner rounding', type: 'number', default: 2, min: 0, max: 14, step: 1, unit: 'px' },
  { key: 'reveal.stripShowCounts', group: 'pack', label: 'Show ×N counts', type: 'boolean', default: true, help: 'The duplicate-count badge.' },
  { key: 'reveal.stripShowMarkers', group: 'pack', label: 'Show ✨ on upgraded cards', type: 'boolean', default: true },
  { key: 'reveal.stripBorderColor', group: 'pack', label: 'Card border colour', type: 'color', default: '#ffffff', help: 'The outline around collected cards.' },
  { key: 'reveal.stripPlaceholderColor', group: 'pack', label: 'Placeholder colour', type: 'color', default: '#f1bb06', help: 'The fill of uncollected "?" cards.' },

  // ── Collection view ──
  { key: 'collection.perRow', group: 'collection', label: 'Cards per row', type: 'number', default: 0, min: 0, max: 30, step: 1, help: '0 = fit as many as the width allows (the original). Otherwise rows hold exactly this many.' },
  { key: 'collection.cardWidth', group: 'collection', label: 'Card size', type: 'number', default: 48, min: 24, max: 200, step: 2, unit: 'px', help: 'Width of each small card (the height follows).' },
  { key: 'collection.cardRadius', group: 'collection', label: 'Corner rounding', type: 'number', default: 2, min: 0, max: 14, step: 1, unit: 'px' },
  {
    key: 'collection.sort', group: 'collection', label: 'Order', type: 'select', default: 'number',
    options: [{ value: 'number', label: 'Card number' }, { value: 'owned', label: 'Collected first' }, { value: 'rarity', label: 'Rarest first' }],
    help: 'How the cards are arranged.',
  },
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

/** Which sub-heading a property is listed under in the editor. */
function sectionFor(key: string): string {
  const v = key.match(/^variant.[a-z]+.(.+)$/);
  if (v) {
    const n = v[1];
    if (n.startsWith('label')) return 'Label';
    if (n.startsWith('holo')) return 'Holographic shimmer';
    if (n.startsWith('glow')) return 'Glow';
    if (n.startsWith('pop')) return 'Pop-in';
    if (n.startsWith('tilt')) return '3D tilt';
    if (n.startsWith('rock')) return 'Rocking';
    if (n.startsWith('burst')) return 'Light burst';
    if (n === 'style') return 'Reveal animation';
    if (n.startsWith('sparkle')) return 'Sparkles';
    return 'Time and sound';
  }
  const r: [RegExp, string][] = [
    [/^reveal.(style|speed|startDelay|packScale|packSounds)$/, 'Animation'],
    [/^reveal.cardScale$/, 'Card'],
    [/^reveal.(showLabel|labelSize|labelOwned)$/, 'Label'],
    [/^reveal.(showInfoBar|nameColor|starColor|infoBg)$/, 'Name and stars bar'],
    [/^reveal.(showGotLine|gotText|gotColor|gotTextColor)$/, '"got:" line'],
    [/^reveal.(showMiniList|showUncollectedStrip|stripShowCounts|stripShowMarkers)$/, 'Cards under the card'],
    [/^reveal.(stripPerRow|stripCardWidth|stripGap|stripSort)$/, 'Strip layout'],
    [/^reveal.strip/, 'Strip card look'],
    [/^collection.(perRow|cardWidth|gap|sort)$/, 'Layout'],
    [/^collection.(showUncollected|showCounts|showVariantMarkers|showHeading|headingText)$/, 'What to show'],
    [/^collection.(hold|appear)$/, 'Timing'],
    [/^collection./, 'Card look'],
  ];
  return r.find(([re]) => re.test(key))?.[1] ?? '';
}

/** The order sections appear in within a category (anything unlisted follows). */
export const SECTION_ORDER = [
  'Animation', 'Card', 'Label', 'Name and stars bar', '"got:" line',
  'Reveal animation', 'Holographic shimmer', 'Glow', 'Pop-in', '3D tilt', 'Rocking', 'Light burst', 'Sparkles', 'Time and sound',
  'Cards under the card', 'Strip layout', 'Strip card look',
  'Layout', 'What to show', 'Timing', 'Card look',
];

for (const p of PROPS) p.section = sectionFor(p.key);

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
