'use client';
import { useMemo } from 'react';
import Link from 'next/link';
import { Icon } from '@/app/components/Icon';
import { CardTile } from '@/app/components/CardTile';
import { computeInsights, GIF_SAVINGS } from '@/lib/asset-insights';
import type { LibraryAsset } from '@/lib/assets';
import { KIND_LABEL, SizeBar, assetTitle, formatBytes } from './asset-ui';
import { Panel } from '../components/ui';

export function AssetInsights({ assets, onOpen, onFixGifs }: { assets: LibraryAsset[]; onOpen: (a: LibraryAsset) => void; onFixGifs: () => void }) {
  const ins = useMemo(() => computeInsights(assets), [assets]);
  const maxPack = Math.max(1, ...ins.perPack.map(p => p.bytes));
  const kinds = (Object.keys(ins.byKind) as (keyof typeof ins.byKind)[]);

  return (
    <div className="grid gap-6 xl:grid-cols-2 items-start">
      <Panel title="Where the weight is" hint="Everything the game references, by type.">
        <div className="flex h-3 rounded-full overflow-hidden bg-gray-800" role="img" aria-label="Storage by type">
          {kinds.map((k, i) => ins.totalBytes > 0 && ins.byKind[k].bytes > 0 && <div key={k} style={{ width: `${(ins.byKind[k].bytes / ins.totalBytes) * 100}%` }} className={['bg-yellow-400/80', 'bg-sky-400/80', 'bg-fuchsia-400/70'][i]} title={`${KIND_LABEL[k]}: ${formatBytes(ins.byKind[k].bytes)}`} />)}
        </div>
        <ul className="space-y-1.5 text-sm">
          {kinds.map((k, i) => (
            <li key={k} className="flex items-center gap-2.5">
              <span className={`w-2.5 h-2.5 rounded-xs ${['bg-yellow-400/80', 'bg-sky-400/80', 'bg-fuchsia-400/70'][i]}`} />
              <span className="text-gray-300">{KIND_LABEL[k]}</span>
              <span className="text-xs text-gray-600">{ins.byKind[k].files} file{ins.byKind[k].files === 1 ? '' : 's'}</span>
              <span className="ml-auto tabular-nums text-gray-200">{formatBytes(ins.byKind[k].bytes)}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-gray-500">
          {ins.averageCardArt !== null && <>Average card art: <strong className="text-gray-300">{formatBytes(ins.averageCardArt)}</strong>. </>}
          {ins.shared > 0 && <>{ins.shared} file{ins.shared === 1 ? ' is' : 's are'} used in more than one place. </>}
          {ins.unknownSize > 0 && <>{ins.unknownSize} external file{ins.unknownSize === 1 ? '' : 's'} can&apos;t be measured.</>}
        </p>
      </Panel>

      <Panel title="Savings available" hint={`Estimated: a GIF shrinks by roughly ${Math.round(GIF_SAVINGS * 100)}% when converted to an animated WebP.`}>
        {ins.gifs.files === 0 ? (
          <p className="flex items-center gap-2 text-sm text-green-300"><Icon name="checkCircle" />No GIFs left. Nothing to convert.</p>
        ) : (
          <div className="space-y-3">
            <p className="font-display text-3xl font-bold text-yellow-300 tabular-nums">~{formatBytes(ins.gifs.estimatedSaved)}</p>
            <p className="text-sm text-gray-400">{ins.gifs.files} GIF{ins.gifs.files === 1 ? '' : 's'} totalling {formatBytes(ins.gifs.bytes)} can be converted.</p>
            <button onClick={onFixGifs} className="btn btn-primary px-4 py-2 text-sm rounded-xl"><Icon name="wrench" className="mr-1.5" />Optimize all GIFs</button>
          </div>
        )}
      </Panel>

      <Panel title="Weight per pack" hint="Total size of the files each pack's cards and cover use.">
        {ins.perPack.length === 0 ? <p className="text-sm text-gray-600">No files yet.</p> : (
          <ul className="space-y-3">
            {ins.perPack.map(p => (
              <li key={p.packId} className="space-y-1">
                <div className="flex items-baseline gap-2 text-sm">
                  <Link href={`/admin/packs/${p.packId}`} className="text-gray-200 hover:text-yellow-300 truncate">{p.packName}</Link>
                  <span className="text-xs text-gray-600">{p.files} files</span>
                  {p.flagged > 0 && <span className="text-[10px] font-bold text-amber-300">{p.flagged} flagged</span>}
                  <span className="ml-auto tabular-nums text-gray-300">{formatBytes(p.bytes)}</span>
                </div>
                <SizeBar value={p.bytes} max={maxPack} tone="sky" />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Heaviest files" hint="The biggest single downloads. Click one for its details.">
        {ins.heaviest.length === 0 ? <p className="text-sm text-gray-600">No sizes known yet.</p> : (
          <ol className="divide-y divide-gray-800/60 -mx-2">
            {ins.heaviest.map((a, i) => (
              <li key={a.id}>
                <button onClick={() => onOpen(a)} className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/4 text-left transition-colors">
                  <span className="w-5 text-xs text-gray-600 tabular-nums">{i + 1}</span>
                  <span className="w-8 h-11 rounded-sm bg-gray-800 overflow-hidden shrink-0 flex items-center justify-center">
                    {a.kind === 'card-art' ? <CardTile imageUrl={a.url} alt="" className="relative w-full h-full" /> : a.kind === 'pack-cover' ? <img src={a.url} alt="" className="w-full h-full object-cover" /> : <Icon name="music" className="text-gray-500" />}
                  </span>
                  <span className="min-w-0 flex-1"><span className="block text-sm text-gray-100 truncate">{assetTitle(a.origin)}</span><span className="block text-xs text-gray-500">{KIND_LABEL[a.kind]} · {a.format}</span></span>
                  <span className="text-sm tabular-nums text-gray-200">{formatBytes(a.bytes)}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  );
}
