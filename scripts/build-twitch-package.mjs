// Builds the Twitch extension's version assets zip (the file uploaded under the version's Asset Hosting) into twitch-extension/dist/.
// Usage: node scripts/build-twitch-package.mjs [--site https://cheesytcg.app]   (the site address defaults to $SITE_URL, then cheesytcg.app)
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildPackage, packageVersion } from './lib/twitch-package.mjs';

const arg = (name) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const site = (arg('--site') ?? process.env.SITE_URL ?? 'https://cheesytcg.app').replace(/\/$/, '');
if (!/^https:\/\/[^/]+$/.test(site)) { console.error(`The site address must be an https origin with no path, got "${site}".`); process.exit(1); }

const { files, zip } = buildPackage(site);
const out = `twitch-extension/dist/cheesy-tcg-panel-v${packageVersion()}.zip`;
mkdirSync('twitch-extension/dist', { recursive: true });
writeFileSync(out, zip);
console.log(`Wrote ${out} (${(zip.length / 1024).toFixed(1)} KB, ${files.length} files) for ${site}`);
for (const f of files) console.log('  ' + f.name.padEnd(22) + (f.data.length / 1024).toFixed(1).padStart(7) + ' KB');
