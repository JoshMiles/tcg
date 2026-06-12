'use client';
import { useState } from 'react';
import Link from 'next/link';
import type { AssetItem, AssetType } from './page';

const TABS: { key: AssetType; label: string }[] = [
  { key: 'gif',   label: 'GIFs'   },
  { key: 'image', label: 'Images' },
  { key: 'audio', label: 'Audio'  },
];

function filename(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '');
  } catch {
    return url.split('/').pop() ?? url;
  }
}

export function AssetBrowser({ assets }: { assets: AssetItem[] }) {
  const [tab, setTab] = useState<AssetType>('gif');
  const [copied, setCopied] = useState<string | null>(null);

  const counts = Object.fromEntries(TABS.map(t => [t.key, assets.filter(a => a.type === t.key).length]));
  const filtered = assets.filter(a => a.type === tab);

  function copy(url: string) {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(url);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  return (
    <div className="space-y-5">
      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
              tab === t.key ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {t.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full tabular-nums ${
              tab === t.key ? 'bg-gray-700 text-gray-300' : 'bg-gray-800/60 text-gray-600'
            }`}>
              {counts[t.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="py-20 text-center text-gray-600 text-sm">
          No {tab} assets found — add some cards or packs to see assets here.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {filtered.map((asset, i) => (
            <AssetCard
              key={i}
              asset={asset}
              copied={copied === asset.url}
              onCopy={() => copy(asset.url)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AssetCard({ asset, copied, onCopy }: { asset: AssetItem; copied: boolean; onCopy: () => void }) {
  const { origin } = asset;

  const label =
    origin.kind === 'pack-cover'
      ? 'Pack Cover'
      : origin.kind === 'card-image'
      ? `Card #${origin.cardNumber}`
      : `Card #${origin.cardNumber} · Sound`;

  const primaryName = origin.kind === 'pack-cover' ? origin.packName : origin.cardName;

  const href =
    origin.kind === 'pack-cover'
      ? `/admin/packs/${origin.packId}`
      : `/admin/packs/${origin.packId}/cards/${origin.cardId}`;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden hover:border-gray-700 transition-colors flex flex-col">

      {/* Preview */}
      {asset.type === 'audio' ? (
        <div className="h-28 bg-gray-800 flex flex-col items-center justify-center gap-2 px-3">
          <span className="text-3xl">🎵</span>
          <p className="text-xs text-gray-500 text-center truncate w-full px-1">{filename(asset.url)}</p>
          <audio controls src={asset.url} className="w-full" style={{ height: '24px' }} />
        </div>
      ) : (
        <div className="h-28 bg-gray-800 flex items-center justify-center overflow-hidden">
          <img
            src={asset.url}
            alt={primaryName}
            loading="lazy"
            className="w-full h-full object-contain p-1"
          />
        </div>
      )}

      {/* Metadata */}
      <div className="p-2.5 space-y-2 flex-1 flex flex-col">
        <div className="space-y-0.5 flex-1">
          <p className="text-xs font-medium text-white truncate" title={primaryName}>{primaryName}</p>
          <p className="text-xs text-gray-500">{label}</p>
          <Link
            href={href}
            className="text-xs text-gray-600 hover:text-yellow-500 transition-colors truncate block"
            title={origin.packName}
          >
            {origin.packName} →
          </Link>
        </div>
        <button
          onClick={onCopy}
          className="w-full text-xs py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded-lg transition-colors"
        >
          {copied ? '✓ Copied' : 'Copy URL'}
        </button>
      </div>
    </div>
  );
}
