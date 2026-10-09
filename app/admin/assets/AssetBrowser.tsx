'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { AssetIssue, AssetKind, AssetLibrary, BlobProblem, LibraryAsset, UnusedBlob } from '@/lib/assets';
import { CardTile } from '@/app/components/CardTile';
import { ConfirmButton } from '../components/ConfirmButton';
import { deleteUnusedAssets } from '../actions';

type Tab = AssetKind | 'unused';
type Sort = 'default' | 'size' | 'issues';

const TABS: { key: Tab; label: string }[] = [
  { key: 'card-art', label: 'Card art' },
  { key: 'pack-cover', label: 'Pack covers' },
  { key: 'sound', label: 'Sounds' },
  { key: 'unused', label: 'Unused' },
];

const ISSUE_TEXT: Record<AssetIssue, { label: string; hint: string; tone: 'red' | 'amber' }> = {
  'legacy-gif': { label: 'GIF', hint: 'Still a GIF, which is huge. Re-upload it on its edit page to convert it to an optimized WebP.', tone: 'amber' },
  missing: { label: 'File missing', hint: 'This URL no longer resolves, so viewers will see a broken image/sound.', tone: 'red' },
  'no-thumbnail': { label: 'No thumbnail', hint: 'The static thumbnail next to this card art is missing, so grids will show a broken image. Re-upload it to regenerate.', tone: 'amber' },
  heavy: { label: 'Very large', hint: 'Unusually large for its type; consider re-encoding it.', tone: 'amber' },
};

