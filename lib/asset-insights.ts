import type { AssetKind, LibraryAsset } from './assets';

// Pure number-crunching for the Assets page's Insights tab (client-safe; no server imports).

/** Rough size reduction when a GIF is converted to the animated WebP (a 20 MB card GIF becomes 1–4 MB). */
export const GIF_SAVINGS = 0.9;

export interface PackWeight { packId: string; packName: string; files: number; bytes: number; flagged: number }

export interface Insights {
  totalBytes: number;
  byKind: Record<AssetKind, { files: number; bytes: number }>;
  perPack: PackWeight[];
  heaviest: LibraryAsset[];
  gifs: { files: number; bytes: number; estimatedSaved: number };
  averageCardArt: number | null;
  shared: number;               // files used from more than one place
  unknownSize: number;          // files whose size couldn't be read (external URLs)
}

export function computeInsights(assets: LibraryAsset[], top = 10): Insights {
  const byKind: Insights['byKind'] = { 'card-art': { files: 0, bytes: 0 }, 'pack-cover': { files: 0, bytes: 0 }, sound: { files: 0, bytes: 0 } };
  const packs = new Map<string, PackWeight>();
  let totalBytes = 0, unknownSize = 0, shared = 0;
  const gifs = { files: 0, bytes: 0, estimatedSaved: 0 };

  for (const a of assets) {
    const b = a.bytes ?? 0;
    totalBytes += b;
    if (a.bytes === null) unknownSize++;
    byKind[a.kind].files++; byKind[a.kind].bytes += b;
    const p = packs.get(a.origin.packId) ?? { packId: a.origin.packId, packName: a.origin.packName, files: 0, bytes: 0, flagged: 0 };
    p.files++; p.bytes += b; if (a.issues.length > 0) p.flagged++;
    packs.set(a.origin.packId, p);
    if (a.sharedWith.length > 0) shared++;
    if (a.format === 'GIF' && !a.issues.includes('missing')) { gifs.files++; gifs.bytes += b; }
  }
  gifs.estimatedSaved = Math.round(gifs.bytes * GIF_SAVINGS);

  const art = byKind['card-art'];
  return {
    totalBytes, byKind, unknownSize, shared, gifs,
    perPack: [...packs.values()].sort((x, y) => y.bytes - x.bytes),
    heaviest: [...assets].filter(a => a.bytes !== null).sort((x, y) => (y.bytes ?? 0) - (x.bytes ?? 0)).slice(0, top),
    averageCardArt: art.files > 0 ? Math.round(art.bytes / art.files) : null,
  };
}

export interface UnusedGroup { folder: string; format: string; files: number; bytes: number }

/** Files grouped by storage folder and kind (e.g. "cards/ WebP"), largest group first, for the delete confirmation. */
export function groupUnused(items: { pathname: string; format: string; bytes: number }[]): UnusedGroup[] {
  const groups = new Map<string, UnusedGroup>();
  for (const i of items) {
    const folder = i.pathname.includes('/') ? i.pathname.split('/')[0] + '/' : '(top level)';
    const key = `${folder} ${i.format}`;
    const g = groups.get(key) ?? { folder, format: i.format, files: 0, bytes: 0 };
    g.files++; g.bytes += i.bytes;
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => b.bytes - a.bytes);
}

/** Unused files older than `days` days (by upload time). */
export function olderThan<T extends { uploadedAt: string }>(items: T[], days: number, now = Date.now()): T[] {
  const cutoff = now - days * 86_400_000;
  return items.filter(i => new Date(i.uploadedAt).getTime() < cutoff);
}
