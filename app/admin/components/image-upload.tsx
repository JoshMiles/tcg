'use client';
import { useState } from 'react';
import { uploadImageFile } from './upload-client';

type Status = 'idle' | 'uploading' | 'optimizing';

/**
 * Preview src for an admin-typed image URL: http(s), or a root-relative path.
 * Quotes and angle brackets are stripped so the img src is not raw DOM text.
 */
function imagePreviewSrc(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  try {
    if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
      const parsed = new URL(trimmed, 'https://local.invalid');
      return `${parsed.pathname}${parsed.search}${parsed.hash}`.replace(/[<>"']/g, '');
    }
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.href.replace(/[<>"']/g, '');
  } catch {
    return '';
  }
}

export function ImageUploadField({
  name = 'imageUrl',
  defaultValue,
  label: fieldLabel = 'Image URL',
  onUrlChange,
}: {
  name?: string;
  defaultValue?: string;
  label?: string;
  /** Called whenever the URL changes (typed or uploaded), for forms that keep their own state. */
  onUrlChange?: (url: string) => void;
}) {
  const [url, setUrlState] = useState(defaultValue ?? '');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const busy = status !== 'idle';

  function setUrl(next: string) {
    setUrlState(next);
    onUrlChange?.(next);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    setError('');
    try {
      setUrl(await uploadImageFile(file, setStatus));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setStatus('idle');
      input.value = ''; // allow re-selecting the same file
    }
  }

  const label = status === 'uploading' ? 'Uploading…' : status === 'optimizing' ? 'Optimizing…' : 'Upload';
  const preview = imagePreviewSrc(url);

  return (
    <fieldset className="fieldset">
      <legend className="fieldset-legend">{fieldLabel}</legend>
      <div className="flex gap-2">
        <input
          type="text"
          name={name}
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://... or upload →"
          className="input flex-1"
        />
        <label className={`px-3 py-2 text-sm rounded-lg cursor-pointer shrink-0 transition-colors ${busy ? 'bg-gray-600 text-gray-400' : 'bg-gray-700 hover:bg-gray-600 text-white'}`}>
          {label}
          <input type="file" accept="image/*,.gif" className="hidden" onChange={handleFile} disabled={busy} />
        </label>
      </div>
      {status === 'optimizing' && (
        <p className="text-xs text-gray-500 mt-1">Shrinking the GIF and creating a thumbnail. This can take up to a minute.</p>
      )}
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
      {preview && <img src={preview} alt="" className="mt-2 h-20 object-contain rounded-sm border border-gray-700" />}
    </fieldset>
  );
}
