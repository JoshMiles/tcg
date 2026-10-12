import Link from 'next/link';
import { headers } from 'next/headers';
import { Icon } from '@/app/components/Icon';
import { loadAssetLibrary } from '@/lib/assets';
import { GIF_SAVINGS } from '@/lib/asset-insights';
import { PageTabs, pickTab, type PageTab } from '../components/PageTabs';
import { AssetBrowser, type AssetTab } from './AssetBrowser';
import { formatBytes } from './asset-ui';
import { Tile, PageHeader } from '../components/ui';

export const metadata = { title: 'Assets · Admin', robots: { index: false } };
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // the Fix action re-encodes a GIF per request (up to ~15s)

export default async function AssetsPage({ searchParams }: { searchParams: Promise<{ tab?: string; issues?: string }> }) {
  const sp = await searchParams;
  // Same-origin HEAD requests (to read the size of bundled files) need an absolute URL.
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  const library = await loadAssetLibrary(`${proto}://${host}`);
  const { assets, unused, blobConnected } = library;

  const count = (k: string) => assets.filter(a => a.kind === k).length;
  const flagged = (k: string) => assets.filter(a => a.kind === k && a.issues.length > 0).length;
  const tabs: PageTab[] = [
    { id: 'card-art', label: 'Card art', icon: 'image', count: count('card-art') },
    { id: 'pack-cover', label: 'Pack covers', icon: 'cards', count: count('pack-cover') },
    { id: 'sound', label: 'Sounds', icon: 'music', count: count('sound') },
    { id: 'unused', label: 'Unused', icon: 'trash', count: blobConnected ? unused.length : '—' },
    { id: 'insights', label: 'Insights', icon: 'chart' },
  ];
  const tab = pickTab(tabs, sp.tab) as AssetTab;

  const inUse = assets.reduce((s, a) => s + (a.bytes ?? 0), 0);
  const attention = assets.filter(a => a.issues.length > 0).length;
  const firstFlaggedKind = (['card-art', 'pack-cover', 'sound'] as const).find(k => flagged(k) > 0);
  const gifBytes = assets.filter(a => a.format === 'GIF' && !a.issues.includes('missing')).reduce((s, a) => s + (a.bytes ?? 0), 0);
  const unusedBytes = unused.reduce((s, u) => s + u.bytes, 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Assets" subtitle="Every image and sound the game uses, with its size and health. Click a file for details; drop a file on it to replace it." />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <Tile label="Files in use" icon="image" value={String(assets.length)} sub={`${formatBytes(inUse)} in total`} href="?tab=insights" />
        <Tile label="Need attention" icon="warning" value={String(attention)} sub={attention === 0 ? 'all healthy' : 'GIFs, missing files, thumbnails'} tone={attention > 0 ? 'amber' : 'green'} href={attention > 0 && firstFlaggedKind ? `?tab=${firstFlaggedKind}&issues=1` : undefined} />
        <Tile label="Unused" icon="trash" value={blobConnected ? String(unused.length) : '—'} sub={blobConnected ? (unused.length ? `${formatBytes(unusedBytes)} to reclaim` : 'nothing to clean up') : 'storage unavailable'} tone={unused.length > 0 ? 'amber' : undefined} href={blobConnected && unused.length > 0 ? '?tab=unused' : undefined} />
        <Tile label="Savings available" icon="zap" value={gifBytes > 0 ? `~${formatBytes(Math.round(gifBytes * GIF_SAVINGS))}` : '0 B'} sub={gifBytes > 0 ? 'by converting GIFs (estimate)' : 'no GIFs left'} href={gifBytes > 0 ? '?tab=insights' : undefined} />
      </div>

      <PageTabs tabs={tabs} active={tab} base="/admin/assets" label="Asset sections" />

      <AssetBrowser library={library} tab={tab} issuesOnly={sp.issues === '1'} />
    </div>
  );
}
