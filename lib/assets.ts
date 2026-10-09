import { list, del } from '@vercel/blob';
import { listAllPacks, getPackCards } from './kv';
import { cardThumbUrl, isBlobUrl } from './card-art';

// Server-side data for the admin Assets page: every file the game references (card art, pack
// covers, sounds) with size/health info, plus files sitting in Blob storage that nothing uses.

export type AssetKind = 'card-art' | 'pack-cover' | 'sound';

export type AssetOrigin =
  | { kind: 'pack-cover'; packId: string; packName: string }
  | { kind: 'card-art' | 'sound'; packId: string; packName: string; cardId: string; cardName: string; cardNumber: number };

export type AssetIssue =
  | 'legacy-gif'        // still a (large) GIF — re-upload to get the optimized WebP
  | 'missing'           // the URL doesn't resolve
  | 'no-thumbnail'      // card art whose static thumbnail is missing (grids would show a broken image)
  | 'heavy';            // unusually large for its type

export interface LibraryAsset {
  url: string;
  kind: AssetKind;
  origin: AssetOrigin;
  format: string;               // e.g. "WebP", "GIF", "PNG", "MP3"
  bytes: number | null;         // null when we couldn't determine it (external URLs)
  issues: AssetIssue[];
  optimized: boolean;           // card art served as WebP with a thumbnail
}

export interface UnusedBlob {
  url: string;
  pathname: string;
  bytes: number;
  uploadedAt: string;           // ISO
  format: string;
}

export interface AssetLibrary {
  assets: LibraryAsset[];
  unused: UnusedBlob[];
  blobConnected: boolean;       // false when Blob storage isn't configured/reachable
}

const HEAVY_BYTES = 8 * 1024 * 1024;
const RECENT_MS = 10 * 60 * 1000;  // don't call a just-uploaded file "unused" (it may be mid-optimize)

export function formatOf(url: string): string {
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  return ({ webp: 'WebP', gif: 'GIF', png: 'PNG', jpg: 'JPEG', jpeg: 'JPEG', svg: 'SVG', mp3: 'MP3', wav: 'WAV', ogg: 'OGG', m4a: 'M4A', webm: 'WebM' } as Record<string, string>)[ext] ?? (ext.toUpperCase() || 'File');
}

/** Every URL referenced by a pack or card, plus the thumbnails that ride along with card art. */
async function collectReferenced() {
  const packs = await listAllPacks();
  const cardLists = await Promise.all(packs.map(p => getPackCards(p.id)));
  const refs: { url: string; kind: AssetKind; origin: AssetOrigin }[] = [];

  packs.forEach((pack, i) => {
    if (pack.coverImageUrl) refs.push({ url: pack.coverImageUrl, kind: 'pack-cover', origin: { kind: 'pack-cover', packId: pack.id, packName: pack.name } });
    for (const card of cardLists[i]) {
      const base = { packId: pack.id, packName: pack.name, cardId: card.id, cardName: card.name, cardNumber: card.number };
      if (card.imageUrl) refs.push({ url: card.imageUrl, kind: 'card-art', origin: { kind: 'card-art', ...base } });
      if (card.soundUrl) refs.push({ url: card.soundUrl, kind: 'sound', origin: { kind: 'sound', ...base } });
    }
  });

  const referenced = new Set<string>();
  for (const r of refs) {
    referenced.add(r.url);
    if (r.kind === 'card-art') referenced.add(cardThumbUrl(r.url)); // companion thumbnail
  }
  return { refs, referenced };
}

async function listAllBlobs(): Promise<{ connected: boolean; blobs: { url: string; pathname: string; size: number; uploadedAt: Date }[] }> {
  try {
    const blobs: { url: string; pathname: string; size: number; uploadedAt: Date }[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 10; page++) {            // up to 10,000 files
      const res = await list({ cursor, limit: 1000 });
      blobs.push(...res.blobs);
      if (!res.hasMore) break;
      cursor = res.cursor;
    }
    return { connected: true, blobs };
  } catch {
    return { connected: false, blobs: [] };
  }
}

/** Size + existence of a same-origin file (bundled /assets/…) via HEAD. */
async function headLocal(origin: string, path: string): Promise<{ bytes: number | null; exists: boolean | null }> {
  try {
    const res = await fetch(origin + path, { method: 'HEAD', next: { revalidate: 300 } });
    if (res.status === 404) return { bytes: null, exists: false };
    if (!res.ok) return { bytes: null, exists: null };
    const len = res.headers.get('content-length');
    return { bytes: len ? Number(len) : null, exists: true };
  } catch {
    return { bytes: null, exists: null };
  }
}

export async function loadAssetLibrary(origin: string): Promise<AssetLibrary> {
  const [{ refs, referenced }, inventory] = await Promise.all([collectReferenced(), listAllBlobs()]);
  const blobBySize = new Map(inventory.blobs.map(b => [b.url, b]));

  const assets = await Promise.all(
    refs.map(async ({ url, kind, origin: o }): Promise<LibraryAsset> => {
      const format = formatOf(url);
      let bytes: number | null = null;
      let exists: boolean | null = null;

      if (isBlobUrl(url)) {
        const blob = blobBySize.get(url);
        if (blob) { bytes = blob.size; exists = true; }
        else if (inventory.connected) exists = false; // we can see the store, and it isn't there
      } else if (url.startsWith('/')) {
        ({ bytes, exists } = await headLocal(origin, url));
      }

      // Card art should ship with a static thumbnail next to the animated file.
      let thumbOk: boolean | null = true;
      const thumb = kind === 'card-art' ? cardThumbUrl(url) : url;
      if (kind === 'card-art' && thumb !== url) {
        if (isBlobUrl(thumb)) thumbOk = inventory.connected ? blobBySize.has(thumb) : null;
        else if (thumb.startsWith('/')) thumbOk = (await headLocal(origin, thumb)).exists;
      }

      const issues: AssetIssue[] = [];
      if (exists === false) issues.push('missing');
      if (format === 'GIF') issues.push('legacy-gif');
      if (thumbOk === false && exists !== false) issues.push('no-thumbnail');
      if (bytes !== null && bytes > HEAVY_BYTES && format !== 'GIF') issues.push('heavy');

      return {
        url, kind, origin: o, format, bytes, issues,
        optimized: kind === 'card-art' && format === 'WebP' && thumb !== url && thumbOk !== false,
      };
    }),
  );

  const now = Date.now();
  const unused: UnusedBlob[] = inventory.blobs
    .filter(b => !referenced.has(b.url) && now - new Date(b.uploadedAt).getTime() > RECENT_MS)
    .map(b => ({ url: b.url, pathname: b.pathname, bytes: b.size, uploadedAt: new Date(b.uploadedAt).toISOString(), format: formatOf(b.pathname) }))
    .sort((a, b) => b.bytes - a.bytes);

  return { assets, unused, blobConnected: inventory.connected };
}

/**
 * Deletes Blob files that nothing references. Re-checks on the server — never trusts the form —
 * so a stale page can't delete something that has since been put back into use.
 * Returns how many files were deleted.
 */
export async function deleteUnusedBlobs(urls: string[]): Promise<number> {
  const requested = [...new Set(urls)].filter(isBlobUrl);
  if (requested.length === 0) return 0;

  const [{ referenced }, inventory] = await Promise.all([collectReferenced(), listAllBlobs()]);
  if (!inventory.connected) return 0;

  const inStore = new Set(inventory.blobs.map(b => b.url));
  const safe = requested.filter(u => inStore.has(u) && !referenced.has(u));
  if (safe.length === 0) return 0;

  await del(safe);
  return safe.length;
}
