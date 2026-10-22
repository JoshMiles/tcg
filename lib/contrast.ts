// WCAG contrast for the Overlay Editor's readability check (ROADMAP 38.26). Pure and client-safe.

export type RGB = [number, number, number];

export const WCAG_MIN = 3;

/** `#rgb` or `#rrggbb` to channels; anything else is null. */
export function parseHex(h: string): RGB | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(h.trim());
  if (!m) return null;
  const s = m[1].length === 3 ? m[1].replace(/./g, c => c + c) : m[1];
  return [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16)) as RGB;
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance([r, g, b]: RGB): number {
  const f = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** WCAG contrast ratio, 1 to 21. */
export function contrastRatio(a: RGB, b: RGB): number {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Black or white, whichever reads better on `bg`. */
export const inkFor = (bg: RGB): '#000000' | '#ffffff' => (contrastRatio([0, 0, 0], bg) >= contrastRatio([255, 255, 255], bg) ? '#000000' : '#ffffff');

/**
 * The worst contrast of `text` over a grid of samples (5 x 5) inside `box` of an RGBA pixel buffer `w` x `h`.
 * The box is in the buffer's pixels; the part outside the buffer is ignored. Null when the box is off the buffer.
 */
export function worstContrast(text: RGB, rgba: ArrayLike<number>, w: number, h: number, box: { x: number; y: number; w: number; h: number }): number | null {
  const x0 = Math.max(0, box.x), x1 = Math.min(w - 1, box.x + box.w), y0 = Math.max(0, box.y), y1 = Math.min(h - 1, box.y + box.h);
  if (x1 < x0 || y1 < y0) return null;
  let worst = Infinity;
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
    const px = Math.round(x0 + ((x1 - x0) * i) / 4), py = Math.round(y0 + ((y1 - y0) * j) / 4), k = (py * w + px) * 4;
    worst = Math.min(worst, contrastRatio(text, [rgba[k], rgba[k + 1], rgba[k + 2]]));
  }
  return worst;
}
