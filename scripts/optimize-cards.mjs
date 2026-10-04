// Prepares card art for the web, using the same processing as admin uploads (lib/card-image.ts).
//   node scripts/optimize-cards.mjs [inputDir] [outputDir]
// 1. Converts animated GIFs in inputDir to animated WebP in outputDir (≈20 MB → ≈1–4 MB each).
// 2. Writes a small static thumbnail (first frame) for every WebP in outputDir to outputDir/thumb/.
//    Grids show thumbnails and only load the animated file on hover (see CardTile).
// Defaults: public/assets/GIF → public/assets/cards. Requires Node ≥ 22.18 (imports the .ts module directly).
// The GIF step is skipped when inputDir doesn't exist, so this also works as "regenerate thumbnails".
import { readdir, mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { toAnimatedCard, toThumb } from '../lib/card-image.ts';

const CONCURRENCY = 3;

const [inDir = 'public/assets/GIF', outDir = 'public/assets/cards'] = process.argv.slice(2);
const thumbDir = path.join(outDir, 'thumb');
await mkdir(thumbDir, { recursive: true });

const list = async (dir, ext) => {
  try { return (await readdir(dir)).filter(f => f.toLowerCase().endsWith(ext)); } catch { return []; }
};

async function pool(items, worker) {
  const queue = [...items];
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    for (let item; (item = queue.shift()); ) await worker(item);
  }));
}

// 1. GIF → animated WebP
const gifs = await list(inDir, '.gif');
let before = 0, after = 0;
await pool(gifs, async file => {
  const src = path.join(inDir, file);
  const dest = path.join(outDir, file.replace(/\.gif$/i, '.webp'));
  const buf = await toAnimatedCard(src);
  await writeFile(dest, buf);
  const a = await stat(src);
  before += a.size; after += buf.length;
  console.log(`${file.padEnd(28)} ${(a.size / 1e6).toFixed(1)}MB → ${(buf.length / 1e6).toFixed(2)}MB`);
});
if (gifs.length) console.log(`\n${gifs.length} GIFs: ${(before / 1e6).toFixed(0)}MB → ${(after / 1e6).toFixed(0)}MB\n`);

// 2. Static thumbnails (first frame of each animated WebP)
const webps = await list(outDir, '.webp');
let thumbBytes = 0;
await pool(webps, async file => {
  const buf = await toThumb(path.join(outDir, file));
  await writeFile(path.join(thumbDir, file), buf);
  thumbBytes += buf.length;
});
console.log(`${webps.length} thumbnails in ${thumbDir}: ${(thumbBytes / 1e3).toFixed(0)}KB total`);
