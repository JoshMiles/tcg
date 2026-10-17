// Loading the back's curated fonts in the browser (ROADMAP 20.3a). A font is fetched only when a back on the page uses it; the files are
// self-hosted in /public/fonts/back (OFL, licences beside them), so nothing calls a font service at runtime. Client-only (needs `document`).
import { BACK_FONTS } from './card-back';

const requested = new Set<string>();

/** Starts loading one weight of a curated font (a no-op for the site's own fonts, outside a browser, or when already requested). */
export function loadBackFont(id: string, weight: number): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return Promise.resolve();
  const f = BACK_FONTS.find(x => x.id === id);
  if (!f?.files) return Promise.resolve();
  const have = Object.keys(f.files).map(Number);
  const w = have.reduce((best, n) => (Math.abs(n - weight) < Math.abs(best - weight) ? n : best), have[0]);
  const key = `${id}:${w}`;
  const family = /'([^']+)'/.exec(f.css)?.[1];
  if (!family || requested.has(key)) return Promise.resolve();
  requested.add(key);
  const face = new FontFace(family, `url(/fonts/back/${f.files[w]}) format('woff2')`, { weight: String(w), display: 'swap' });
  document.fonts.add(face);
  return face.load().then(() => undefined, () => { requested.delete(key); });
}

/** Resolves when every font the design needs has loaded (for the canvas renderer, which must not draw before they have). */
export async function loadBackFonts(fonts: { id: string; weight: number }[]): Promise<void> {
  await Promise.all(fonts.map(f => loadBackFont(f.id, f.weight)));
}
