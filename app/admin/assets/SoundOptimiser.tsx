'use client';
import { useEffect, useState } from 'react';
import { Icon } from '@/app/components/Icon';
import { BITRATES, DEFAULT_MP3, type Mp3Options } from '@/lib/audio-encode';
import type { LibraryAsset } from '@/lib/assets';
import { compressSound, mp3Name } from './useOptimise';
import { formatBytes } from './asset-ui';

/**
 * Try a smaller version of one sound before using it: pick a bitrate, compress in the browser, listen to the result and only then
 * replace the file. (The old file stays in storage and shows up under Unused.)
 */
export function SoundOptimiser({ asset, onUse, replacing }: { asset: LibraryAsset; onUse: (f: File) => void; replacing: boolean }) {
  const [opts, setOpts] = useState<Mp3Options>(DEFAULT_MP3);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ blob: Blob; url: string; bytes: number; original: number } | null>(null);

  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);
  useEffect(() => { setResult(null); setError(null); }, [asset.url]);

  async function run() {
    setWorking(true); setError(null); setResult(null);
    try {
      const r = await compressSound(asset.url, opts);
      setResult({ blob: r.blob, url: URL.createObjectURL(r.blob), bytes: r.bytes, original: r.original });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not compress this sound.');
    } finally {
      setWorking(false);
    }
  }

  const smaller = result ? Math.round((1 - result.bytes / result.original) * 100) : 0;
  const field = 'bg-gray-950 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-yellow-500';
  return (
    <div className="space-y-2">
      <p className="text-[10px] uppercase tracking-wider font-bold text-gray-500">Optimise</p>
      <div className="rounded-xl border border-gray-800 bg-gray-950/40 p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-3 text-sm text-gray-300">
          <label className="flex items-center gap-1.5">Quality
            <select value={opts.kbps} onChange={e => setOpts({ ...opts, kbps: Number(e.target.value) })} className={field} aria-label="Bitrate">
              {BITRATES.map(b => <option key={b} value={b}>{b} kbps</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={opts.mono} onChange={e => setOpts({ ...opts, mono: e.target.checked })} className="accent-yellow-500" />Mono</label>
          <button type="button" onClick={run} disabled={working || replacing} className="ml-auto px-3 py-1.5 text-sm font-semibold rounded-lg border border-gray-600 text-gray-200 hover:border-yellow-500/60 disabled:opacity-50">
            <Icon name="zap" className="mr-1.5" />{working ? 'Compressing…' : 'Compress'}
          </button>
        </div>
        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        {result && (
          <div className="space-y-2">
            <p className="text-sm text-gray-200">
              {formatBytes(result.original)} → <strong className="text-white">{formatBytes(result.bytes)}</strong>
              <span className={smaller > 0 ? ' text-green-300' : ' text-amber-300'}> ({smaller > 0 ? `${smaller}% smaller` : 'not smaller'})</span>
            </p>
            <audio controls src={result.url} className="w-full" />
            <p className="text-xs text-gray-500">Play it and compare with the original above. Mono and 96 kbps is plenty for effects; use more for music.</p>
            <div className="flex gap-2">
              <button type="button" disabled={replacing || smaller <= 0}
                onClick={() => onUse(new File([result.blob], mp3Name(asset.url), { type: 'audio/mpeg' }))}
                className="tcg-btn px-3 py-1.5 text-sm rounded-lg">{replacing ? 'Replacing…' : 'Use this version'}</button>
              <button type="button" onClick={() => setResult(null)} className="px-3 py-1.5 text-sm rounded-lg border border-gray-700 text-gray-400 hover:text-white">Discard</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
