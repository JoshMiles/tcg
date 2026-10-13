// Builds the home-screen icons in public/icons from public/brand/icon.png (run once; the output is committed).
// Usage: node scripts/make-pwa-icons.mjs
import sharp from 'sharp';

const SRC = 'public/brand/icon.png';
const BG = '#0a0f1e';
const OUT = 'public/icons';

// Icon on a transparent square ("any").
async function plain(size, file) {
  await sharp(SRC).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: 'lanczos3' }).png().toFile(`${OUT}/${file}`);
}
// Icon on the app's dark background with a safe margin (maskable icons get cropped to a circle / squircle; iOS fills transparency with black).
async function padded(size, ratio, file) {
  const inner = Math.round(size * ratio);
  const icon = await sharp(SRC).resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: 'lanczos3' }).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: icon, gravity: 'centre' }]).png().toFile(`${OUT}/${file}`);
}

await plain(192, 'icon-192.png');
await plain(512, 'icon-512.png');
await padded(512, 0.62, 'maskable-512.png');
await padded(192, 0.62, 'maskable-192.png');
await padded(180, 0.82, '../../app/apple-icon.png'); // the iOS home-screen icon, via Next's file convention
console.log('icons written to', OUT);
