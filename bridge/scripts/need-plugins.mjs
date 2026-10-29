// `npm run dist` stops here when a plugin the installer ships is missing (electron-builder skips a missing extraResources file without failing).
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const need = [
  ['streamdeck/dist/TCG Bridge.streamDeckPlugin', 'run "npm run deck" in bridge/'],
  ['obs-plugin/release/tcg-obs/bin/64bit/tcg-obs.dll', 'build it in obs-plugin/ (its README, Build) or download the tcg-obs-windows-x64 artifact into obs-plugin/release/tcg-obs'],
  ['obs-plugin/release/tcg-obs/data/locale/en-US.ini', 'the plugin folder has no data/ (a bad build or download)'],
];
const missing = need.filter(([f]) => !existsSync(join(root, f)));
for (const [f, how] of missing) console.error(`::error::Missing ${f}: ${how}.`);
process.exit(missing.length ? 1 : 0);