export function formatBytes(bytes: number | null): string {
  if (bytes === null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

function filename(url: string): string {
  try {
    return decodeURIComponent(new URL(url, 'http://x').pathname.split('/').pop() ?? '');
  } catch {
    return url.split('/').pop() ?? url;
  }
}

export function AssetBrowser({ library }: { library: AssetLibrary }) {
  const { assets, unused, blobConnected, blobProblem } = library;
  const [tab, setTab] = useState<Tab>('card-art');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('default');
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const byKind = (kind: AssetKind) => assets.filter(a => a.kind === kind);
  const issueCount = (list: LibraryAsset[]) => list.filter(a => a.issues.length > 0).length;

  const totals = useMemo(() => {
    const inUse = assets.reduce((s, a) => s + (a.bytes ?? 0), 0);
    return {
      inUse,
      attention: issueCount(assets),
      unusedBytes: unused.reduce((s, u) => s + u.bytes, 0),
    };
  }, [assets, unused]);

  const visibleAssets = useMemo(() => {
    if (tab === 'unused') return [];
    let list = byKind(tab).filter(a => {
      if (onlyIssues && a.issues.length === 0) return false;
      if (!q) return true;
      const o = a.origin;
      const hay = [filename(a.url), o.packName, o.kind === 'pack-cover' ? '' : o.cardName, o.kind === 'pack-cover' ? '' : `#${o.cardNumber}`].join(' ').toLowerCase();
      return hay.includes(q);
    });
    if (sort === 'size') list = [...list].sort((a, b) => (b.bytes ?? -1) - (a.bytes ?? -1));
    if (sort === 'issues') list = [...list].sort((a, b) => b.issues.length - a.issues.length);
    return list;
  }, [assets, tab, q, sort, onlyIssues]);

  const visibleUnused = useMemo(
    () => unused.filter(u => !q || u.pathname.toLowerCase().includes(q)),
    [unused, q],
  );

  function copy(url: string) {
    // Local assets are stored as paths; copy something that works when pasted elsewhere.
    const full = url.startsWith('/') ? window.location.origin + url : url;
    navigator.clipboard.writeText(full).then(() => {
      setCopied(url);
      setTimeout(() => setCopied(c => (c === url ? null : c)), 1800);
    });
  }

  return (
    <div className="space-y-5">
      {/* Health summary */}
      <div className="flex flex-wrap gap-3 text-sm">
        <Stat label="Files in use" value={String(assets.length)} sub={`${formatBytes(totals.inUse)} total`} />
        <Stat
          label="Need attention"
          value={String(totals.attention)}
          sub={totals.attention === 0 ? 'all healthy' : 'see flagged files'}
          tone={totals.attention > 0 ? 'amber' : 'green'}
          onClick={totals.attention > 0 ? () => { setOnlyIssues(true); if (tab === 'unused') setTab('card-art'); } : undefined}
        />
        <Stat
          label="Unused"
          value={blobConnected ? String(unused.length) : '—'}
          sub={blobConnected ? (unused.length ? `${formatBytes(totals.unusedBytes)} to reclaim` : 'nothing to clean up') : 'storage unavailable'}
          tone={unused.length > 0 ? 'amber' : undefined}
          onClick={blobConnected && unused.length > 0 ? () => setTab('unused') : undefined}
        />
      </div>

      {/* Tabs + controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 tcg-panel rounded-xl p-1 w-fit">
          {TABS.map(t => {
            const count = t.key === 'unused' ? unused.length : byKind(t.key).length;
            const flagged = t.key === 'unused' ? 0 : issueCount(byKind(t.key));
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-colors flex items-center gap-2 ${
                  tab === t.key ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {t.label}
                <span className={`text-xs px-1.5 py-0.5 rounded-full tabular-nums ${tab === t.key ? 'bg-gray-700 text-gray-300' : 'bg-gray-800/60 text-gray-500'}`}>
                  {t.key === 'unused' && !blobConnected ? '—' : count}
                </span>
                {flagged > 0 && <span title={`${flagged} need attention`} className="w-2 h-2 rounded-full bg-amber-400" />}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search name, pack or #…"
            aria-label="Search assets"
            className="bg-gray-950 border border-gray-700 rounded-xl px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500 w-48"
          />
          {tab !== 'unused' && (
            <>
              <select
                value={sort}
                onChange={e => setSort(e.target.value as Sort)}
                aria-label="Sort"
                className="bg-gray-950 border border-gray-700 rounded-xl px-2 py-1.5 text-sm text-gray-300 focus:outline-none focus:border-yellow-500"
              >
                <option value="default">Default order</option>
                <option value="size">Largest first</option>
                <option value="issues">Flagged first</option>
              </select>
              <label className="flex items-center gap-1.5 text-sm text-gray-400 cursor-pointer select-none">
                <input type="checkbox" checked={onlyIssues} onChange={e => setOnlyIssues(e.target.checked)} className="accent-yellow-500" />
                Needs attention
              </label>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      {tab === 'unused' ? (
        <UnusedPanel items={visibleUnused} all={unused} blobConnected={blobConnected} problem={blobProblem} copy={copy} copied={copied} />
      ) : visibleAssets.length === 0 ? (
        <div className="py-16 text-center text-sm text-gray-500">
          {onlyIssues || q ? 'Nothing matches the current filters.' : 'No files here yet — they appear once packs and cards use them.'}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {visibleAssets.map((asset, i) => (
            <AssetCard key={asset.url + i} asset={asset} copied={copied === asset.url} onCopy={() => copy(asset.url)} />
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({
  label, value, sub, tone, onClick,
}: { label: string; value: string; sub: string; tone?: 'amber' | 'green'; onClick?: () => void }) {
  const color = tone === 'amber' ? 'text-amber-300' : tone === 'green' ? 'text-green-300' : 'text-white';
  const body = (
    <>
      <p className="text-[11px] text-gray-500 font-bold uppercase tracking-wider">{label}</p>
      <p className={`font-display text-2xl font-bold tabular-nums ${color}`}>{value}</p>
      <p className="text-xs text-gray-500">{sub}</p>
    </>
  );
  const cls = 'tcg-panel rounded-xl px-4 py-3 min-w-[9rem] text-left';
  return onClick ? (
    <button onClick={onClick} className={`${cls} hover:border-yellow-500/40 transition-colors`}>{body}</button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function IssueChips({ asset }: { asset: LibraryAsset }) {
  if (asset.issues.length === 0) {
    return asset.optimized
      ? <span className="text-[10px] font-extrabold uppercase tracking-wider text-green-300 bg-green-500/10 border border-green-400/30 rounded-full px-1.5 py-px">✓ Optimized</span>
      : null;
  }
  return (
    <>
      {asset.issues.map(issue => {
        const info = ISSUE_TEXT[issue];
        return (
          <span
            key={issue}
            title={info.hint}
            className={`text-[10px] font-extrabold uppercase tracking-wider rounded-full px-1.5 py-px border cursor-help ${
              info.tone === 'red'
                ? 'text-red-300 bg-red-500/10 border-red-400/30'
                : 'text-amber-300 bg-amber-500/10 border-amber-400/30'
            }`}
          >
            ⚠ {info.label}
          </span>
        );
      })}
    </>
  );
}

function AssetCard({ asset, copied, onCopy }: { asset: LibraryAsset; copied: boolean; onCopy: () => void }) {
  const { origin } = asset;
  const isCover = origin.kind === 'pack-cover';
  const title = isCover ? origin.packName : origin.cardName;
  const sub = isCover ? 'Pack cover' : asset.kind === 'sound' ? `Card #${origin.cardNumber} · sound` : `Card #${origin.cardNumber}`;
  const href = isCover ? `/admin/packs/${origin.packId}` : `/admin/packs/${origin.packId}/cards/${origin.cardId}`;
  const broken = asset.issues.includes('missing');

  return (
    <div className="tcg-panel rounded-xl overflow-hidden flex flex-col">
      {/* Preview */}
      <div className="h-36 bg-gray-950/60 flex items-center justify-center overflow-hidden p-2">
        {broken ? (
          <span className="text-3xl opacity-60" aria-hidden>🚫</span>
        ) : asset.kind === 'sound' ? (
          <div className="w-full flex flex-col items-center gap-2">
            <span className="text-3xl" aria-hidden>🎵</span>
            <audio controls preload="none" src={asset.url} className="w-full" style={{ height: 24 }} />
          </div>
        ) : asset.kind === 'card-art' ? (
          // Static thumbnail; the animated file loads only on hover.
          <CardTile
            imageUrl={asset.url}
            alt={title}
            className="relative h-full aspect-[2/3] rounded-md overflow-hidden border border-gray-700 bg-gray-800"
          />
        ) : (
          <img src={asset.url} alt={title} loading="lazy" className="max-h-full max-w-full object-contain rounded" />
        )}
      </div>

      {/* Details */}
      <div className="p-2.5 space-y-2 flex-1 flex flex-col">
        <div className="space-y-0.5 flex-1 min-w-0">
          <p className="text-sm font-bold text-white truncate" title={title}>{title}</p>
          <p className="text-xs text-gray-500">{sub} · {origin.packName}</p>
          <p className="text-[11px] text-gray-600 font-mono truncate" title={asset.url}>{filename(asset.url)}</p>
          <div className="flex flex-wrap items-center gap-1 pt-1">
            <span className="text-[10px] font-bold text-gray-300 bg-gray-800 rounded px-1.5 py-px">{asset.format}</span>
            <span className="text-[10px] font-bold text-gray-300 bg-gray-800 rounded px-1.5 py-px tabular-nums">{formatBytes(asset.bytes)}</span>
            <IssueChips asset={asset} />
          </div>
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={onCopy}
            className="flex-1 text-xs py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded-lg transition-colors"
          >
            {copied ? '✓ Copied' : 'Copy URL'}
          </button>
          <Link
            href={href}
            className="flex-1 text-center text-xs py-1.5 bg-gray-800 hover:bg-gray-700 text-yellow-300 rounded-lg transition-colors"
            title={isCover ? 'Open this pack to replace its cover' : 'Open this card to replace its art or sound'}
          >
            {asset.issues.length > 0 ? 'Fix →' : 'Edit →'}
          </Link>
        </div>
      </div>
    </div>
  );
}

function UnusedPanel({
  items, all, blobConnected, problem, copy, copied,
}: { items: UnusedBlob[]; all: UnusedBlob[]; blobConnected: boolean; problem?: BlobProblem; copy: (url: string) => void; copied: string | null }) {
  if (!blobConnected) {
    return (
      <div className="tcg-panel rounded-xl p-6 text-sm text-gray-400 space-y-2">
        {problem?.kind === 'error' ? (
          <>
            <p>
              Blob storage is configured here, but reading it failed, so unused files can&apos;t be checked.
            </p>
            <p className="font-mono text-xs text-amber-300 break-words">{problem.message}</p>
            <p className="text-xs text-gray-500">
              Check the store is still linked to this project and not suspended (Vercel → Storage). Your cards and covers are unaffected.
            </p>
          </>
        ) : (
          <>
            <p>
              This environment has no <code className="text-gray-300">BLOB_READ_WRITE_TOKEN</code>, so unused files can&apos;t be checked here.
            </p>
            <p className="text-xs text-gray-500">
              On Vercel, make sure the variable is enabled for this environment — a <strong className="text-gray-400">Preview</strong> deployment
              doesn&apos;t get Production-only variables. If you&apos;re viewing production, check Settings → Environment Variables and redeploy.
            </p>
          </>
        )}
      </div>
    );
  }
  if (all.length === 0) {
    return <div className="py-16 text-center text-sm text-gray-500">Nothing to clean up — every file in storage is in use. 🎉</div>;
  }

  const totalBytes = all.reduce((s, u) => s + u.bytes, 0);

  return (
    <div className="space-y-4">
      <div className="tcg-panel rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-400 max-w-xl">
          These files are in Blob storage but no card or pack points at them (leftover originals, replaced art, abandoned uploads).
          Files uploaded in the last 10 minutes are hidden in case they&apos;re still being processed.
        </p>
        <form action={deleteUnusedAssets}>
          {all.map(u => <input key={u.url} type="hidden" name="url" value={u.url} />)}
          <ConfirmButton
            title="Delete all unused files?"
            confirmLabel={`Delete ${all.length} file${all.length !== 1 ? 's' : ''}`}
            message={<>Permanently delete <strong className="text-white">{all.length} unused file{all.length !== 1 ? 's' : ''}</strong> ({formatBytes(totalBytes)}) from storage? Anything still in use is skipped automatically. This can&apos;t be undone.</>}
            className="px-4 py-2 text-sm font-bold bg-red-600/90 hover:bg-red-500 text-white rounded-xl transition-colors"
          >
            Delete all unused ({formatBytes(totalBytes)})
          </ConfirmButton>
        </form>
      </div>

      {items.length === 0 ? (
        <div className="py-10 text-center text-sm text-gray-500">No unused files match your search.</div>
      ) : (
        <div className="tcg-panel rounded-xl overflow-hidden divide-y divide-gray-800/60">
          {items.map(u => {
            const isImage = ['WebP', 'PNG', 'JPEG', 'GIF'].includes(u.format);
            const previewable = isImage && u.bytes <= 1.5 * 1024 * 1024; // never pull a 25MB original just to preview it
            return (
              <div key={u.url} className="flex items-center gap-3 px-4 py-2.5">
                <div className="w-10 h-14 rounded bg-gray-800 flex items-center justify-center overflow-hidden shrink-0 text-lg">
                  {previewable ? <img src={u.url} alt="" loading="lazy" className="w-full h-full object-cover" /> : <span aria-hidden>{u.format === 'GIF' ? '🎞️' : isImage ? '🖼️' : '🎵'}</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white font-mono truncate" title={u.pathname}>{u.pathname}</p>
                  <p className="text-xs text-gray-500">
                    {u.format} · {formatBytes(u.bytes)} · uploaded {new Date(u.uploadedAt).toLocaleDateString()}
                  </p>
                </div>
                <button onClick={() => copy(u.url)} className="text-xs px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors">
                  {copied === u.url ? '✓ Copied' : 'Copy URL'}
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
