// Builds the home-screen icons in public/icons (and the iOS one, app/apple-icon.png) from public/brand/icon.png: the mascot with a
// cheese-wedge badge (scripts/lib/brand-icon.mjs). Run once; the output is committed. Usage: node scripts/make-pwa-icons.mjs
import { writeFile } from 'node:fs/promises';
import { NAVY, brandIcon } from './lib/brand-icon.mjs';

const OUT = 'public/icons';

// "any": the artwork edge to edge on a transparent square.
for (const size of [192, 512]) await writeFile(`${OUT}/icon-${size}.png`, await brandIcon(size));
// Maskable (Android crops to a circle or squircle) and iOS (which fills transparency with black): the artwork on the app's dark
// background with a safe margin, badge included.
for (const size of [192, 512]) await writeFile(`${OUT}/maskable-${size}.png`, await brandIcon(size, { ratio: 0.66, background: NAVY }));
await writeFile('app/apple-icon.png', await brandIcon(180, { ratio: 0.86, background: NAVY }));
console.log('icons written to', OUT, 'and app/apple-icon.png');
