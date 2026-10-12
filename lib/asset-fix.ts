import { put } from '@vercel/blob';
import { getPack, getPackCards, savePack, savePackCards } from './kv';
import { storeOptimizedCard } from './card-upload';
import { toCover, toThumb } from './card-image';
import { cardThumbUrl, isBlobUrl } from './card-art';
import { HEAVY_BYTES, deleteUnusedBlobs, formatOf, type AssetKey } from './assets';

// Server-side repairs and swaps for the Assets page. Everything here works from an AssetKey (which card / pack),
// re-reads the current URL from the database and decides what is wrong for itself, so a stale or crafted request
// can't point it at an arbitrary file.

export interface FixResult { ok: boolean; message: string; newUrl?: string; /** Bytes before / after, when a file was re-encoded. */ before?: number; after?: number }

interface Ref { url: string | undefined; set(url: string): Promise<void> }

async function resolveRef(key: AssetKey): Promise<Ref | null> {
  if (key.kind === 'pack-cover') {
    const pack = await getPack(key.packId);
    if (!pack) return null;
    return { url: pack.coverImageUrl, set: url => savePack({ ...pack, coverImageUrl: url }) };
  }
  const cards = await getPackCards(key.packId);
  const card = cards.find(c => c.id === key.cardId);
  if (!card) return null;
  const field = key.kind === 'sound' ? 'soundUrl' : 'imageUrl';
  return {
    url: card[field],
    set: url => savePackCards(key.packId, cards.map(c => (c.id === card.id ? { ...c, [field]: url } : c))),
  };
}

const absolute = (url: string, origin: string) => (url.startsWith('/') ? origin + url : url);
const fail = (message: string): FixResult => ({ ok: false, message });

const IMAGE_EXT = ['webp', 'gif', 'png', 'jpg', 'jpeg', 'svg'];
const SOUND_EXT = ['mp3', 'wav', 'ogg', 'm4a', 'webm'];

/** A URL a card / pack may point at: our own Blob store or a bundled /assets file, of the right media type. */
export function acceptableAssetUrl(kind: AssetKey['kind'], url: string): boolean {
  if (!isBlobUrl(url) && !url.startsWith('/assets/')) return false;
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  return (kind === 'sound' ? SOUND_EXT : IMAGE_EXT).includes(ext);
}

/** Points a card / pack at a new file (already uploaded). The old file is left alone: it shows up under Unused. */
export async function replaceAsset(key: AssetKey, newUrl: string): Promise<FixResult> {
  if (!acceptableAssetUrl(key.kind, newUrl)) return fail(key.kind === 'sound' ? 'That is not a sound file we can use.' : 'That is not an image file we can use.');
  const ref = await resolveRef(key);
  if (!ref) return fail('That card or pack no longer exists.');
  await ref.set(newUrl);
  return { ok: true, message: 'Replaced.', newUrl };
}

/**
 * Repairs one reference: a GIF becomes an optimized WebP, an oversized card image is re-encoded, and a missing
 * thumbnail is regenerated. Returns what it did (or why it could not).
 */
