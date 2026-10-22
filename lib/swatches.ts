import { kv } from './db';

// Saved colour swatches for the Overlay Editor and the card back editor: staff-wide, one KV key beside the overlay settings.
const KEY = 'overlay:swatches';
export const MAX_SWATCHES = 24;

/** Keeps `#rrggbb` strings only (lowercased, unique), capped. */
export function sanitizeSwatches(v: unknown): string[] {
  const list = Array.isArray(v) ? v : [];
  return [...new Set(list.filter((c): c is string => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)).map(c => c.toLowerCase()))].slice(0, MAX_SWATCHES);
}

export async function getSavedSwatches(): Promise<string[]> {
  return sanitizeSwatches(await kv.get(KEY).catch(() => null));
}

export async function saveSwatches(v: unknown): Promise<string[]> {
  const clean = sanitizeSwatches(v);
  await kv.set(KEY, clean);
  return clean;
}

/** `#rrggbb`, `rgb(r,g,b)` or `rgba(...)` to `#rrggbb`; null otherwise. */
export function toHex(c: string): string | null {
  if (/^#[0-9a-f]{6}$/i.test(c)) return c.toLowerCase();
  const m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(c);
  return m ? '#' + [m[1], m[2], m[3]].map(n => Math.min(255, Number(n)).toString(16).padStart(2, '0')).join('') : null;
}
