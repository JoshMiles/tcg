// Checks the chosen still frame of an animated card: the fallback chain (cardStill / stillFor), the URL guard the frame picker
// relies on, and cutting frames from a bundled animated card with sharp. Blob writes are not exercised (they need a store).
// Run: npx tsx scripts/check-card-still.mts
import { readFile } from 'fs/promises';

const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const art = await import('../lib/card-art');
const img = await import('../lib/card-image');
const frames = await import('../lib/card-frames');

const BLOB = 'https://abc123.public.blob.vercel-storage.com';
const uuid = '0b9f6e0e-1111-4222-8333-444455556666';
const card = { imageUrl: `${BLOB}/cards/${uuid}.webp`, fullArtImageUrl: `${BLOB}/cards/${uuid.replace('0b9f', '1c9f')}.webp` };

// ── the fallback chain ──
ok(art.cardStill(card) === `${BLOB}/cards/${uuid}.thumb.webp`, 'no chosen still: the thumbnail (first frame)');
ok(art.cardStill({ ...card, stillUrl: `${BLOB}/cards/x.still-7.webp` }) === `${BLOB}/cards/x.still-7.webp`, 'a chosen still wins');
ok(art.cardStill(card, 'fullArt').endsWith('.thumb.webp'), 'full art falls back to its own thumbnail');
ok(art.cardStill({ ...card, fullArtStillUrl: 'F' }, 'fullArt') === 'F' && art.cardStill({ ...card, fullArtStillUrl: 'F' }) !== 'F', 'the full-art still only applies to the full-art image');
ok(art.cardStill({ imageUrl: '/assets/cards/Angrygidds.webp', stillUrl: 'S' }) === 'S', 'a bundled card can have a still too');
ok(art.cardStill({ imageUrl: '/assets/cards/Angrygidds.webp' }) === '/assets/cards/thumb/Angrygidds.webp', 'and falls back to the bundled thumbnail');
ok(art.stillFor({ ...card, stillUrl: 'S', fullArtStillUrl: 'F' }, card.imageUrl) === 'S', 'stillFor: the normal image gets stillUrl');
ok(art.stillFor({ ...card, stillUrl: 'S', fullArtStillUrl: 'F' }, card.fullArtImageUrl) === 'F', 'stillFor: the full-art image gets fullArtStillUrl');
ok(art.stillFor({ ...card, stillUrl: 'S' }, 'https://elsewhere.test/a.png') === 'https://elsewhere.test/a.png', 'stillFor: unrelated art is left alone');
ok(art.stillFor({}, card.imageUrl).endsWith('.thumb.webp'), 'stillFor with no card fields is the plain thumbnail');

// ── the URL guard ──
ok(art.isFrameSourceUrl('/assets/cards/Angrygidds.webp'), 'a bundled card is allowed');
ok(art.isFrameSourceUrl(card.imageUrl), 'a card file in Blob is allowed');
for (const bad of [
  '', 'https://evil.test/cards/a.webp', 'http://localhost:3000/assets/cards/a.webp', '/assets/cards/../../.env.local', '/assets/cards/thumb/a.webp',
  '/assets/cards/a.gif', `${BLOB}/other/${uuid}.webp`, `https://${'abc'}.public.blob.vercel-storage.com.evil.test/cards/a.webp`,
  `${BLOB}/cards/..%2f..%2fa.webp`, `${BLOB}/cards/a.webp?x=https://evil.test`, '//evil.test/assets/cards/a.webp', '/assets/cards/a.webp#x',
]) ok(!art.isFrameSourceUrl(bad), `refused: ${bad}`);
ok((await frames.loadFrameSource('https://evil.test/cards/a.webp')) === null, 'the loader never fetches a refused URL');
ok((await frames.loadFrameSource('/assets/cards/../../package.json')) === null, 'the loader never reads outside the cards folder');
ok(art.stillBlobPath('id', 12) === 'cards/id.still-12.webp', 'a still is stored under its own name, never the thumbnail name');
ok(art.cardThumbUrl(`${BLOB}/cards/${uuid}.still-12.webp`) === `${BLOB}/cards/${uuid}.still-12.webp`, 'a still name is not mistaken for card art');

// ── cutting frames ──
const file = await frames.loadFrameSource('/assets/cards/Angrygidds.webp');
ok(file && file.length > 0, 'the bundled card loads');
const info = await img.frameInfo(file!);
ok(info.frames > 8 && info.delayMs > 0, `an animated card reports its frames (${info.frames}) and delay (${info.delayMs}ms)`);
const f0 = await img.renderFrame(file!, 0);
const f20 = await img.renderFrame(file!, 20);
ok(f0.length > 0 && f20.length > 0 && !f0.equals(f20), 'different frames render differently');
const meta = await (await import('sharp')).default(f20).metadata();
ok(meta.format === 'webp' && meta.width === img.THUMB_WIDTH && (meta.pages ?? 1) === 1, 'a frame is a still webp at thumbnail width');
ok(f0.equals(await img.toThumb(await readFile('public/assets/cards/Angrygidds.webp'))), 'frame 0 is exactly the usual first-frame thumbnail');
console.log('ok');
