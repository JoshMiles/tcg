// node scripts/stitch-screenshot-tiles.cjs <out.png> <a> <b> <c> <d>
// Four 800x600 tiles of a 1024x768 page, captured with the page scrolled to (0,0), (224,0), (0,168) and (224,168), become one
// 1024x768 PNG. Each output pixel comes from exactly one tile (split at x=512, y=384), so animated art that differs between tiles
// never shows a seam through the middle of it.
const sharp = require(process.cwd() + '/node_modules/sharp');
const fs = require('fs');
const path = require('path');
const [out, a, b, c, d] = process.argv.slice(2);
(async () => {
  const cut = (file, left, top) => sharp(file).extract({ left, top, width: 512, height: 384 }).png().toBuffer();
  const parts = [
    { input: await cut(a, 0, 0), left: 0, top: 0 },       // page (0..512, 0..384) from the tile scrolled to (0,0)
    { input: await cut(b, 288, 0), left: 512, top: 0 },   // page (512..1024, 0..384): x - 224 = 288 in the tile scrolled to (224,0)
    { input: await cut(c, 0, 216), left: 0, top: 384 },   // page (0..512, 384..768): y - 168 = 216 in the tile scrolled to (0,168)
    { input: await cut(d, 288, 216), left: 512, top: 384 },
  ];
  const img = await sharp({ create: { width: 1024, height: 768, channels: 4, background: '#000' } }).composite(parts).flatten({ background: '#000' }).png().toBuffer();
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, img);
  const m = await sharp(img).metadata();
  console.log('wrote', out, m.width + 'x' + m.height);
})();
