/**
 * Static thumbnail for a card image, or the original URL when none exists.
 *  - Bundled cards:   /assets/cards/X.webp        → /assets/cards/thumb/X.webp
 *  - Admin uploads:   …/cards/<uuid>.webp (Blob)  → …/cards/<uuid>.thumb.webp
 * Everything else (external URLs, non-optimized uploads) has no thumbnail.
 * Browser-safe: no sharp or server imports here.
 */
export function cardThumbUrl(imageUrl: string): string {
  return imageUrl
    .replace(/^\/assets\/cards\/([^/]+\.webp)$/i, '/assets/cards/thumb/$1')
    .replace(/^(https:\/\/[^/]+\.public\.blob\.vercel-storage\.com\/cards\/[0-9a-f-]{36})\.webp$/i, '$1.thumb.webp');
}

/** Blob paths for an optimized upload and its thumbnail; keep in sync with cardThumbUrl. */
export function optimizedCardPaths(id: string): { full: string; thumb: string } {
  return { full: `cards/${id}.webp`, thumb: `cards/${id}.thumb.webp` };
}
