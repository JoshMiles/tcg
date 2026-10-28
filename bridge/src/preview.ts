// The Preview overlay window's pure parts (ROADMAP 57.10): the OBS canvas size to draw at, and the address to load. Plain TypeScript, no Electron.

export interface Canvas { width: number; height: number }
export const DEFAULT_CANVAS: Canvas = { width: 1920, height: 1080 };

/** The canvas OBS reported (GetVideoSettings baseWidth / baseHeight), or 1920x1080 when OBS said nothing usable. */
export function cleanCanvas(width: unknown, height: unknown): Canvas {
  const ok = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 100 && n <= 16384;
  return ok(width) && ok(height) ? { width, height } : { ...DEFAULT_CANVAS };
}

/** `/overlay.html?pk=<48 hex>` is the only path the site may hand over; anything else (another page, another host) is not loaded. */
const PREVIEW_PATH = /^\/overlay\.html\?pk=[a-f0-9]{48}$/;

/** The full address on the paired site, or null when the site's answer is not the preview page. */
export function previewAddress(base: string, path: unknown): string | null {
  return typeof path === 'string' && PREVIEW_PATH.test(path) ? `${base}${path}` : null;
}

/** May a frame in the preview window go to this address? Only the paired site's own overlay page. */
export function previewFrameAllowed(base: string, url: string): boolean {
  try {
    const u = new URL(url), b = new URL(base);
    return u.origin === b.origin && u.pathname === '/overlay.html';
  } catch {
    return false;
  }
}
