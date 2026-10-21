// Loading the back's curated fonts in the browser (ROADMAP 20.3a). A font is fetched only when a back on the page uses it; the files are
// self-hosted in /public/fonts/back (OFL, licences beside them), so nothing calls a font service at runtime. Client-only (needs `document`).
import { BACK_FONTS, nearestWeight } from './card-back';

const requested = new Set<string>();

/**
 * Starts loading one weight of a curated font (a no-op for the site's own fonts, outside a browser, or when already requested). A variable
 * font loads once with a weight range; a static one loads the file nearest the weight. `italic` loads the true italic where the family has one.
 */
export function loadBackFont(id: string, weight: number, italic = false): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return Promise.resolve();
  const f = BACK_FONTS.find(x => x.id === id);
  if (!f?.files) return Promise.resolve();
  const family = /'([^']+)'/.exec(f.css)?.[1];
  const w = nearestWeight(f, weight);
  const slanted = italic && !!f.italicFile;
  const key = `${id}:${f.variable ? 'var' : w}:${slanted ? 'i' : ''}`;
  if (!family || requested.has(key)) return Promise.resolve();
  requested.add(key);
  const file = slanted ? f.italicFile! : f.files[w];
  const range = f.variable ? `${f.weights[0]} ${f.weights[f.weights.length - 1]}` : String(w);
  const face = new FontFace(family, `url(/fonts/back/${file}) format('woff2')`, { weight: range, style: slanted ? 'italic' : 'normal', display: 'swap' });
  document.fonts.add(face);
  return face.load().then(() => undefined, () => { requested.delete(key); });
}

/** Resolves when every font the design needs has loaded (for the canvas renderer, which must not draw before they have). */
export async function loadBackFonts(fonts: { id: string; weight: number; italic?: boolean }[]): Promise<void> {
  await Promise.all(fonts.map(f => loadBackFont(f.id, f.weight, f.italic)));
}
