'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Icon } from '@/app/components/Icon';
import { cardThumbUrl, isBlobUrl } from '@/lib/card-art';
import type { LibraryAsset } from '@/lib/assets';
import { SoundOptimiser } from './SoundOptimiser';
import type { OptNote } from './useOptimise';
import { ISSUE_TEXT, IssueChips, KIND_LABEL, assetTitle, filename, formatBytes, isFixable, originHref, originLabel } from './asset-ui';

const CHECKER = 'bg-[conic-gradient(#0b1020_25%,#111a30_0_50%,#0b1020_0_75%,#111a30_0)] bg-[length:16px_16px]';

export function DropZone({ kind, busy, onFile, compact }: { kind: LibraryAsset['kind']; busy: boolean; onFile: (f: File) => void; compact?: boolean }) {
  const [over, setOver] = useState(false);
  return (
    <label
      onDragOver={e => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}
      className={`flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed text-center cursor-pointer transition-colors ${compact ? 'px-3 py-3' : 'px-4 py-6'} ${over ? 'border-yellow-400 bg-yellow-500/10 text-yellow-200' : 'border-gray-700 hover:border-gray-500 text-gray-400'} ${busy ? 'opacity-60 pointer-events-none' : ''}`}
    >
      <Icon name={kind === 'sound' ? 'music' : 'image'} className="w-5 h-5" />
      <span className="text-sm font-semibold">{busy ? (kind === 'sound' ? 'Uploading…' : 'Uploading and optimizing…') : 'Drop a file to replace, or click to choose'}</span>
      {!busy && <span className="text-[11px] text-gray-500">{kind === 'sound' ? 'MP3, WAV or OGG' : 'GIFs are optimized automatically'}</span>}
      <input type="file" accept={kind === 'sound' ? 'audio/*' : 'image/*,.gif'} className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
    </label>
  );
}