export async function fixAsset(key: AssetKey, origin: string): Promise<FixResult> {
  if (key.kind === 'sound') return fail('Sounds are not fixed automatically. Replace the file instead.');
  const ref = await resolveRef(key);
  if (!ref?.url) return fail('Nothing to fix: no file is set.');
  const url = ref.url;
  const format = formatOf(url);
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.VERCEL_BLOB_RW_TOKEN) return fail('Blob storage is not connected here, so fixed files cannot be saved.');

  let res: Response;
  try { res = await fetch(absolute(url, origin)); } catch { return fail('Could not reach the file.'); }
  if (!res.ok) return fail('The file is missing. Replace it instead.');
  const buf = Buffer.from(await res.arrayBuffer());

  // Re-encode: any GIF, or a card image far heavier than it should be.
  if (format === 'GIF' || (key.kind === 'card-art' && buf.length > HEAVY_BYTES)) {
    try {
      const result = await storeOptimizedCard(buf);
      await ref.set(result.url);
      // The old file (and its thumbnail) is only removed if nothing else points at it; deleteUnusedBlobs re-checks.
      await deleteUnusedBlobs([url, cardThumbUrl(url)]);
      const pct = Math.round((1 - result.bytes / buf.length) * 100);
      return { ok: true, newUrl: result.url, message: `Optimized: ${fmt(buf.length)} → ${fmt(result.bytes)} (${pct}% smaller).` };
    } catch {
      return fail('Could not process the image. Is it a valid file?');
    }
  }

  // Thumbnail: only for card art that follows the <uuid>.webp naming, where the thumbnail URL can be derived.
  if (key.kind === 'card-art') {
    const thumb = cardThumbUrl(url);
    if (thumb === url) return fail('Nothing to fix.');
    if (!isBlobUrl(thumb)) return fail('This is a bundled file. Regenerate its thumbnail with node scripts/optimize-cards.mjs.');
    const head = await fetch(thumb, { method: 'HEAD' }).catch(() => null);
    if (head?.ok) return fail('Nothing to fix: the thumbnail exists.');
    try {
      const small = await toThumb(buf);
      await put(new URL(thumb).pathname.slice(1), small, { access: 'public', addRandomSuffix: false, contentType: 'image/webp', cacheControlMaxAge: 31536000 });
      return { ok: true, newUrl: url, message: 'Thumbnail regenerated.' };
    } catch {
      return fail('Could not create the thumbnail.');
    }
  }
  return fail('Nothing to fix.');
}

/** A cover must come out at least this much smaller to be worth replacing (re-encoding a WebP again just loses quality). */
const COVER_MIN_SAVING = 0.1;

/**
 * Shrinks a pack cover: re-encodes it as a WebP at the standard width (see COVER_WIDTH) and points the pack at it. Works for covers
 * in Blob and for bundled /assets files (the optimised copy goes to Blob). Leaves the cover alone when it is already small, so it
 * is safe to run on everything. The old file is removed only if nothing else points at it.
 */
export async function optimizeCover(key: AssetKey, origin: string): Promise<FixResult> {
  if (key.kind !== 'pack-cover') return fail('Only pack covers can be optimised here.');
  const ref = await resolveRef(key);
  if (!ref?.url) return fail('This pack has no cover.');
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.VERCEL_BLOB_RW_TOKEN) return fail('Blob storage is not connected here, so optimised files cannot be saved.');
  const url = ref.url;
  if (!isBlobUrl(url) && !url.startsWith('/')) return fail('This cover is hosted elsewhere, so it cannot be optimised.');

  let res: Response;
  try { res = await fetch(absolute(url, origin)); } catch { return fail('Could not reach the file.'); }
  if (!res.ok) return fail('The file is missing. Replace it instead.');
  const buf = Buffer.from(await res.arrayBuffer());

  let out: Buffer;
  try { out = await toCover(buf); } catch { return fail('Could not process the image. Is it a valid file?'); }
  if (out.length > buf.length * (1 - COVER_MIN_SAVING)) {
    return { ok: true, message: `Already small (${fmt(buf.length)}); left as it is.`, before: buf.length, after: buf.length };
  }
  const saved = await put(`covers/${crypto.randomUUID()}.webp`, out, { access: 'public', addRandomSuffix: false, contentType: 'image/webp', cacheControlMaxAge: 31536000 });
  await ref.set(saved.url);
  await deleteUnusedBlobs([url]);
  const pct = Math.round((1 - out.length / buf.length) * 100);
  return { ok: true, newUrl: saved.url, before: buf.length, after: out.length, message: `Optimised: ${fmt(buf.length)} → ${fmt(out.length)} (${pct}% smaller).` };
}

function fmt(b: number) { return b < 1048576 ? `${Math.round(b / 1024)} KB` : `${(b / 1048576).toFixed(1)} MB`; }
