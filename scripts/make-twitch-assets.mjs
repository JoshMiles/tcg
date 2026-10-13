// Builds the Twitch extension's icon (100x100) and discovery image (300x200, opaque) in twitch-extension/ from the app icon
// (scripts/lib/brand-icon.mjs) and real card art. The screenshots (1024x768) are real captures of the panel, see
// docs/twitch-extension-submission.md for how they were made. Usage: node scripts/make-twitch-assets.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { NAVY, brandIcon } from './lib/brand-icon.mjs';

const OUT = 'twitch-extension';
mkdirSync(OUT, { recursive: true });

// ── icon: the app icon on the app's dark background, square and opaque ──
writeFileSync(`${OUT}/icon-100.png`, await sharp(await brandIcon(100, { ratio: 0.9, background: NAVY })).removeAlpha().png().toBuffer());

// ── discovery image: 300x200, no transparency, little text (Twitch shows it small in the Featured section) ──
const W = 300, H = 200;
const bg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#16204a"/><stop offset="1" stop-color="#070b1d"/></linearGradient>
    <radialGradient id="g" cx="0.68" cy="0.5" r="0.5"><stop offset="0" stop-color="#facc15" stop-opacity="0.38"/><stop offset="1" stop-color="#facc15" stop-opacity="0"/></radialGradient>
    <linearGradient id="s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#facc15"/><stop offset="0.25" stop-color="#fb7185"/><stop offset="0.5" stop-color="#c084fc"/><stop offset="0.75" stop-color="#38bdf8"/><stop offset="1" stop-color="#34d399"/></linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#b)"/><rect width="${W}" height="${H}" fill="url(#g)"/><rect width="${W}" height="6" fill="url(#s)"/>
</svg>`);

const CARDS = ['Goatlygidds', 'Onesiegidds', 'Cheesygidds']; // the middle one is a 5-star
const cardH = 128;
async function card(name, angle) {
  const art = await sharp(`public/assets/cards/thumb/${name}.webp`).resize({ height: cardH }).png().toBuffer();
  // a soft shadow under each card, then rotate the pair
  const { width } = await sharp(art).metadata();
  const shadow = await sharp({ create: { width: width + 24, height: cardH + 24, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: await sharp(art).ensureAlpha().tint('#000000').blur(5).png().toBuffer(), left: 12, top: 16 }]).png().toBuffer();
  const both = await sharp(shadow).composite([{ input: art, left: 12, top: 12 }]).png().toBuffer();
  return sharp(both).rotate(angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
}
const fan = [
  { input: await card(CARDS[0], -13), left: 128, top: 46 },
  { input: await card(CARDS[2], 13), left: 208, top: 40 },
  { input: await card(CARDS[1], 0), left: 168, top: 28 },
];

const icon = await brandIcon(84, { ratio: 1 });
let img = sharp(bg).composite([...fan, { input: icon, left: 22, top: 40 }]);
// the name, only if this machine can draw SVG text; the image is complete without it
const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="140" height="56"><text x="0" y="22" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="20" fill="#ffffff">The Cheesy</text><text x="0" y="46" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="20" fill="#fde047">TCG</text></svg>`);
try { img = sharp(await img.png().toBuffer()).composite([{ input: label, left: 18, top: 132 }]); } catch { /* no text support: icon and cards alone */ }
writeFileSync(`${OUT}/discovery-300x200.png`, await sharp(await img.flatten({ background: NAVY }).png().toBuffer()).removeAlpha().png().toBuffer());
console.log('wrote', `${OUT}/icon-100.png`, 'and', `${OUT}/discovery-300x200.png`);
