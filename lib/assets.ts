import { list, del } from '@vercel/blob';
import { inSandbox } from './db';
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

/** Identifies one reference to a file (a card's art / sound, or a pack's cover). Never carries a URL: the server re-reads the current one. */
export interface AssetKey { kind: AssetKind; packId: string; cardId?: string }

export const assetId = (k: AssetKey): string => `${k.kind}:${k.packId}:${k.cardId ?? 'cover'}`;
export const keyOf = (o: AssetOrigin, kind: AssetKind): AssetKey => ({ kind, packId: o.packId, cardId: o.kind === 'pack-cover' ? undefined : o.cardId });

export interface LibraryAsset {
  id: string;                   // assetId() of the reference
  url: string;
  kind: AssetKind;
  origin: AssetOrigin;
  format: string;               // e.g. "WebP", "GIF", "PNG", "MP3"
  bytes: number | null;         // null when we couldn't determine it (external URLs)
  issues: AssetIssue[];
  optimized: boolean;           // card art served as WebP with a thumbnail
  sharedWith: AssetOrigin[];    // other cards / packs that point at the very same file
}

export interface UnusedBlob {
  url: string;
  pathname: string;
  bytes: number;
  uploadedAt: string;           // ISO
  format: string;
}

/** Why the Blob inventory couldn't be read (so the UI can say the real reason). */
export type BlobProblem = { kind: 'no-token' } | { kind: 'error'; message: string };

export interface AssetLibrary {
  assets: LibraryAsset[];
  unused: UnusedBlob[];
  blobConnected: boolean;       // false when Blob storage isn't configured/reachable
  blobProblem?: BlobProblem;    // set when blobConnected is false
}

export const HEAVY_BYTES = 8 * 1024 * 1024;
const RECENT_MS = 10 * 60 * 1000;  // don't call a just-uploaded file "unused" (it may be mid-optimize)

export function formatOf(url: string): string {
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  return ({ webp: 'WebP', gif: 'GIF', png: 'PNG', jpg: 'JPEG', jpeg: 'JPEG', svg: 'SVG', mp3: 'MP3', wav: 'WAV', ogg: 'OGG', m4a: 'M4A', webm: 'WebM' } as Record<string, string>)[ext] ?? (ext.toUpperCase() || 'File');
}

/** Every URL referenced by a pack or card, plus the thumbnails that ride along with card art. */
export async function collectReferenced() {
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

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      v => { clearTimeout(timer); resolve(v); },
      e => { clearTimeout(timer); reject(e); },
    );
  });
}

async function listAllBlobs(): Promise<{
  connected: boolean;
  problem?: BlobProblem;
  blobs: { url: string; pathname: string; size: number; uploadedAt: Date }[];
}> {
  // Say which it is: no token in this environment (e.g. a Vercel preview whose env vars are scoped to
  // Production only) vs. a token that exists but Vercel rejected or couldn't be reached.
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.VERCEL_BLOB_RW_TOKEN) {
    return { connected: false, problem: { kind: 'no-token' }, blobs: [] };
  }
  try {
    const blobs: { url: string; pathname: string; size: number; uploadedAt: Date }[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 10; page++) {            // up to 10,000 files
      // The SDK retries network failures with backoff and doesn't reliably honour an abort signal while
      // doing so, so race it against a timer — a broken store must not hang the whole page.
      const res = await withTimeout(list({ cursor, limit: 1000 }), 8000, 'Timed out reaching Vercel Blob');
      blobs.push(...res.blobs);
      if (!res.hasMore) break;
      cursor = res.cursor;
    }
    return { connected: true, blobs };
  } catch (err) {
    const message = (err instanceof Error ? err.message : String(err)).replace(/vercel_blob_rw_\w+/gi, '[token]').slice(0, 300);
    return { connected: false, problem: { kind: 'error', message }, blobs: [] };
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

      const sharedWith = refs.filter(r => r.url === url && r.origin !== o).map(r => r.origin);
      return {
        id: assetId(keyOf(o, kind)), url, kind, origin: o, format, bytes, issues, sharedWith,
        optimized: kind === 'card-art' && format === 'WebP' && thumb !== url && thumbOk !== false,
      };
    }),
  );

  const now = Date.now();
  const unused: UnusedBlob[] = inventory.blobs
    .filter(b => !referenced.has(b.url) && now - new Date(b.uploadedAt).getTime() > RECENT_MS)
    .map(b => ({ url: b.url, pathname: b.pathname, bytes: b.size, uploadedAt: new Date(b.uploadedAt).toISOString(), format: formatOf(b.pathname) }))
    .sort((a, b) => b.bytes - a.bytes);

  return { assets, unused, blobConnected: inventory.connected, blobProblem: inventory.problem };
}

/** Of the requested URLs, the ones that exist in the store and that nothing (including a card's companion thumbnail) references. */
export function pickDeletable(requested: string[], inStore: Set<string>, referenced: Set<string>): string[] {
  return [...new Set(requested)].filter(u => isBlobUrl(u) && inStore.has(u) && !referenced.has(u));
}

/**
 * Deletes Blob files that nothing references. Re-checks on the server — never trusts the form —
 * so a stale page can't delete something that has since been put back into use.
 * Returns how many files were deleted.
 */
export async function deleteUnusedBlobs(urls: string[]): Promise<number> {
  const requested = [...new Set(urls)].filter(isBlobUrl);
  if (requested.length === 0) return 0;
  // The Blob store is shared with production and a sandbox's data can lag behind it, so a sandbox must never delete files.
  if (await inSandbox()) return 0;

  const [{ referenced }, inventory] = await Promise.all([collectReferenced(), listAllBlobs()]);
  if (!inventory.connected) return 0;

  const safe = pickDeletable(requested, new Set(inventory.blobs.map(b => b.url)), referenced);
  if (safe.length === 0) return 0;

  await del(safe);
  return safe.length;
}
