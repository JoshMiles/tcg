import { put, del } from '@vercel/blob';
import { toAnimatedCard, toThumb } from './card-image';
import { optimizedCardPaths } from './card-art';

const BLOB_HOST = /^https:\/\/[^/]+\.public\.blob\.vercel-storage\.com\//i;

export function isBlobUrl(url: string): boolean {
  return BLOB_HOST.test(url);
}

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
