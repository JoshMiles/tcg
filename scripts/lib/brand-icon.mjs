// The app icon: the mascot with a gold cheese-wedge badge in the corner, so it reads as "The Cheesy TCG" at a glance. Shared by
// the home-screen icons (scripts/make-pwa-icons.mjs) and the Twitch extension art (scripts/make-twitch-assets.mjs).
import sharp from 'sharp';

export const SRC = 'public/brand/icon.png';
export const NAVY = '#0a0f1e';

/** The badge as an SVG: a gold disc with a navy ring and the site's cheese wedge glyph (the path is the `cheese` icon in app/components/Icon.tsx). */
export function badgeSvg(px) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 100 100">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fde047"/><stop offset="1" stop-color="#f59e0b"/></linearGradient></defs>
  <circle cx="50" cy="50" r="46" fill="url(#g)" stroke="${NAVY}" stroke-width="6"/>
  <g transform="translate(21 21.5) scale(2.4)" fill="none" stroke="#3a2606" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 17.5 21 9.2a1 1 0 0 0 .4-1.4l-1.5-2.4a1.5 1.5 0 0 0-1.7-.6L3 9.8V17.5Z"/>
    <path d="M3 17.5v1.7a1.3 1.3 0 0 0 1.3 1.3H19a2 2 0 0 0 2-2v-9.8"/>
    <circle cx="8.5" cy="14.2" r="1.1"/><circle cx="14.5" cy="12.4" r="1"/><circle cx="16" cy="17.2" r="1.2"/>
  </g>
</svg>`);
}

/**
 * The icon as a PNG buffer, `size` px square. `ratio` is how much of the square the artwork fills (1 = edge to edge on a transparent
 * square; less, with `background`, leaves a margin, which maskable and iOS icons need). The badge sits in the artwork's bottom-right.
 */
export async function brandIcon(size, { ratio = 1, background = null, badge = 0.4 } = {}) {
  const art = Math.round(size * ratio);
  const mascot = await sharp(SRC).resize(art, art, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: 'lanczos3' })
    .sharpen({ sigma: 0.7 }).png().toBuffer();
  const b = Math.round(art * badge);
  const off = Math.round((size - art) / 2);
  const badgeX = off + art - b - Math.round(art * 0.01);
  const badgeY = off + art - b - Math.round(art * 0.01);
  const base = sharp({ create: { width: size, height: size, channels: 4, background: background ?? { r: 0, g: 0, b: 0, alpha: 0 } } });
  return base.composite([
    { input: mascot, left: off, top: off },
    { input: await sharp(badgeSvg(b)).png().toBuffer(), left: badgeX, top: badgeY },
  ]).png().toBuffer();
}
