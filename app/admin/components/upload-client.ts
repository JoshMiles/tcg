import { upload } from '@vercel/blob/client';

export type UploadPhase = 'uploading' | 'optimizing';

/**
 * Uploads a card image and returns its public URL. Browser-only.
 * GIFs go straight from the browser to Blob (the serverless request-body limit is 4.5MB and card GIFs are
 * 20MB+), then the server shrinks them to animated WebP and makes a static thumbnail. Everything else is
 * posted to /api/upload.
 */
export async function uploadImageFile(file: File, onPhase?: (phase: UploadPhase) => void): Promise<string> {
  if (file.type === 'image/gif') {
    onPhase?.('uploading');
    const blob = await upload(`tmp/${file.name}`, file, { access: 'public', handleUploadUrl: '/api/upload/token' });
    onPhase?.('optimizing');
    const res = await fetch('/api/upload/optimize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: blob.url }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? 'Optimization failed');
    return data.url;
  }
  return postFile(file, onPhase);
}

/** Uploads a sound file and returns its public URL. */
export async function uploadAudioFile(file: File): Promise<string> {
  return postFile(file);
}

async function postFile(file: File, onPhase?: (phase: UploadPhase) => void): Promise<string> {
  onPhase?.('uploading');
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/upload', { method: 'POST', body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? 'Upload failed');
  return data.url;
}
