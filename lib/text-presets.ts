import { FONT_IDS } from './card-back';
import { isRec, sanitizeTextStyle, type TextStyle } from './text-style';

// Named text styles (ROADMAP 38.12 e). A preset holds only the TextStyle fields, never text, position or box size.
export interface TextPreset { id: string; name: string; style: TextStyle }

export const MAX_PRESETS = 50;
export const MAX_PRESET_NAME = 40;

/** Every TextStyle key, so applying a preset also clears what the preset leaves unset. */
export const TEXT_STYLE_KEYS: (keyof TextStyle)[] = ['size', 'font', 'weight', 'italic', 'underline', 'uppercase', 'letterSpacing', 'lineHeight', 'align', 'color', 'opacity', 'fx', 'fit', 'minSize', 'indent', 'paraGap', 'strike', 'overline', 'textCase', 'tracking', 'wordSpacing', 'autoLeading', 'baseline', 'script', 'kerning'];

/** The style fields of anything shaped like a text element (a BackEl, say). */
export function styleOf(src: Record<string, unknown>): TextStyle {
  return sanitizeTextStyle(src, FONT_IDS);
}

/** A patch that sets every style field to the preset's value, undefined where it has none. */
export function presetPatch(style: TextStyle): Partial<TextStyle> {
  const s = style as unknown as Record<string, unknown>;
  return Object.fromEntries(TEXT_STYLE_KEYS.map(k => [k, s[k]])) as Partial<TextStyle>;
}

const b = (id: string, name: string, style: Record<string, unknown>): TextPreset => ({ id: `builtin:${id}`, name, style: sanitizeTextStyle(style, FONT_IDS) });

export const BUILTIN_TEXT_PRESETS: TextPreset[] = [
  b('gold-title', 'Gold title', { size: 12, font: 'display', weight: 700, align: 'center', color: '#ffffff', fx: { gradientText: { from: '#fde68a', to: '#b45309', angle: 180 }, shadows: [{ color: '#000000', x: 0, y: 1.5, blur: 3, opacity: 0.5 }] } }),
  b('fine-print', 'Fine print', { size: 4.5, weight: 400, align: 'center', color: 'auto', opacity: 0.8, letterSpacing: 0.5 }),
  b('outlined-label', 'Outlined label', { size: 8, weight: 700, uppercase: true, letterSpacing: 1, color: '#ffffff', fx: { stroke: { color: '#000000', width: 3, pos: 'outside' } } }),
  b('plate-caption', 'Plate caption', { size: 6, weight: 600, uppercase: true, letterSpacing: 1.5, color: '#f5f5f4', fx: { plate: { color: '#14121f', pad: 2, radius: 2, outline: { color: '#a8a29e', width: 1 } } } }),
];

/** A valid list from anything: ids and names checked, styles sanitised, capped. */
export function sanitizePresets(raw: unknown): TextPreset[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: TextPreset[] = [];
  for (const r of raw) {
    if (!isRec(r) || typeof r.id !== 'string' || !r.id || r.id.startsWith('builtin:') || seen.has(r.id) || !isRec(r.style)) continue;
    const name = cleanPresetName(r.name);
    if (!name) continue;
    seen.add(r.id);
    out.push({ id: r.id.slice(0, 64), name, style: sanitizeTextStyle(r.style, FONT_IDS) });
    if (out.length >= MAX_PRESETS) break;
  }
  return out;
}

/** The trimmed name, or '' when it is empty. Longer than the limit is cut. */
export function cleanPresetName(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().slice(0, MAX_PRESET_NAME).trim() : '';
}
