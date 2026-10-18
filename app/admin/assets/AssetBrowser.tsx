'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/app/components/Icon';
import { CardTile } from '@/app/components/CardTile';
import type { AssetKind, AssetLibrary, LibraryAsset } from '@/lib/assets';
import { fixAssetAction } from '../asset-actions';
import { AssetDetail } from './AssetDetail';
import { AssetInsights } from './AssetInsights';
import { UnusedPanel } from './UnusedPanel';
import { IssueChips, KIND_LABEL, SizeBar, assetTitle, filename, formatBytes, isFixable } from './asset-ui';
import { keyOf } from './replace-key';
import { useReplace } from './useReplace';
import { useOptimise } from './useOptimise';
import { BITRATES, DEFAULT_MP3, type Mp3Options } from '@/lib/audio-encode';
import { useSlashFocus } from '../components/use-slash-focus';

export type AssetTab = AssetKind | 'unused' | 'insights';
type Sort = 'default' | 'size' | 'issues';
type View = 'grid' | 'list' | 'compact';
type FixNote = { ok: boolean; message: string };

const VIEWS: { id: View; label: string; icon: 'grid' | 'list' | 'cards' }[] = [
  { id: 'grid', label: 'Grid', icon: 'grid' }, { id: 'compact', label: 'Compact', icon: 'cards' }, { id: 'list', label: 'List', icon: 'list' },
];
const GRID: Record<View, string> = {
  grid: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4',
  compact: 'grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2.5',
  list: '',
};
const CHECKER = 'bg-[conic-gradient(#0b1020_25%,#111a30_0_50%,#0b1020_0_75%,#111a30_0)] bg-size-[14px_14px]';

