// The text formatting row's data (ROADMAP 38.31): one value per control, shared by the Overlay Editor and (later) the card back editor.
import { clearTextPatch, editTextPatch, shownTextStyle, type TextPatch } from './overlay-text-style';
import type { CustomText } from './overlay-custom';

export const MIXED = 'mixed' as const;
export interface TextFormat {
  font?: string; size?: number; color?: string;
  bold?: boolean; italic?: boolean; underline?: boolean;
  align?: 'left' | 'center' | 'right';
  valign?: 'top' | 'middle' | 'bottom';
  /** Highlight tokens: on or off, and its colour (a hex or `accent`). */
  highlight?: boolean; highlightColor?: string;
}
/** What the row shows: a control appears when its key is present; MIXED where several layers differ. */
export type TextFormatValue = { [K in keyof TextFormat]?: TextFormat[K] | typeof MIXED };

/** Folds the formats of several layers into one: a key present in all and equal keeps its value, present and different becomes MIXED, absent in any is dropped. */
export function mixedFormat(list: TextFormat[]): TextFormatValue {
  const out: Record<string, unknown> = {};
  if (!list.length) return out;
  for (const k of Object.keys(list[0]) as (keyof TextFormat)[]) {
    if (list.some(f => f[k] === undefined)) continue;
    out[k] = list.every(f => f[k] === list[0][k]) ? list[0][k] : MIXED;
  }
  return out as TextFormatValue;
}

// The style half of a format (B / I / U, align, Highlight tokens) over a TextPatch: the same edits the Character panel makes, through the same helpers.
export function formatOfPatch(inherited: TextPatch | undefined, own: TextPatch | undefined): TextFormat {
  const s = shownTextStyle(inherited, own);
  const a = { ...inherited?.accent, ...own?.accent };
  return { bold: s.weight >= 600, italic: s.italic, underline: s.underline, align: s.align === 'justify' ? 'left' : s.align, highlight: !!(inherited?.accent || own?.accent) && a.on !== false, highlightColor: a.color ?? 'accent' };
}

export function applyToPatch(inherited: TextPatch | undefined, own: TextPatch, p: TextFormat): TextPatch {
  let out = own;
  const ch: Record<string, unknown> = {};
  if (p.bold !== undefined) ch.weight = p.bold ? 700 : 400;
  if (p.italic !== undefined) ch.italic = p.italic;
  if (p.underline !== undefined) ch.underline = p.underline;
  if (p.align !== undefined) ch.align = p.align;
  if (Object.keys(ch).length) out = editTextPatch(out, shownTextStyle(inherited, out), ch);
  if (p.highlight !== undefined || p.highlightColor !== undefined) {
    const a = { ...inherited?.accent, ...out.accent };
    const has = !!(inherited?.accent || out.accent);
    const on = p.highlight === undefined ? a.on : p.highlight ? true : has ? false : undefined;
    const next = p.highlight === false && !has ? undefined : { ...a, ...(on === undefined ? {} : { on }), ...(p.highlightColor === undefined ? {} : { color: p.highlightColor }) };
    out = next ? { ...out, accent: next } : clearTextPatch(out, 'accent');
  }
  return out;
}

type CustomTextFields = Pick<CustomText, 'font' | 'size' | 'color' | 'valign' | 'style'>;
export const customTextFormat = (c: CustomTextFields): TextFormat => ({ font: c.font, size: c.size, color: c.color, valign: c.valign, ...formatOfPatch(undefined, c.style) });

/** A custom text layer (or the Text tool's defaults) after one change from the row. */
export function applyCustomText<T extends CustomTextFields>(c: T, p: TextFormat): T {
  const out = { ...c, style: applyToPatch(undefined, c.style, p) };
  if (p.font !== undefined) out.font = p.font;
  if (p.size !== undefined) out.size = p.size; // not clamped here: typing "36" passes through 3 (the layout sanitiser clamps on save)
  if (p.color !== undefined) out.color = p.color;
  if (p.valign !== undefined) out.valign = p.valign;
  return out;
}
