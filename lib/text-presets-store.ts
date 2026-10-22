import { kv } from './db';
import { MAX_PRESETS, cleanPresetName, sanitizePresets, type TextPreset } from './text-presets';
import { FONT_IDS } from './card-back';
import { sanitizeTextStyle } from './text-style';

// The custom text style presets, staff-wide, in one key beside the card back settings. Built-ins live in code (`BUILTIN_TEXT_PRESETS`).
const KEY = 'textpresets';

/** The saved presets. Never throws: a read failure gives none. */
export async function getTextPresets(): Promise<TextPreset[]> {
  try { return sanitizePresets(await kv.get<unknown>(KEY)); } catch { return []; }
}

/** Saves a style under a name (1 to 40 chars; the same name replaces that preset). Throws on a bad name or a full list. */
export async function saveTextPreset(name: unknown, style: unknown): Promise<TextPreset[]> {
  const n = cleanPresetName(name);
  if (!n) throw new Error('Give the preset a name');
  const list = await getTextPresets();
  const clean = sanitizeTextStyle(style && typeof style === 'object' ? (style as Record<string, unknown>) : {}, FONT_IDS);
  const at = list.findIndex(p => p.name.toLowerCase() === n.toLowerCase());
  if (at >= 0) list[at] = { ...list[at], name: n, style: clean };
  else {
    if (list.length >= MAX_PRESETS) throw new Error(`At most ${MAX_PRESETS} presets`);
    list.push({ id: crypto.randomUUID(), name: n, style: clean });
  }
  await kv.set(KEY, list);
  return list;
}

/** Removes a custom preset; a built-in id (or an unknown one) changes nothing. */
export async function deleteTextPreset(id: string): Promise<TextPreset[]> {
  const list = await getTextPresets();
  const next = list.filter(p => p.id !== id);
  if (next.length !== list.length) await kv.set(KEY, next);
  return next;
}
