import { headers } from 'next/headers';
import { loadAssetLibrary } from '@/lib/assets';
import { AssetBrowser } from './AssetBrowser';

export const dynamic = 'force-dynamic';

export default async function AssetsPage() {
  // Same-origin HEAD requests (to read the size of bundled files) need an absolute URL.
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');

  const library = await loadAssetLibrary(`${proto}://${host}`);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Assets</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Every image and sound the game uses, with its size and health. Replace a file from its card or pack page.
        </p>
      </div>
      <AssetBrowser library={library} />
    </div>
  );
}