export function AssetBrowser({ library, tab, issuesOnly }: { library: AssetLibrary; tab: AssetTab; issuesOnly?: boolean }) {
  const router = useRouter();
  const { assets, unused, blobConnected, blobProblem } = library;
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('default');
  const [onlyIssues, setOnlyIssues] = useState(!!issuesOnly);
  const [view, setView] = useState<View>('grid');
  const [copied, setCopied] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [fixing, setFixing] = useState<{ current: string | null; done: number; total: number } | null>(null);
  const [notes, setNotes] = useState<Record<string, FixNote>>({});
  const [summary, setSummary] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const rep = useReplace();
  const opt = useOptimise();
  const [mp3, setMp3] = useState<Mp3Options>(DEFAULT_MP3);

  useEffect(() => { try { const v = localStorage.getItem('tcg_assets_view'); if (v === 'grid' || v === 'list' || v === 'compact') setView(v); } catch { /* optional */ } }, []);
  useEffect(() => setOnlyIssues(!!issuesOnly), [issuesOnly]);
  useEffect(() => { setSelected(new Set()); setOpenId(null); }, [tab]);
  useSlashFocus(searchRef);
  const chooseView = (v: View) => { setView(v); try { localStorage.setItem('tcg_assets_view', v); } catch { /* optional */ } };

  const q = query.trim().toLowerCase();
  const kindTab = tab === 'unused' || tab === 'insights' ? null : tab;

  const visible = useMemo(() => {
    if (!kindTab) return [];
    let list = assets.filter(a => {
      if (a.kind !== kindTab) return false;
      if (onlyIssues && a.issues.length === 0) return false;
      if (!q) return true;
      const o = a.origin;
      return [filename(a.url), o.packName, o.kind === 'pack-cover' ? '' : o.cardName, o.kind === 'pack-cover' ? '' : `#${o.cardNumber}`].join(' ').toLowerCase().includes(q);
    });
    if (sort === 'size') list = [...list].sort((a, b) => (b.bytes ?? -1) - (a.bytes ?? -1));
    if (sort === 'issues') list = [...list].sort((a, b) => b.issues.length - a.issues.length);
    return list;
  }, [assets, kindTab, q, sort, onlyIssues]);
  const visibleUnused = useMemo(() => unused.filter(u => !q || u.pathname.toLowerCase().includes(q)), [unused, q]);
  const maxBytes = Math.max(1, ...visible.map(a => a.bytes ?? 0));

  const byId = useMemo(() => new Map(assets.map(a => [a.id, a])), [assets]);
  const open = openId ? byId.get(openId) ?? null : null;
  const openIndex = open ? visible.findIndex(a => a.id === open.id) : -1;
  const step = useCallback((d: -1 | 1) => {
    if (visible.length === 0) return;
    const i = openIndex < 0 ? 0 : (openIndex + d + visible.length) % visible.length;
    setOpenId(visible[i].id);
  }, [visible, openIndex]);

  function copy(url: string) {
    const full = url.startsWith('/') ? window.location.origin + url : url; // local assets are stored as paths
    navigator.clipboard.writeText(full).then(() => { setCopied(url); setTimeout(() => setCopied(c => (c === url ? null : c)), 1800); });
  }
  const toggle = (id: string) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  /** Repairs files one at a time (each can take several seconds), showing progress; refreshes the page at the end. */
  async function runFix(list: LibraryAsset[]) {
    const todo = list.filter(isFixable);
    if (todo.length === 0 || fixing) return;
    setSummary(null);
    let ok = 0; const done: Record<string, FixNote> = {};
    for (let i = 0; i < todo.length; i++) {
      setFixing({ current: todo[i].id, done: i, total: todo.length });
      try {
        const r = await fixAssetAction(keyOf(todo[i]));
        done[todo[i].id] = { ok: r.ok, message: r.message };
        if (r.ok) ok++;
      } catch {
        done[todo[i].id] = { ok: false, message: 'The request failed. Try again.' };
      }
      setNotes(n => ({ ...n, ...done }));
    }
    setFixing(null);
    setSelected(new Set());
    setSummary(`Fixed ${ok} of ${todo.length} file${todo.length === 1 ? '' : 's'}.${ok < todo.length ? ' Open a flagged file to see why the rest could not be fixed.' : ''}`);
    router.refresh();
  }

  const flaggedFixable = assets.filter(isFixable);
  const gifs = assets.filter(a => a.format === 'GIF' && isFixable(a));
  const selectedAssets = [...selected].map(id => byId.get(id)).filter((a): a is LibraryAsset => !!a);
  const selectedFixable = selectedAssets.filter(isFixable);
  const showToolbar = kindTab !== null || tab === 'unused';

  return (
    <div className="space-y-5">
      {opt.summary && (
        <div role="status" className="rounded-xl border border-green-500/30 bg-green-950/30 text-green-300 px-4 py-2.5 text-sm flex items-center gap-2">
          <Icon name="check" />{opt.summary}
          <button onClick={opt.clearSummary} className="ml-auto text-xs opacity-70 hover:opacity-100">Dismiss</button>
        </div>
      )}
      {opt.progress && (
        <div className="tcg-panel rounded-xl px-4 py-3 space-y-2" role="status">
          <p className="text-sm text-gray-200"><Icon name="zap" className="mr-1.5 text-yellow-400" />Optimising {opt.progress.what} {opt.progress.done + 1} of {opt.progress.total}…<span className="text-gray-500"> keep this page open.</span></p>
          <SizeBar value={opt.progress.done + 0.5} max={opt.progress.total} />
        </div>
      )}
      {(summary || rep.error) && (
        <div role="status" className={`rounded-xl border px-4 py-2.5 text-sm flex items-center gap-2 ${rep.error ? 'border-red-500/30 bg-red-950/30 text-red-300' : 'border-green-500/30 bg-green-950/30 text-green-300'}`}>
          <Icon name={rep.error ? 'warning' : 'check'} />{rep.error ?? summary}
          <button onClick={() => { setSummary(null); rep.clearError(); }} className="ml-auto text-xs opacity-70 hover:opacity-100">Dismiss</button>
        </div>
      )}
      {fixing && (
        <div className="tcg-panel rounded-xl px-4 py-3 space-y-2" role="status">
          <p className="text-sm text-gray-200"><Icon name="wrench" className="mr-1.5 text-yellow-400" />Fixing {fixing.done + 1} of {fixing.total}…<span className="text-gray-500"> large GIFs can take up to a minute each. Keep this page open.</span></p>
          <SizeBar value={fixing.done + 0.5} max={fixing.total} />
        </div>
      )}

      {showToolbar && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input ref={searchRef} type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name, pack or #…  ( / )" aria-label="Search assets"
              className="bg-gray-950 border border-gray-700 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-hidden focus:border-yellow-500 w-64" />
          </div>
          {kindTab && (
            <>
              <select value={sort} onChange={e => setSort(e.target.value as Sort)} aria-label="Sort" className="bg-gray-950 border border-gray-700 rounded-xl px-2.5 py-2 text-sm text-gray-300 focus:outline-hidden focus:border-yellow-500">
                <option value="default">Default order</option><option value="size">Largest first</option><option value="issues">Flagged first</option>
              </select>
              <button onClick={() => setOnlyIssues(v => !v)} aria-pressed={onlyIssues} className={`px-3 py-2 text-sm font-semibold rounded-xl border transition-colors ${onlyIssues ? 'border-amber-400/50 bg-amber-500/10 text-amber-200' : 'border-gray-700 text-gray-400 hover:text-white hover:border-gray-500'}`}>
                <Icon name="warning" className="mr-1.5" />Needs attention
              </button>
              <button onClick={() => setSelected(new Set(visible.filter(a => a.issues.length > 0).map(a => a.id)))} className="px-3 py-2 text-sm font-semibold rounded-xl border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-colors">Select flagged</button>
              <div className="ml-auto flex items-center gap-2">
                {kindTab === 'pack-cover' && visible.length > 0 && (
                  <button onClick={() => opt.optimiseCovers(visible)} disabled={!!fixing || !!opt.progress} title="Re-encode every cover as a WebP at the standard width; covers that are already small are left alone"
                    className="px-3 py-2 text-sm font-bold rounded-xl bg-yellow-500/10 border border-yellow-400/30 text-yellow-200 hover:bg-yellow-500/20 disabled:opacity-50 transition-colors">
                    <Icon name="zap" className="mr-1.5" />Optimise covers ({visible.length})
                  </button>
                )}
                {kindTab === 'sound' && visible.length > 0 && (
                  <div className="flex items-center gap-2">
                    <select value={mp3.kbps} onChange={e => setMp3({ ...mp3, kbps: Number(e.target.value) })} aria-label="Sound quality" className="bg-gray-950 border border-gray-700 rounded-xl px-2.5 py-2 text-sm text-gray-300 focus:outline-hidden focus:border-yellow-500">
                      {BITRATES.map(b => <option key={b} value={b}>{b} kbps</option>)}
                    </select>
                    <label className="flex items-center gap-1.5 text-sm text-gray-300"><input type="checkbox" checked={mp3.mono} onChange={e => setMp3({ ...mp3, mono: e.target.checked })} className="accent-yellow-500" />Mono</label>
                    <button onClick={() => opt.optimiseSounds(visible, mp3)} disabled={!!fixing || !!opt.progress} title="Re-encode every sound as an MP3 in your browser; a sound is only replaced when the new file is at least 15% smaller"
                      className="px-3 py-2 text-sm font-bold rounded-xl bg-yellow-500/10 border border-yellow-400/30 text-yellow-200 hover:bg-yellow-500/20 disabled:opacity-50 transition-colors">
                      <Icon name="zap" className="mr-1.5" />Optimise sounds ({visible.length})
                    </button>
                  </div>
                )}
                {flaggedFixable.length > 0 && (
                  <button onClick={() => runFix(flaggedFixable)} disabled={!!fixing} className="px-3 py-2 text-sm font-bold rounded-xl bg-yellow-500/10 border border-yellow-400/30 text-yellow-200 hover:bg-yellow-500/20 disabled:opacity-50 transition-colors">
                    <Icon name="wrench" className="mr-1.5" />Fix all ({flaggedFixable.length})
                  </button>
                )}
                <div className="flex tcg-panel rounded-xl p-0.5" role="group" aria-label="View">
                  {VIEWS.map(v => (
                    <button key={v.id} onClick={() => chooseView(v.id)} aria-pressed={view === v.id} title={v.label} className={`p-2 rounded-lg transition-colors ${view === v.id ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}><Icon name={v.icon} /></button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'insights' ? (
        <AssetInsights assets={assets} onOpen={a => { setOpenId(a.id); }} onFixGifs={() => runFix(gifs)} />
      ) : tab === 'unused' ? (
        <UnusedPanel items={visibleUnused} all={unused} blobConnected={blobConnected} problem={blobProblem} copy={copy} copied={copied} />
      ) : visible.length === 0 ? (
        <div className="py-16 text-center text-sm text-gray-500">{onlyIssues || q ? 'Nothing matches the current filters.' : 'No files here yet. They appear once packs and cards use them.'}</div>
      ) : view === 'list' ? (
        <div className="tcg-panel rounded-2xl overflow-hidden divide-y divide-gray-800/60">
          {visible.map(a => (
            <AssetRow key={a.id} asset={a} maxBytes={maxBytes} selected={selected.has(a.id)} onToggle={() => toggle(a.id)} onOpen={() => setOpenId(a.id)}
              busy={fixing?.current === a.id || opt.progress?.current === a.id || rep.busy === a.id} onDropFile={f => rep.replace(a, f)} />
          ))}
        </div>
      ) : (
        <div className={`grid ${GRID[view]}`}>
          {visible.map(a => (
            <AssetTile key={a.id} asset={a} compact={view === 'compact'} selected={selected.has(a.id)} onToggle={() => toggle(a.id)} onOpen={() => setOpenId(a.id)}
              busy={fixing?.current === a.id || opt.progress?.current === a.id || rep.busy === a.id} onDropFile={f => rep.replace(a, f)} />
          ))}
        </div>
      )}

      {selected.size > 0 && kindTab && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-2xl border border-gray-700 bg-gray-900/95 backdrop-blur-sm px-4 py-2.5 shadow-2xl max-w-[calc(100vw-2rem)]">
          <span className="text-sm text-gray-200 whitespace-nowrap"><strong>{selected.size}</strong> selected{selectedFixable.length !== selected.size && <span className="text-gray-500"> · {selectedFixable.length} fixable</span>}</span>
          <button onClick={() => runFix(selectedFixable)} disabled={selectedFixable.length === 0 || !!fixing} className="tcg-btn px-3.5 py-1.5 text-sm rounded-xl whitespace-nowrap"><Icon name="wrench" className="mr-1.5" />Fix {selectedFixable.length || ''}</button>
          <button onClick={() => setSelected(new Set())} className="text-sm text-gray-400 hover:text-white">Clear</button>
        </div>
      )}

      {open && (
        <AssetDetail
          asset={open} index={Math.max(0, openIndex)} total={Math.max(1, visible.length)} onClose={() => setOpenId(null)} onStep={step}
          onCopy={() => copy(open.url)} copied={copied === open.url}
          onFix={() => runFix([open])} fixing={fixing?.current === open.id} fixNote={notes[open.id] ?? null}
          onReplace={f => rep.replace(open, f)} replacing={rep.busy === open.id} replaceError={rep.error}
          onOptimiseCover={() => opt.optimiseCovers([open])} optimising={opt.progress?.current === open.id} optNote={opt.notes[open.id] ?? null}
        />
      )}
    </div>
  );
}

function Preview({ asset, className }: { asset: LibraryAsset; className?: string }) {
  const title = assetTitle(asset.origin);
  if (asset.issues.includes('missing')) return <Icon name="ban" className="w-8 h-8 text-red-300/70" />;
  if (asset.kind === 'sound') return <Icon name="music" className="w-8 h-8 text-gray-500" />;
  if (asset.kind === 'card-art') return <CardTile imageUrl={asset.url} alt={title} className={`relative aspect-2/3 rounded-md overflow-hidden ${className ?? 'h-full'}`} />;
  return <img src={asset.url} alt={title} loading="lazy" className="max-h-full max-w-full object-contain rounded-sm" />;
}

function useDrop(onDropFile: (f: File) => void) {
  const [over, setOver] = useState(false);
  return {
    over,
    props: {
      onDragOver: (e: React.DragEvent) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setOver(true); } },
      onDragLeave: () => setOver(false),
      onDrop: (e: React.DragEvent) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) onDropFile(f); },
    },
  };
}

const Check = ({ on, onToggle, label, always }: { on: boolean; onToggle: () => void; label: string; always?: boolean }) => (
  <button onClick={e => { e.stopPropagation(); onToggle(); }} aria-pressed={on} aria-label={label}
    className={`w-6 h-6 rounded-md border flex items-center justify-center transition-all ${on ? 'bg-yellow-400 border-yellow-300 text-gray-950 opacity-100' : `bg-gray-950/80 border-gray-600 text-transparent focus-visible:opacity-100 ${always ? 'opacity-70 hover:opacity-100' : 'opacity-0 group-hover:opacity-100'}`}`}>
    <Icon name="check" className="w-4 h-4" strokeWidth={3} />
  </button>
);

function BusyOverlay({ over, busy }: { over: boolean; busy: boolean }) {
  if (!over && !busy) return null;
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-950/75 backdrop-blur-[1px] text-sm font-bold text-yellow-200 text-center px-2">
      {busy ? <span className="animate-pulse">Working…</span> : 'Drop to replace'}
    </div>
  );
}

function AssetTile({ asset, compact, selected, onToggle, onOpen, busy, onDropFile }: { asset: LibraryAsset; compact: boolean; selected: boolean; onToggle: () => void; onOpen: () => void; busy: boolean; onDropFile: (f: File) => void }) {
  const drop = useDrop(onDropFile);
  const flagged = asset.issues.length > 0;
  const red = asset.issues.includes('missing');
  return (
    <div {...drop.props} className={`group relative tcg-panel rounded-2xl overflow-hidden flex flex-col transition-all hover:-translate-y-0.5 ${selected ? 'ring-2 ring-yellow-400' : flagged ? (red ? 'ring-1 ring-red-400/40' : 'ring-1 ring-amber-400/30') : ''}`}>
      <BusyOverlay over={drop.over} busy={busy} />
      <div className="absolute top-2 left-2 z-5"><Check on={selected} onToggle={onToggle} label={`Select ${assetTitle(asset.origin)}`} /></div>
      {flagged && <span title={asset.issues.join(', ')} className={`absolute top-2.5 right-2.5 z-5 w-2.5 h-2.5 rounded-full ${red ? 'bg-red-400' : 'bg-amber-400'} shadow-sm`} />}
      <button onClick={onOpen} aria-label={`Details for ${assetTitle(asset.origin)}`} className={`${CHECKER} ${compact ? 'h-24' : 'h-44'} flex items-center justify-center overflow-hidden p-2 focus-visible:outline-hidden focus-visible:ring-2 ring-inset ring-yellow-400/60`}>
        <Preview asset={asset} />
      </button>
      <div className={`${compact ? 'p-2' : 'p-3'} space-y-1 flex-1 min-w-0`}>
        <p className={`${compact ? 'text-xs' : 'text-sm'} font-bold text-white truncate`} title={assetTitle(asset.origin)}>{assetTitle(asset.origin)}</p>
        {!compact && <p className="text-xs text-gray-500 truncate">{asset.origin.kind === 'pack-cover' ? 'Pack cover' : `Card #${asset.origin.cardNumber}`} · {asset.origin.packName}</p>}
        <div className="flex flex-wrap items-center gap-1 pt-0.5">
          <span className="text-[10px] font-bold text-gray-300 bg-gray-800 rounded-sm px-1.5 py-px">{asset.format}</span>
          <span className="text-[10px] font-bold text-gray-300 bg-gray-800 rounded-sm px-1.5 py-px tabular-nums">{formatBytes(asset.bytes)}</span>
          {!compact && <IssueChips asset={asset} />}
        </div>
      </div>
    </div>
  );
}

function AssetRow({ asset, maxBytes, selected, onToggle, onOpen, busy, onDropFile }: { asset: LibraryAsset; maxBytes: number; selected: boolean; onToggle: () => void; onOpen: () => void; busy: boolean; onDropFile: (f: File) => void }) {
  const drop = useDrop(onDropFile);
  return (
    <div {...drop.props} className={`group relative flex items-center gap-3 px-4 py-2 transition-colors ${selected ? 'bg-yellow-500/6' : 'hover:bg-white/2'}`}>
      <BusyOverlay over={drop.over} busy={busy} />
      <Check always on={selected} onToggle={onToggle} label={`Select ${assetTitle(asset.origin)}`} />
      <button onClick={onOpen} className={`${CHECKER} w-10 h-14 rounded-md flex items-center justify-center overflow-hidden shrink-0`} aria-label={`Details for ${assetTitle(asset.origin)}`}>
        <Preview asset={asset} className="h-full" />
      </button>
      <div className="min-w-0 flex-1">
        <button onClick={onOpen} className="text-sm font-bold text-white truncate block max-w-full text-left hover:text-yellow-300">{assetTitle(asset.origin)}</button>
        <p className="text-xs text-gray-500 truncate">{KIND_LABEL[asset.kind]} · {asset.origin.packName} · <span className="font-mono">{filename(asset.url)}</span></p>
      </div>
      <div className="hidden md:flex flex-wrap gap-1 justify-end max-w-56"><IssueChips asset={asset} /></div>
      <div className="hidden sm:block w-32 shrink-0 space-y-1">
        <p className="text-xs text-right text-gray-300 tabular-nums"><span className="text-gray-500 mr-1.5">{asset.format}</span>{formatBytes(asset.bytes)}</p>
        <SizeBar value={asset.bytes ?? 0} max={maxBytes} tone={asset.issues.length ? 'amber' : 'yellow'} />
      </div>
      <button onClick={onOpen} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-800 hover:bg-gray-700 text-yellow-300 shrink-0">{asset.issues.length > 0 ? 'Fix →' : 'Details'}</button>
    </div>
  );
}
