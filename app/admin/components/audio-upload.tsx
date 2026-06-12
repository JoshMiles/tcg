'use client';
import { useState } from 'react';

export function AudioUploadField({ name = 'soundUrl', defaultValue }: { name?: string; defaultValue?: string }) {
  const [url, setUrl] = useState(defaultValue ?? '');
  const [uploading, setUploading] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: form });
      if (res.ok) {
        const { url: uploaded } = await res.json();
        setUrl(uploaded);
      }
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <label className="block text-sm text-gray-400 mb-1">Sound URL <span className="text-gray-600">(optional)</span></label>
      <div className="flex gap-2">
        <input
          type="text"
          name={name}
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://... or upload →"
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500"
        />
        <label className={`px-3 py-2 text-sm rounded-lg cursor-pointer shrink-0 transition-colors ${uploading ? 'bg-gray-600 text-gray-400' : 'bg-gray-700 hover:bg-gray-600 text-white'}`}>
          {uploading ? 'Uploading…' : 'Upload'}
          <input type="file" accept="audio/*,.mp3,.wav,.ogg" className="hidden" onChange={handleFile} disabled={uploading} />
        </label>
      </div>
      {url && (
        <audio controls src={url} className="mt-2 w-full" />
      )}
      <p className="text-xs text-gray-600 mt-1">Overrides the default numbered sound file for this card</p>
    </div>
  );
}
