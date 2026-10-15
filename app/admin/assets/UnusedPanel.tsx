'use client';
import { useMemo, useState } from 'react';
import { Icon } from '@/app/components/Icon';
import type { BlobProblem, UnusedBlob } from '@/lib/assets';
import { olderThan } from '@/lib/asset-insights';
import { ConfirmButton } from '../components/ConfirmButton';
import { deleteUnusedAssets } from '../actions';
import { formatBytes } from './asset-ui';

const AGES = [7, 30, 90];

export function UnusedPanel({ items, all, blobConnected, problem, copy, copied }: {
  items: UnusedBlob[]; all: UnusedBlob[]; blobConnected: boolean; problem?: BlobProblem; copy: (url: string) => void; copied: string | null;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const visible = new Set(items.map(i => i.url));
  const chosen = useMemo(() => all.filter(u => picked.has(u.url)), [all, picked]);
  const chosenBytes = chosen.reduce((s, u) => s + u.bytes, 0);
  const toggle = (url: string) => setPicked(p => { const n = new Set(p); n.has(url) ? n.delete(url) : n.add(url); return n; });

  if (!blobConnected) {
    return (
      <div className="tcg-panel rounded-xl p-6 text-sm text-gray-400 space-y-2">
        {problem?.kind === 'error' ? (
          <>
            <p>Blob storage is configured here, but reading it failed, so unused files can&apos;t be checked.</p>
            <p className="font-mono text-xs text-amber-300 break-words">{problem.message}</p>
            <p className="text-xs text-gray-500">Check the store is still linked to this project and not suspended (Vercel → Storage). Your cards and covers are unaffected.</p>
          </>
        ) : (
          <>
            <p>This environment has no <code className="text-gray-300">BLOB_READ_WRITE_TOKEN</code>, so unused files can&apos;t be checked here.</p>
            <p className="text-xs text-gray-500">On Vercel, make sure the variable is enabled for this environment. A <strong className="text-gray-400">Preview</strong> deployment doesn&apos;t get Production-only variables. If you&apos;re viewing production, check Settings → Environment Variables and redeploy.</p>
          </>
        )}
      </div>
    );
  }
  if (all.length === 0) return <div className="py-16 text-center text-sm text-gray-500"><Icon name="checkCircle" className="w-8 h-8 mx-auto mb-2 text-green-400/70" />Nothing to clean up. Every file in storage is in use.</div>;

  const totalBytes = all.reduce((s, u) => s + u.bytes, 0);

  return (
    <div className="space-y-4">
      <div className="tcg-panel rounded-xl p-4 space-y-3">
        <p className="text-sm text-gray-400 max-w-3xl">
          These files are in Blob storage but no card or pack points at them (leftover originals, replaced art, abandoned uploads). Files uploaded in the last 10 minutes are hidden in case they&apos;re still being processed. Tick the ones to delete; anything still in use is skipped on the server.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setPicked(new Set(items.map(i => i.url)))} className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-700 text-gray-300 hover:border-gray-500">Select all{visible.size !== all.length ? ' shown' : ''}</button>
          {AGES.map(d => {
            const n = olderThan(items, d).length;
            return <button key={d} disabled={n === 0} onClick={() => setPicked(new Set(olderThan(items, d).map(i => i.url)))} className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-700 text-gray-300 hover:border-gray-500 disabled:opacity-40 disabled:cursor-not-allowed">Older than {d} days <span className="text-gray-500">({n})</span></button>;
          })}
          <button disabled={picked.size === 0} onClick={() => setPicked(new Set())} className="px-3 py-1.5 text-xs font-semibold rounded-lg text-gray-400 hover:text-white disabled:opacity-40">Clear</button>
          <span className="ml-auto text-xs text-gray-500">{all.length} files · {formatBytes(totalBytes)} in total</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-gray-800 pt-3">
          <form action={deleteUnusedAssets} className="flex items-center gap-2">
            {chosen.map(u => <input key={u.url} type="hidden" name="url" value={u.url} />)}
            <ConfirmButton
              title="Delete the selected files?"
              confirmLabel={`Delete ${chosen.length} file${chosen.length !== 1 ? 's' : ''}`}
              message={<>Permanently delete <strong className="text-white">{chosen.length} unused file{chosen.length !== 1 ? 's' : ''}</strong> ({formatBytes(chosenBytes)}) from storage? Anything still in use is skipped automatically. This can&apos;t be undone.</>}
              className={`px-4 py-2 text-sm font-bold rounded-xl transition-colors ${chosen.length === 0 ? 'bg-gray-800 text-gray-500 pointer-events-none' : 'bg-red-600/90 hover:bg-red-500 text-white'}`}
            >
              <Icon name="trash" className="mr-1.5" />Delete selected{chosen.length > 0 && ` (${chosen.length} · ${formatBytes(chosenBytes)})`}
            </ConfirmButton>
          </form>
          <form action={deleteUnusedAssets}>
            {all.map(u => <input key={u.url} type="hidden" name="url" value={u.url} />)}
            <ConfirmButton
              title="Delete all unused files?"
              confirmLabel={`Delete ${all.length} file${all.length !== 1 ? 's' : ''}`}
              message={<>Permanently delete <strong className="text-white">{all.length} unused file{all.length !== 1 ? 's' : ''}</strong> ({formatBytes(totalBytes)}) from storage? Anything still in use is skipped automatically. This can&apos;t be undone.</>}
              className="px-4 py-2 text-sm font-semibold text-red-300 hover:text-red-100 hover:bg-red-950/50 border border-red-500/30 rounded-xl transition-colors"
            >
              Delete all unused ({formatBytes(totalBytes)})
            </ConfirmButton>
          </form>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="py-10 text-center text-sm text-gray-500">No unused files match your search.</div>
      ) : (
        <div className="tcg-panel rounded-xl overflow-hidden divide-y divide-gray-800/60">
          {items.map(u => {
            const isImage = ['WebP', 'PNG', 'JPEG', 'GIF'].includes(u.format);
            const previewable = isImage && u.bytes <= 1.5 * 1024 * 1024; // never pull a 25MB original just to preview it
            const on = picked.has(u.url);
            return (
              <div key={u.url} className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${on ? 'bg-yellow-500/[0.06]' : 'hover:bg-white/[0.02]'}`}>
                <input type="checkbox" checked={on} onChange={() => toggle(u.url)} aria-label={`Select ${u.pathname}`} className="w-4 h-4 accent-yellow-400 shrink-0" />
                <div className="w-10 h-14 rounded bg-gray-800 flex items-center justify-center overflow-hidden shrink-0 text-lg">
                  {previewable ? <img src={u.url} alt="" loading="lazy" className="w-full h-full object-cover" /> : (u.format === 'GIF' ? <Icon name="film" /> : isImage ? <Icon name="image" /> : <Icon name="music" />)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white font-mono truncate" title={u.pathname}>{u.pathname}</p>
                  <p className="text-xs text-gray-500">{u.format} · {formatBytes(u.bytes)} · uploaded {new Date(u.uploadedAt).toLocaleDateString('en-GB', { timeZone: 'UTC' })}</p>
                </div>
                <button onClick={() => copy(u.url)} className="text-xs px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors shrink-0">
                  {copied === u.url ? <><Icon name="check" className="mr-1" />Copied</> : 'Copy URL'}
                </button>
                <form action={deleteUnusedAssets}>
                  <input type="hidden" name="url" value={u.url} />
                  <ConfirmButton
                    title="Delete this file?"
                    confirmLabel="Delete"
                    message={<>Permanently delete <strong className="text-white font-mono">{u.pathname}</strong> ({formatBytes(u.bytes)})? Nothing uses it. This can&apos;t be undone.</>}
                    className="text-xs px-3 py-1.5 text-red-400 hover:text-red-200 hover:bg-red-950/50 rounded-lg transition-colors"
                  >
                    Delete
                  </ConfirmButton>
                </form>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
