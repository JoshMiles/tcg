'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { uploadAudioFile, uploadImageFile } from '../components/upload-client';
import { replaceAssetAction } from '../asset-actions';
import type { LibraryAsset } from '@/lib/assets';
import { fileSuits, keyOf } from './replace-key';

/** Uploads a file and points the asset's card / pack at it. Used by the card tiles (drop a file on one) and the detail panel. */
export function useReplace() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null); // asset id being replaced
  const [error, setError] = useState<string | null>(null);

  async function replace(asset: LibraryAsset, file: File): Promise<boolean> {
    setError(null);
    if (!fileSuits(asset.kind, file)) { setError(asset.kind === 'sound' ? 'Drop an audio file (MP3, WAV, OGG).' : 'Drop an image (WebP, GIF, PNG, JPEG).'); return false; }
    setBusy(asset.id);
    try {
      const url = asset.kind === 'sound' ? await uploadAudioFile(file) : await uploadImageFile(file);
      const res = await replaceAssetAction(keyOf(asset), url);
      if (!res.ok) { setError(res.message); return false; }
      router.refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
      return false;
    } finally {
      setBusy(null);
    }
  }
  return { replace, busy, error, clearError: () => setError(null) };
}
