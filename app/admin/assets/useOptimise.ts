'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { optimizeCoverAction, replaceAssetAction } from '../asset-actions';
import { uploadAudioFile } from '../components/upload-client';
import { DEFAULT_MP3, WORTH_IT, encodeMp3, type Mp3Options } from '@/lib/audio-encode';
import type { LibraryAsset } from '@/lib/assets';
import { formatBytes } from './asset-ui';
import { keyOf } from './replace-key';

export type OptNote = { ok: boolean; message: string };
export interface Progress { current: string | null; done: number; total: number; what: 'covers' | 'sounds' }

const absolute = (url: string) => (url.startsWith('/') ? window.location.origin + url : url);
export const mp3Name = (url: string) => `${decodeURIComponent(url.split('?')[0].split('/').pop() ?? 'sound').replace(/\.[a-z0-9]+$/i, '')}-opt.mp3`;

/** Fetches a sound and re-encodes it. Browser only. Returns the encoded file and the original size. */
export async function compressSound(url: string, opts: Mp3Options) {
  const res = await fetch(absolute(url));
  if (!res.ok) throw new Error('Could not download the file.');
  const data = await res.arrayBuffer();
  const out = await encodeMp3(data, opts);
  return { ...out, original: data.byteLength };
}

/**
 * The Assets page's optimisers. Covers are shrunk on the server (one request each, so progress shows); sounds are re-encoded in the
 * browser and uploaded as a replacement, only when that saves enough to matter. Everything runs one file at a time.
 */
export function useOptimise() {
  const router = useRouter();
  const [progress, setProgress] = useState<Progress | null>(null);
  const [notes, setNotes] = useState<Record<string, OptNote>>({});
  const [summary, setSummary] = useState<string | null>(null);

  async function optimiseCovers(list: LibraryAsset[]) {
    const todo = list.filter(a => a.kind === 'pack-cover' && !a.issues.includes('missing'));
    if (todo.length === 0 || progress) return;
    setSummary(null);
    let changed = 0, before = 0, after = 0;
    for (let i = 0; i < todo.length; i++) {
      setProgress({ current: todo[i].id, done: i, total: todo.length, what: 'covers' });
      try {
        const r = await optimizeCoverAction(keyOf(todo[i]));
        setNotes(n => ({ ...n, [todo[i].id]: { ok: r.ok, message: r.message } }));
        if (r.ok && r.newUrl) { changed++; before += r.before ?? 0; after += r.after ?? 0; }
      } catch {
        setNotes(n => ({ ...n, [todo[i].id]: { ok: false, message: 'The request failed. Try again.' } }));
      }
    }
    setProgress(null);
    setSummary(changed === 0 ? `Checked ${todo.length} cover${todo.length === 1 ? '' : 's'}: all already small.` : `Optimised ${changed} of ${todo.length} cover${todo.length === 1 ? '' : 's'}, saving ${formatBytes(before - after)}.`);
    router.refresh();
  }

  /** Re-encodes sounds with `opts`, replacing a file only when the new one is at least WORTH_IT smaller. */
  async function optimiseSounds(list: LibraryAsset[], opts: Mp3Options = DEFAULT_MP3) {
    const todo = list.filter(a => a.kind === 'sound' && !a.issues.includes('missing'));
    if (todo.length === 0 || progress) return;
    setSummary(null);
    let changed = 0, saved = 0, failed = 0;
    for (let i = 0; i < todo.length; i++) {
      const a = todo[i];
      setProgress({ current: a.id, done: i, total: todo.length, what: 'sounds' });
      try {
        const r = await compressSound(a.url, opts);
        if (r.bytes > r.original * (1 - WORTH_IT)) {
          setNotes(n => ({ ...n, [a.id]: { ok: true, message: `Already small (${formatBytes(r.original)}); left as it is.` } }));
          continue;
        }
        const url = await uploadAudioFile(new File([r.blob], mp3Name(a.url), { type: 'audio/mpeg' }));
        const res = await replaceAssetAction(keyOf(a), url);
        if (!res.ok) throw new Error(res.message);
        changed++; saved += r.original - r.bytes;
        setNotes(n => ({ ...n, [a.id]: { ok: true, message: `Optimised: ${formatBytes(r.original)} → ${formatBytes(r.bytes)}.` } }));
      } catch (e) {
        failed++;
        setNotes(n => ({ ...n, [a.id]: { ok: false, message: e instanceof Error ? e.message : 'Could not optimise this sound.' } }));
      }
    }
    setProgress(null);
    setSummary(`Optimised ${changed} of ${todo.length} sound${todo.length === 1 ? '' : 's'}${saved > 0 ? `, saving ${formatBytes(saved)}` : ''}.${failed ? ` ${failed} could not be processed (open one to see why).` : ''}`);
    router.refresh();
  }

  return { progress, notes, summary, clearSummary: () => setSummary(null), optimiseCovers, optimiseSounds };
}
