'use client';
import { useState } from 'react';
import { upload } from '@vercel/blob/client';

type Status = 'idle' | 'uploading' | 'optimizing';

export function ImageUploadField({ name = 'imageUrl', defaultValue }: { name?: string; defaultValue?: string }) {
  const [url, setUrl] = useState(defaultValue ?? '');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const busy = status !== 'idle';

  // GIFs go straight from the browser to Blob (the serverless request-body limit is 4.5MB, and
  // card GIFs are 20MB+), then the server shrinks them to animated WebP and makes a static thumbnail.
  async function uploadGif(file: File): Promise<string> {
    setStatus('uploading');
    const blob = await upload(`tmp/${file.name}`, file, { access: 'public', handleUploadUrl: '/api/upload/token' });
    setStatus('optimizing');
    const res = await fetch('/api/upload/optimize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: blob.url }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? 'Optimization failed');
    return data.url;
  }

  async function uploadPlain(file: File): Promise<string> {
    setStatus('uploading');
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? 'Upload failed');
    return data.url;
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    setError('');
    try {
      setUrl(await (file.type === 'image/gif' ? uploadGif(file) : uploadPlain(file)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setStatus('idle');
      input.value = ''; // allow re-selecting the same file
    }
  }

  const label = status === 'uploading' ? 'Uploading…' : status === 'optimizing' ? 'Optimizing…' : 'Upload';

  return (
    <div>
      <label className="block text-sm text-gray-400 mb-1">Image URL</label>
      <div className="flex gap-2">
        <input
          type="text"
          name={name}
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://... or upload →"
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500"
        />
        <label className={`px-3 py-2 text-sm rounded-lg cursor-pointer shrink-0 transition-colors ${busy ? 'bg-gray-600 text-gray-400' : 'bg-gray-700 hover:bg-gray-600 text-white'}`}>
          {label}
          <input type="file" accept="image/*,.gif" className="hidden" onChange={handleFile} disabled={busy} />
        </label>
      </div>
      {status === 'optimizing' && (
        <p className="text-xs text-gray-500 mt-1">Shrinking the GIF and creating a thumbnail — this can take up to a minute.</p>
      )}
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
      {url && <img src={url} alt="" className="mt-2 h-20 object-contain rounded border border-gray-700" />}
    </div>
  );
}
