'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/app/components/Icon';
import { Dialog } from '../../../components/Dialog';
import { uploadAudioFile, uploadImageFile } from '../../../components/upload-client';
import { blocked, parseArtFileName, planImport, MAX_IMPORT_FILES, type ImportRow } from '@/lib/art-import';
import { newWorkCard, type WorkCard } from '@/lib/pack-editor-core';
import { inputCls } from './fields';

type Status = { state: 'idle' | 'uploading' | 'done' } | { state: 'failed'; error: string };

/**
 * Import a folder of art (ROADMAP 20.2e). The dropped files are read into a plan (`planImport`), shown in a review table to check and edit, and
 * only then uploaded, one at a time. Nothing goes into the pack until its file has uploaded: a card is added only with its art in place, and a
 * failed row stays in the table to retry.
 */
export function ImportDialog({ files, existing, onClose, onApply }: {
  files: File[];
  existing: WorkCard[];
  onClose: () => void;
  /** Receives one change for everything that uploaded (a single undo step) and the ids of the new cards. */
  onApply: (edit: (cards: WorkCard[]) => WorkCard[], newIds: string[]) => void;
}) {
  const tooMany = files.length > MAX_IMPORT_FILES;
  const used = useMemo(() => files.slice(0, MAX_IMPORT_FILES), [files]);
  const [rows, setRows] = useState<ImportRow[]>(() => planImport(used.map(f => ({ name: f.name, size: f.size, type: f.type })), existing.map(c => ({ id: c.id, number: c.number, name: c.name }))));
  const [on, setOn] = useState<Set<number>>(() => new Set(rows.filter(r => !blocked(r)).map(r => r.file)));
  const [edits, setEdits] = useState<Record<number, { name?: string; number?: number }>>({});
  const [status, setStatus] = useState<Record<number, Status>>({});
  const [phase, setPhase] = useState('');
  const [busy, setBusy] = useState(false);
  const created = useRef(new Map<number, string>()); // file index -> id of the card made from it
  const urls = useMemo(() => used.map(f => (/^image\//.test(f.type) || /\.(png|jpe?g|webp|gif|avif)$/i.test(f.name) ? URL.createObjectURL(f) : '')), [used]);
  useEffect(() => () => urls.forEach(u => u && URL.revokeObjectURL(u)), [urls]);

  const nameOf = (r: ImportRow) => edits[r.file]?.name ?? r.name;
  const numberOf = (r: ImportRow) => edits[r.file]?.number ?? r.number;
  const pending = rows.filter(r => on.has(r.file) && status[r.file]?.state !== 'done');
  const doneCount = Object.values(status).filter(s => s.state === 'done').length;

  async function upload(f: File, sound: boolean): Promise<string> {
    return sound ? uploadAudioFile(f) : uploadImageFile(f, p => setPhase(p === 'uploading' ? 'Uploading' : 'Making it smaller'));
  }

  async function run() {
    setBusy(true);
    const urlOf = new Map<number, string>();
    const set = (i: number, s: Status) => setStatus(x => ({ ...x, [i]: s }));
    const order = [...pending].sort((a, b) => (a.kind === 'new' ? 0 : 1) - (b.kind === 'new' ? 0 : 1));
    for (const r of order) {
      const target = r.target && 'file' in r.target ? r.target.file : undefined;
      if (target !== undefined && !urlOf.has(target) && !created.current.has(target)) { set(r.file, { state: 'failed', error: 'Waiting for its card, whose picture did not upload.' }); continue; }
      set(r.file, { state: 'uploading' });
      try {
        urlOf.set(r.file, await upload(used[r.file], r.kind === 'sound'));
        set(r.file, { state: 'done' });
      } catch (e) {
        set(r.file, { state: 'failed', error: e instanceof Error ? e.message : 'Upload failed' });
      }
    }
    setPhase('');
    // One change for everything that uploaded.
    const done = order.filter(r => urlOf.has(r.file));
    const newRows = done.filter(r => r.kind === 'new');
    const ids = new Map<number, string>(created.current);
    for (const r of newRows) ids.set(r.file, crypto.randomUUID());
    const patches = new Map<string, Partial<WorkCard>>();
    for (const r of done.filter(x => x.kind !== 'new')) {
      const id = r.target ? ('existing' in r.target ? r.target.existing : ids.get(r.target.file)) : undefined;
      if (!id) continue;
      patches.set(id, { ...(patches.get(id) ?? {}), ...(r.kind === 'fullart' ? { fullArtImageUrl: urlOf.get(r.file)! } : { soundUrl: urlOf.get(r.file)! }) });
    }
    const added = newRows.map(r => newWorkCard(ids.get(r.file)!, { name: nameOf(r).trim(), number: Math.max(0, Math.round(numberOf(r))), imageUrl: urlOf.get(r.file)!, stars: 1, probability: 1, ...(patches.get(ids.get(r.file)!) ?? {}) }));
    for (const r of newRows) { created.current.set(r.file, ids.get(r.file)!); patches.delete(ids.get(r.file)!); }
    onApply(cs => [...cs.map(c => (patches.has(c.id) ? { ...c, ...patches.get(c.id)! } : c)), ...added], added.map(c => c.id));
    setBusy(false);
    const failed = order.filter(r => !urlOf.has(r.file));
    if (failed.length === 0) onClose();
  }

  const failedCount = Object.values(status).filter(s => s.state === 'failed').length;
  const total = pending.length + doneCount;

  return (
    <Dialog open onClose={busy ? () => undefined : onClose} title="Import art" size="lg">
      <div className="space-y-3">
        <p className="text-sm text-gray-400">
          Each picture becomes a card named from its file name (<code>012 Gouda Goat.webp</code>, <code>gouda_goat.png</code>). A <code>-fa</code> or <code>_fullart</code> picture becomes the full art of the card with the same name, and a sound file with the same name becomes that card&apos;s sound. New cards start at 1 star and weight 1; set them in the grid afterwards.
        </p>
        {tooMany && <p role="alert" className="text-sm text-amber-300">Only the first {MAX_IMPORT_FILES} files are used. Import the rest in another drop.</p>}
        <div className="max-h-[50vh] overflow-auto rounded-xl border border-gray-800">
          <table className="table table-xs w-full text-sm min-w-160">
            <thead className="sticky top-0 bg-gray-900 text-[11px] uppercase tracking-wider text-gray-500"><tr><th className="px-2 py-2 w-8"><span className="sr-only">Include</span></th><th className="px-2 py-2 w-14" /><th className="px-2 py-2 text-left">What it becomes</th><th className="px-2 py-2 text-left w-20">Number</th><th className="px-2 py-2 text-left">Name</th><th className="px-2 py-2 text-left">Notes</th></tr></thead>
            <tbody className="divide-y divide-gray-800/60">
              {rows.map(r => {
                const st = status[r.file];
                const bad = blocked(r);
                return (
                  <tr key={`${r.file}-${r.kind}`} className={st?.state === 'done' ? 'opacity-50' : ''}>
                    <td className="px-2"><input type="checkbox" aria-label={`Import ${used[r.file].name}`} disabled={bad || busy || st?.state === 'done'} checked={on.has(r.file) && !bad} onChange={e => setOn(s => { const n = new Set(s); if (e.target.checked) n.add(r.file); else n.delete(r.file); return n; })} className="accent-yellow-400" /></td>
                    <td className="px-2 py-1">{urls[r.file] ? <img src={urls[r.file]} alt="" className="w-10 h-14 object-cover rounded-sm" /> : <span className="w-10 h-14 rounded-sm bg-gray-800 flex items-center justify-center text-gray-500"><Icon name="music" /></span>}</td>
                    <td className="px-2 text-gray-300">
                      {r.skip && r.kind === 'new' ? 'Not used' : r.kind === 'new' ? 'New card' : r.kind === 'fullart' ? 'Full art' : 'Sound'}
                      {r.kind !== 'new' && r.targetName && <span className="block text-xs text-gray-500">of {r.targetName}</span>}
                      <span className="block text-[11px] text-gray-600 truncate max-w-40">{used[r.file].name}</span>
                    </td>
                    <td className="px-2">{r.kind === 'new' ? <input type="number" aria-label="Number" min={1} className={`${inputCls} py-1! px-2!`} value={numberOf(r)} disabled={busy} onChange={e => setEdits(x => ({ ...x, [r.file]: { ...x[r.file], number: Number(e.target.value) } }))} /> : null}</td>
                    <td className="px-2">{r.kind === 'new' ? <input aria-label="Name" className={`${inputCls} py-1! px-2!`} value={nameOf(r)} maxLength={80} disabled={busy} onChange={e => setEdits(x => ({ ...x, [r.file]: { ...x[r.file], name: e.target.value } }))} /> : <span className="text-gray-500">{r.name}</span>}</td>
                    <td className="px-2 text-xs">
                      {st?.state === 'uploading' && <span className="text-sky-300">{phase || 'Uploading'}…</span>}
                      {st?.state === 'done' && <span className="text-emerald-300">Done</span>}
                      {st?.state === 'failed' && <span className="text-red-300">{st.error}</span>}
                      {(!st || st.state === 'idle') && r.problems.map(p => <span key={p} className={`block ${blocked(r) ? 'text-red-300' : 'text-amber-300'}`}>{p}</span>)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {busy && <div role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={doneCount + failedCount} className="h-2 rounded-full bg-gray-800 overflow-hidden"><div className="h-full bg-yellow-500 transition-all" style={{ width: `${total ? ((doneCount + failedCount) / total) * 100 : 0}%` }} /></div>}
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-gray-500">{pending.length} to import{failedCount > 0 ? `, ${failedCount} failed (press Import to retry them)` : ''}. Nothing is added to the pack for a file that did not upload.</p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={busy} className="px-4 py-2 text-sm text-gray-300 hover:text-white disabled:opacity-40">{doneCount > 0 ? 'Close' : 'Cancel'}</button>
            <button type="button" onClick={() => void run()} disabled={busy || pending.length === 0 || pending.every(r => blocked(r))} className="px-4 py-2 btn btn-primary rounded-lg text-sm disabled:opacity-50">{busy ? 'Importing…' : `Import ${pending.length}`}</button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

export { parseArtFileName };

/** The files of a drop, folders included (read through the entries API; a plain file list for a file drop). */
export async function filesFromDrop(dt: DataTransfer): Promise<File[]> {
  const items = [...dt.items].filter(i => i.kind === 'file');
  const entries = items.map(i => (i as DataTransferItem & { webkitGetAsEntry?: () => FileSystemEntry | null }).webkitGetAsEntry?.()).filter((e): e is FileSystemEntry => !!e);
  if (entries.length === 0) return [...dt.files];
  const out: File[] = [];
  async function walk(e: FileSystemEntry): Promise<void> {
    if (e.isFile) { out.push(await new Promise<File>((res, rej) => (e as FileSystemFileEntry).file(res, rej))); return; }
    const reader = (e as FileSystemDirectoryEntry).createReader();
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
      if (batch.length === 0) break;
      for (const c of batch) await walk(c);
    }
  }
  for (const e of entries) await walk(e);
  return out;
}
