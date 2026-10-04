// Converts animated card GIFs to animated WebP (≈20 MB → ≈1 MB each).
//   node scripts/optimize-cards.mjs [inputDir] [outputDir]
// Defaults: public/assets/GIF → public/assets/cards. Requires `sharp` (devDependency).
import { readdir, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const WIDTH = 600;     // cards render well below this even on 1440p streams
const QUALITY = 75;
const CONCURRENCY = 3;

const [inDir = 'public/assets/GIF', outDir = 'public/assets/cards'] = process.argv.slice(2);
await mkdir(outDir, { recursive: true });

const files = (await readdir(inDir)).filter(f => f.toLowerCase().endsWith('.gif'));
let before = 0, after = 0;

async function convert(file) {
  const src = path.join(inDir, file);
  const dest = path.join(outDir, file.replace(/\.gif$/i, '.webp'));
  await sharp(src, { animated: true })
    .resize({ width: WIDTH, withoutEnlargement: true })
    .webp({ quality: QUALITY, effort: 4, smartSubsample: true })
    .toFile(dest);
  const [a, b] = await Promise.all([stat(src), stat(dest)]);
  before += a.size; after += b.size;
  console.log(`${file.padEnd(28)} ${(a.size / 1e6).toFixed(1)}MB → ${(b.size / 1e6).toFixed(2)}MB`);
}

const queue = [...files];
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  for (let f; (f = queue.shift()); ) await convert(f);
}));

console.log(`\n${files.length} files: ${(before / 1e6).toFixed(0)}MB → ${(after / 1e6).toFixed(0)}MB`);
