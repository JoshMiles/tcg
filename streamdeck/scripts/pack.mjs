// Validates and packs the plugin folder into dist/TCG Bridge.streamDeckPlugin with Elgato's own CLI, with no prompts (it runs in CI too).
import { execFileSync } from 'node:child_process';
import { mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const uuid = 'tv.cheesygidds.tcgbridge';
const dist = join(root, 'dist');
const cli = join(root, 'node_modules', '@elgato', 'cli', 'bin', 'streamdeck.mjs');
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const run = (...args) => execFileSync(process.execPath, [cli, ...args, '--no-update-check'], { cwd: root, stdio: 'inherit' });
run('validate', `${uuid}.sdPlugin`);
run('pack', `${uuid}.sdPlugin`, '--output', dist, '--force');
renameSync(join(dist, `${uuid}.streamDeckPlugin`), join(dist, 'TCG Bridge.streamDeckPlugin'));
console.log('Packed dist/TCG Bridge.streamDeckPlugin');