export function AssetDetail({ asset, index, total, onClose, onStep, onCopy, copied, onFix, fixing, fixNote, onReplace, replacing, replaceError, onOptimiseCover, optimising, optNote }: {
  asset: LibraryAsset; index: number; total: number; onClose: () => void; onStep: (d: -1 | 1) => void;
  onCopy: () => void; copied: boolean; onFix: () => void; fixing: boolean; fixNote?: { ok: boolean; message: string } | null;
  onReplace: (f: File) => void; replacing: boolean; replaceError: string | null;
  /** Shrink this pack cover on the server. */
  onOptimiseCover: () => void; optimising: boolean; optNote?: OptNote | null;
}) {
  const [dims, setDims] = useState<string | null>(null);
  useEffect(() => setDims(null), [asset.url]);

  useEffect(() => {
    const t = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT|AUDIO)$/.test(e.target.tagName)) return;
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onStep(-1);
      if (e.key === 'ArrowRight') onStep(1);
    };
    window.addEventListener('keydown', t);
    return () => window.removeEventListener('keydown', t);
  }, [onClose, onStep]);

  if (typeof document === 'undefined') return null;
  const { origin } = asset;
  const broken = asset.issues.includes('missing');
  const storage = isBlobUrl(asset.url) ? 'Vercel Blob' : asset.url.startsWith('/') ? 'Bundled with the site' : 'External URL';
  const thumb = asset.kind === 'card-art' ? cardThumbUrl(asset.url) : null;
  const hasThumb = thumb !== null && thumb !== asset.url;

  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`${assetTitle(origin)} details`}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <aside className="absolute right-0 top-0 h-full w-full sm:w-[28rem] bg-gray-900 border-l border-gray-800 shadow-2xl flex flex-col">
        <header className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-800">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wider font-bold text-gray-500">{KIND_LABEL[asset.kind]}</p>
            <h2 className="font-display text-lg font-bold text-white truncate">{assetTitle(origin)}</h2>
          </div>
          <span className="text-xs text-gray-500 tabular-nums">{index + 1} / {total}</span>
          <button onClick={() => onStep(-1)} aria-label="Previous file" className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5"><Icon name="chevronLeft" /></button>
          <button onClick={() => onStep(1)} aria-label="Next file" className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5"><Icon name="chevronRight" /></button>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5"><Icon name="x" /></button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Preview */}
          <div className={`rounded-xl border border-gray-800 ${CHECKER} flex items-center justify-center p-4 min-h-48`}>
            {broken ? (
              <div className="text-center text-red-300 space-y-1"><Icon name="ban" className="w-10 h-10 mx-auto" /><p className="text-sm font-semibold">File missing</p></div>
            ) : asset.kind === 'sound' ? (
              <div className="w-full space-y-3 text-center"><Icon name="music" className="w-10 h-10 mx-auto text-gray-500" /><audio controls preload="none" src={asset.url} className="w-full" /></div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={asset.url} alt={assetTitle(origin)} onLoad={e => setDims(`${e.currentTarget.naturalWidth} × ${e.currentTarget.naturalHeight}`)} className="max-h-[22rem] max-w-full object-contain rounded-lg" />
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5"><IssueChips asset={asset} /></div>

          {/* Facts */}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Fact label="Format" value={asset.format} />
            <Fact label="Size" value={formatBytes(asset.bytes)} />
            {asset.kind !== 'sound' && <Fact label="Dimensions" value={dims ?? '…'} />}
            <Fact label="Stored in" value={storage} />
            {asset.kind === 'card-art' && <Fact label="Thumbnail" value={!hasThumb ? 'None (external file)' : asset.issues.includes('no-thumbnail') ? 'Missing' : 'Present'} tone={asset.issues.includes('no-thumbnail') ? 'amber' : undefined} />}
          </dl>
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wider font-bold text-gray-500">File</p>
            <p className="font-mono text-xs text-gray-300 break-all">{filename(asset.url)}</p>
          </div>

          {/* Problems */}
          {asset.issues.length > 0 && (
            <div className="rounded-xl border border-amber-500/25 bg-amber-950/15 p-4 space-y-3">
              <ul className="space-y-1.5">
                {asset.issues.map(i => <li key={i} className="text-sm text-amber-100/90 flex gap-2"><Icon name="warning" className="w-4 h-4 mt-0.5 shrink-0 text-amber-300" /><span><strong>{ISSUE_TEXT[i].label}.</strong> {ISSUE_TEXT[i].hint}</span></li>)}
              </ul>
              {isFixable(asset) && (
                <button onClick={onFix} disabled={fixing} className="tcg-btn px-4 py-2 text-sm rounded-xl">
                  <Icon name="wrench" className="mr-1.5" />{fixing ? 'Fixing…' : 'Fix automatically'}
                </button>
              )}
              {fixNote && <p className={`text-sm ${fixNote.ok ? 'text-green-300' : 'text-red-300'}`}>{fixNote.message}</p>}
            </div>
          )}

          {/* Optimise */}
          {!broken && asset.kind === 'sound' && <SoundOptimiser asset={asset} onUse={onReplace} replacing={replacing} />}
          {!broken && asset.kind === 'pack-cover' && (
            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-wider font-bold text-gray-500">Optimise</p>
              <div className="rounded-xl border border-gray-800 bg-gray-950/40 p-3 space-y-2">
                <p className="text-sm text-gray-300">Re-encodes the cover as a WebP at the size the overlay needs (640 px wide). Covers that are already small are left alone.</p>
                <button type="button" onClick={onOptimiseCover} disabled={optimising} className="px-3 py-1.5 text-sm font-semibold rounded-lg border border-gray-600 text-gray-200 hover:border-yellow-500/60 disabled:opacity-50">
                  <Icon name="zap" className="mr-1.5" />{optimising ? 'Optimising…' : 'Optimise cover'}
                </button>
                {optNote && <p className={`text-sm ${optNote.ok ? 'text-green-300' : 'text-red-300'}`}>{optNote.message}</p>}
              </div>
            </div>
          )}

          {/* Used by */}
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wider font-bold text-gray-500">Used by</p>
            <ul className="space-y-1">
              {[origin, ...asset.sharedWith].map((o, i) => (
                <li key={i}><Link href={originHref(o)} className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 bg-white/[0.03] hover:bg-white/[0.07] text-sm text-gray-200 transition-colors"><span className="truncate">{originLabel(o)}</span><Icon name="chevronRight" className="text-gray-600 shrink-0" /></Link></li>
              ))}
            </ul>
            {asset.sharedWith.length > 0 && <p className="text-xs text-gray-500">This exact file is shared, so replacing it here changes only {assetTitle(origin)}; the others keep the old file.</p>}
          </div>

          {/* Replace */}
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wider font-bold text-gray-500">Replace</p>
            <DropZone kind={asset.kind} busy={replacing} onFile={onReplace} />
            {replaceError && <p className="text-sm text-red-300">{replaceError}</p>}
            <p className="text-xs text-gray-500">The old file stays in storage and appears under Unused, so you can clean it up deliberately.</p>
          </div>
        </div>

        <footer className="flex gap-2 px-5 py-3.5 border-t border-gray-800">
          <button onClick={onCopy} className="flex-1 px-3 py-2 text-sm font-semibold rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 transition-colors">{copied ? <><Icon name="check" className="mr-1" />Copied</> : <><Icon name="copy" className="mr-1.5" />Copy URL</>}</button>
          <a href={asset.url} target="_blank" rel="noreferrer" className="flex-1 text-center px-3 py-2 text-sm font-semibold rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 transition-colors">Open file ↗</a>
          <Link href={originHref(origin)} className="flex-1 text-center px-3 py-2 text-sm font-semibold rounded-xl bg-gray-800 hover:bg-gray-700 text-yellow-300 transition-colors">Edit →</Link>
        </footer>
      </aside>
    </div>,
    document.body,
  );
}

function Fact({ label, value, tone }: { label: string; value: string; tone?: 'amber' }) {
  return <div><dt className="text-[10px] uppercase tracking-wider font-bold text-gray-500">{label}</dt><dd className={`mt-0.5 ${tone === 'amber' ? 'text-amber-300' : 'text-gray-100'}`}>{value}</dd></div>;
}
