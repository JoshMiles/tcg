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

/** The fields cardStill() reads; any card shape that carries them works. */
export interface StillFields { imageUrl: string; fullArtImageUrl?: string; stillUrl?: string; fullArtStillUrl?: string }

/** The static image to show for a card's art: the chosen still frame if there is one, else the thumbnail (the first frame). `which` picks the normal or the full-art image. */
export function cardStill(card: StillFields, which: 'art' | 'fullArt' = 'art'): string {
  if (which === 'fullArt') return card.fullArtStillUrl || cardThumbUrl(card.fullArtImageUrl ?? card.imageUrl);
  return card.stillUrl || cardThumbUrl(card.imageUrl);
}

/** The same for a given art URL of a card (the full-art image, or the normal one): the chosen still for that image, else its thumbnail. */
export function stillFor(card: Partial<StillFields>, url: string): string {
  if (card.stillUrl && url === card.imageUrl) return card.stillUrl;
  if (card.fullArtStillUrl && url === card.fullArtImageUrl) return card.fullArtStillUrl;
  return cardThumbUrl(url);
}

/**
 * True for art the frame picker may read: a bundled card (/assets/cards/<name>.webp) or a card file in this project's Blob store
 * (cards/<name>.webp). Anything else (other hosts, other folders, path tricks) is refused, since the server fetches the URL.
 */
export function isFrameSourceUrl(url: string): boolean {
  if (/^\/assets\/cards\/[A-Za-z0-9 _.()-]+\.webp$/i.test(url) && !url.includes('..')) return true;
  return /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/cards\/[A-Za-z0-9._-]+\.webp$/i.test(url) && !url.includes('..');
}

/** Blob path for a chosen still; the frame number and a fresh id keep it a new URL every time, so a CDN never serves an older still. */
export function stillBlobPath(id: string, frame: number): string {
  return `cards/${id}.still-${frame}.webp`;
}

/** Blob paths for an optimized upload and its thumbnail; keep in sync with cardThumbUrl. */
export function optimizedCardPaths(id: string): { full: string; thumb: string } {
  return { full: `cards/${id}.webp`, thumb: `cards/${id}.thumb.webp` };
}

/** True for files in this project's Vercel Blob store. */
const BLOB_HOST = /^https:\/\/[^/]+\.public\.blob\.vercel-storage\.com\//i;
export function isBlobUrl(url: string): boolean {
  return BLOB_HOST.test(url);
}
