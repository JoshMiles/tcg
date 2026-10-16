// Profile accent colours (pure, client-safe). A custom colour is clamped in lightness so the header glow stays readable on the dark theme.

export const HEX_RE = /^#[0-9a-fA-F]{6}$/;
/** Lightness limits (0 to 1) of a custom accent: dark enough colours vanish into the page, pale ones wash the header out. */
export const ACCENT_MIN_L = 0.35;
export const ACCENT_MAX_L = 0.7;

function toHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}

function fromHsl(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r + m, g + m, b + m];
}

/** "#rrggbb" in any case → the same colour with its lightness held between ACCENT_MIN_L and ACCENT_MAX_L, lower-case. Null when it is not a 7-character hex colour. */
export function clampAccent(hex: string): string | null {
  if (!HEX_RE.test(hex)) return null;
  const n = parseInt(hex.slice(1), 16);
  const [h, s, l] = toHsl(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  const [r, g, b] = fromHsl(h, s, Math.min(ACCENT_MAX_L, Math.max(ACCENT_MIN_L, l)));
  const byte = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0');
  return `#${byte(r)}${byte(g)}${byte(b)}`;
}
