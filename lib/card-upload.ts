import { put, del } from '@vercel/blob';
import { toAnimatedCard, toThumb } from './card-image';
import { optimizedCardPaths, isBlobUrl, stillBlobPath } from './card-art';

export { isBlobUrl };

/**
 * Optimizes a GIF and stores the animated WebP plus a static thumbnail in Blob.
 * Names are deterministic from a fresh UUID so cardThumbUrl() can derive the thumbnail URL.
 */
export async function storeOptimizedCard(gif: Buffer): Promise<{ url: string; thumbUrl: string; bytes: number }> {
  const [full, thumb] = await Promise.all([toAnimatedCard(gif), toThumb(gif)]);
  const paths = optimizedCardPaths(crypto.randomUUID());
  const opts = { access: 'public', addRandomSuffix: false, contentType: 'image/webp', cacheControlMaxAge: 31536000 } as const;
  const [fullBlob, thumbBlob] = await Promise.all([put(paths.full, full, opts), put(paths.thumb, thumb, opts)]);
  return { url: fullBlob.url, thumbUrl: thumbBlob.url, bytes: full.length };
}

/** Best-effort removal of a temporary upload. */
export async function deleteBlobQuietly(url: string): Promise<void> {
  try { await del(url); } catch { /* an orphaned temp blob is harmless */ }
}

/** Stores one rendered frame as a card's still (a new Blob name each time, so a CDN never serves an older still). */
export async function storeStill(webp: Buffer, frame: number): Promise<string> {
  const blob = await put(stillBlobPath(crypto.randomUUID(), frame), webp, { access: 'public', addRandomSuffix: false, contentType: 'image/webp', cacheControlMaxAge: 31536000 });
  return blob.url;
}
