import { PROP_BY_KEY, type PropDef, type PropValue, type PropValues } from './overlay-props';
import type { ElementPlacement, OverlayLayout, Placement } from './overlay-layout';

// Client-safe "what changed" helpers for the Overlay Editor: the Review changes list, and how far a saved version is from the current edit.

export interface DiffLine { scope: string; label: string; from: string; to: string }

const VARIANT_NAME: Record<string, string> = { regular: 'Regular', reverse: 'Reverse Holo', full: 'Full Art', shiny: 'Full Art Holo', golden: 'Golden' };

export function formatValue(def: PropDef | undefined, v: PropValue | undefined): string {
  if (v === undefined) return '-';
  if (typeof v === 'boolean') return v ? 'on' : 'off';
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'number') return `${v}${def && 'unit' in def && def.unit ? ` ${def.unit}` : ''}`;
  if (def?.type === 'select' && 'options' in def && Array.isArray(def.options)) {
    const o = def.options.find(x => x.value === v);
    if (o) return o.label;
  }
  return String(v) === '' ? '(empty)' : String(v);
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Names for the fields of a text style, as the Review list says them ("outline width"). */
const TEXT_FIELD: Record<string, string> = {
  weight: 'weight', italic: 'italic', underline: 'underline', strike: 'strikethrough', overline: 'overline', textCase: 'case', tracking: 'letter spacing', wordSpacing: 'word spacing',
  lineHeight: 'line height', align: 'align', opacity: 'opacity', kerning: 'kerning',
  'fx.stroke': 'outline', 'fx.glow': 'glow', 'fx.bevel': 'bevel', 'fx.shadows': 'shadow', 'fx.gradientText': 'gradient',
};
const EFFECT_FIELD: Record<string, string> = { color: 'colour', width: 'width', pos: 'position', blur: 'blur', strength: 'strength', style: 'style', depth: 'depth', on: 'on' };
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** A text style value as one entry per field: `{ 'outline width': '2', weight: '700' }`. */
function textFields(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(isObj(v) ? v : {})) {
    if (k !== 'fx') { out[TEXT_FIELD[k] ?? k] = String(val); continue; }
    for (const [e, ev] of Object.entries(isObj(val) ? val : {})) {
      const name = TEXT_FIELD[`fx.${e}`] ?? e;
      if (isObj(ev) && e !== 'gradientText') for (const [f, fv] of Object.entries(ev)) out[`${name} ${EFFECT_FIELD[f] ?? f}`] = typeof fv === 'boolean' ? (fv ? 'on' : 'off') : String(fv);
      else out[name] = JSON.stringify(ev);
    }
  }
  return out;
}

/** Differences between two sparse value sets. `missing` says what an absent key means (the default, or "inherits global"). */
export function diffProps(scope: string, before: PropValues, after: PropValues, missing: (key: string) => PropValue | string | undefined): DiffLine[] {
  const out: DiffLine[] = [];
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const def = PROP_BY_KEY[key];
    if (!def) continue;
    const b = before[key] ?? missing(key);
    const a = after[key] ?? missing(key);
    if (same(a, b)) continue;
    if (def.type === 'textStyle') {
      const [bf, af] = [textFields(b), textFields(a)];
      for (const f of new Set([...Object.keys(bf), ...Object.keys(af)])) if (bf[f] !== af[f]) out.push({ scope, label: `${def.label.replace(/ text style$| style$/, '')}: ${f}`, from: bf[f] ?? '-', to: af[f] ?? '-' });
      continue;
    }
    const fmt = (x: PropValue | string | undefined) => (typeof x === 'string' && x.startsWith('(') ? x : formatValue(def, x as PropValue | undefined));
    out.push({ scope, label: `${def.variant ? VARIANT_NAME[def.variant] + ' › ' : ''}${def.label}`, from: fmt(b), to: fmt(a) });
  }
  return out;
}

export function diffLayout(before: OverlayLayout, after: OverlayLayout): DiffLine[] {
  const out: DiffLine[] = [];
  const add = (label: string, a: unknown, b: unknown) => { if (!same(a, b)) out.push({ scope: 'Layout', label, from: String(a), to: String(b) }); };
  add('Browser source width', before.width, after.width);
  add('Browser source height', before.height, after.height);
  for (const view of ['pack', 'collection'] as const) {
    const name = view === 'pack' ? 'Pack opening' : 'Collection';
    add(`${name} size`, `${Math.round(before[view].scale * 100)}%`, `${Math.round(after[view].scale * 100)}%`);
    add(`${name} offset X`, before[view].offsetX, after[view].offsetX);
    add(`${name} offset Y`, before[view].offsetY, after[view].offsetY);
    const [be, ae] = [before[view].elements ?? {}, after[view].elements ?? {}] as Record<string, ElementPlacement | undefined>[];
    for (const id of new Set([...Object.keys(be), ...Object.keys(ae)])) {
      const spot = (e?: ElementPlacement) => (e && (e.offsetX || e.offsetY || e.scale !== 1) ? `${e.offsetX}, ${e.offsetY} at ${Math.round(e.scale * 100)}%` : 'normal spot');
      add(`${name} ${id}`, spot(be[id]), spot(ae[id]));
      const pct = (e?: ElementPlacement) => `${Math.round((e?.opacity ?? 1) * 100)}%`;
      add(`${name} ${id} opacity`, pct(be[id]), pct(ae[id]));
    }
  }
  return out;
}
