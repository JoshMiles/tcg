// Draws the app icon and the three tray icons from the site's own icon (public/brand/icon.png). Run from bridge/: npm run icons
// Writes build/icon.png (256, for electron-builder, which turns it into the .ico), renderer/icon.png (256, for the windows) and assets/tray-*.png (32).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const root = join(__dirname, '..');
const png = (svg: string, size: number): Buffer => Buffer.from(new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng());

// shortcut: the site's icon is 224 px, so the 256 px app icon is slightly upscaled; use a bigger original when there is one.
const brand = `data:image/png;base64,${readFileSync(join(root, '..', 'public', 'brand', 'icon.png')).toString('base64')}`;
// The icon with rounded corners, like the site's BrandMark, on a 32 unit canvas, plus an optional badge.
const svg = (badge = '') => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 32 32" width="32" height="32">
  <clipPath id="r"><rect width="32" height="32" rx="6"/></clipPath>
  <image width="32" height="32" clip-path="url(#r)" xlink:href="${brand}" href="${brand}"/>${badge}
</svg>`;

// A dot, a half-filled dot and a cross: the three states differ by shape as well as colour.
const BADGES = {
  connected: '<circle cx="24.5" cy="24.5" r="7" fill="#0a0f21"/><circle cx="24.5" cy="24.5" r="5.6" fill="#4ade80"/>',
  partly: '<circle cx="24.5" cy="24.5" r="7" fill="#0a0f21"/><circle cx="24.5" cy="24.5" r="4.8" fill="#0a0f21" stroke="#fbbf24" stroke-width="1.8"/><path d="M24.5 19.7 A4.8 4.8 0 0 0 24.5 29.3 Z" fill="#fbbf24"/>',
  offline: '<circle cx="24.5" cy="24.5" r="7" fill="#0a0f21"/><circle cx="24.5" cy="24.5" r="5.6" fill="#ee3b3b"/><path d="M22 22 L27 27 M27 22 L22 27" stroke="#fff" stroke-width="1.9" stroke-linecap="round"/>',
};

writeFileSync(join(root, 'build', 'icon.png'), png(svg(), 256));
writeFileSync(join(root, 'renderer', 'icon.png'), png(svg(), 256));
for (const [level, badge] of Object.entries(BADGES)) writeFileSync(join(root, 'assets', `tray-${level}.png`), png(svg(badge), 32));
console.log('Icons written');
