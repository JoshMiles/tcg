'use server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin-guard';
import { fixAsset, optimizeCover, replaceAsset, type FixResult } from '@/lib/asset-fix';
import type { AssetKey } from '@/lib/assets';
import { SITE_URL } from '@/lib/site';

// Server actions behind /admin/assets. Each re-checks the admin cookie (a server action can be invoked outside its page)
// and takes an AssetKey, never a URL to act on: the server reads the current file from the database itself.

const KINDS = ['card-art', 'pack-cover', 'sound'];
function cleanKey(k: AssetKey): AssetKey | null {
  if (!k || !KINDS.includes(k.kind) || typeof k.packId !== 'string') return null;
  if (k.kind !== 'pack-cover' && typeof k.cardId !== 'string') return null;
  return { kind: k.kind, packId: k.packId, cardId: k.kind === 'pack-cover' ? undefined : k.cardId };
}

/** Where bundled /assets files are fetched from: a fixed address, never a request header. */
function origin(): string {
  if (process.env.VERCEL_ENV === 'production') return SITE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

/** Repairs one file (the page calls this once per file so progress shows and each request stays short). */
export async function fixAssetAction(key: AssetKey): Promise<FixResult> {
  await requireAdmin();
  const k = cleanKey(key);
  if (!k) return { ok: false, message: 'Unknown file.' };
  const result = await fixAsset(k, origin());
  revalidatePath('/admin/assets');
  return result;
}

/** Shrinks one pack cover (the page calls this once per cover). Safe to run on a cover that is already small. */
export async function optimizeCoverAction(key: AssetKey): Promise<FixResult> {
  await requireAdmin();
  const k = cleanKey(key);
  if (!k) return { ok: false, message: 'Unknown file.' };
  const result = await optimizeCover(k, origin());
  revalidatePath('/admin/assets');
  revalidatePath(`/admin/packs/${k.packId}`);
  return result;
}

/** Points a card / pack at a file the browser has just uploaded. */
export async function replaceAssetAction(key: AssetKey, newUrl: string): Promise<FixResult> {
  await requireAdmin();
  const k = cleanKey(key);
  if (!k || typeof newUrl !== 'string') return { ok: false, message: 'Unknown file.' };
  const result = await replaceAsset(k, newUrl);
  revalidatePath('/admin/assets');
  revalidatePath(`/admin/packs/${k.packId}`);
  return result;
}
