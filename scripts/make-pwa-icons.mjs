// Builds the home-screen icons in public/icons (and the iOS ones, public/apple-touch-icon*.png) from public/brand/icon.png: the mascot with a
// cheese-wedge badge (scripts/lib/brand-icon.mjs). Run once; the output is committed. Usage: node scripts/make-pwa-icons.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import screens from '../lib/iphone-screens.json' with { type: 'json' };
import { NAVY, SRC, brandIcon } from './lib/brand-icon.mjs';

const OUT = 'public/icons';

// "any": the artwork edge to edge on a transparent square.
for (const size of [192, 512]) await writeFile(`${OUT}/icon-${size}.png`, await brandIcon(size));
// Maskable (Android crops to a circle or squircle) and iOS (which fills transparency with black): the artwork on the app's dark
// background with a safe margin, badge included.
for (const size of [192, 512]) await writeFile(`${OUT}/maskable-${size}.png`, await brandIcon(size, { ratio: 0.66, background: NAVY }));
const apple = await brandIcon(180, { ratio: 0.86, background: NAVY });
for (const f of ['apple-touch-icon-v3', 'apple-touch-icon', 'apple-touch-icon-precomposed']) await writeFile(`public/${f}.png`, apple);
// iOS launch screens (apple-touch-startup-image, listed in app/layout.tsx): the mascot, a third of the width, centred on the app background.
// lib/iphone-screens.json lists [CSS width, CSS height, pixel ratio] per iPhone screen; each file is public/splash/<w>x<h>@<ratio>.png, in device pixels.
await mkdir('public/splash', { recursive: true });
for (const [w, h, r] of screens) {
  const mascot = await sharp(SRC).resize(Math.round((w * r) / 3), null, { kernel: 'lanczos3' }).png().toBuffer();
  await sharp({ create: { width: w * r, height: h * r, channels: 4, background: NAVY } }).composite([{ input: mascot, gravity: 'centre' }]).png().toFile(`public/splash/${w}x${h}@${r}.png`);
}
console.log('icons written to', OUT, 'and public/apple-touch-icon*.png, splash screens to public/splash');
