// Bundles src/plugin.ts and its dependencies into the plugin folder's bin/plugin.js (ES module, for Stream Deck's own Node.js).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bin = join(root, 'tv.cheesygidds.tcgbridge.sdPlugin', 'bin');
mkdirSync(bin, { recursive: true });

await build({
  entryPoints: [join(root, 'src', 'plugin.ts')],
  outfile: join(bin, 'plugin.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  sourcemap: false,
  // ws's optional speed-ups are not installed; without this the bundle would fail to resolve them.
  external: ['bufferutil', 'utf-8-validate'],
  // Bundled CommonJS packages (ws) call require() for Node built-ins.
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: 'info',
});
// The bin folder is an ES module package, whatever the folder above it says.
writeFileSync(join(bin, 'package.json'), '{ "type": "module" }\n');
