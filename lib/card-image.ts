// Card art processing, shared by scripts/optimize-cards.mjs and the upload routes.
// Server/Node only (sharp). Browser-safe URL helpers live in ./card-art.ts.
import sharp from 'sharp';

export const CARD_WIDTH = 600;      // animated card width; cards render well below this even on 1440p streams
export const CARD_QUALITY = 75;
export const THUMB_WIDTH = 260;     // ~2x the largest grid tile
export const THUMB_QUALITY = 80;

type Input = Buffer | string;       // file contents or a path

/** Animated GIF → animated WebP (≈20 MB → ≈1–4 MB), keeping timing, looping and transparency. */
export function toAnimatedCard(input: Input): Promise<Buffer> {
  return sharp(input, { animated: true })
    .resize({ width: CARD_WIDTH, withoutEnlargement: true })
    .webp({ quality: CARD_QUALITY, effort: 4, smartSubsample: true })
    .toBuffer();
}

/** Static first-frame thumbnail (≈15 KB) for grids; the animated file loads on hover. */
export function toThumb(input: Input): Promise<Buffer> {
  return sharp(input, { page: 0 })
    .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
    .webp({ quality: THUMB_QUALITY, effort: 4 })
    .toBuffer();
}

export const COVER_WIDTH = 640;     // a pack cover is drawn ~290px wide (up to 3x per pack on the overlay); 640 covers retina
export const COVER_QUALITY = 82;

/** Pack cover → WebP at the standard width (animated covers stay animated; transparency is kept). */
export function toCover(input: Input): Promise<Buffer> {
  return sharp(input, { animated: true })
    .resize({ width: COVER_WIDTH, withoutEnlargement: true })
    .webp({ quality: COVER_QUALITY, effort: 5, smartSubsample: true })
    .toBuffer();
}
