import { getActiveSeasonWithPacks } from '@/lib/kv';
import { CopyableUrl } from '../components/copyable-url';

export const dynamic = 'force-dynamic';

const BASE = 'https://tcg-khaki.vercel.app';

export default async function SettingsPage() {
  const result = await getActiveSeasonWithPacks();

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* OBS overlay */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
        <h2 className="font-semibold text-sm text-gray-300 uppercase tracking-wide">OBS Overlay</h2>
        <p className="text-sm text-gray-400">
          Add as a <strong className="text-white">Browser Source</strong> in OBS.
          Width <code className="text-yellow-400">800</code> · Height <code className="text-yellow-400">600</code>.
        </p>
        <CopyableUrl url={`${BASE}/overlay.html`} />
        <p className="text-xs text-gray-600">
          Append <code className="text-gray-500">?dev</code> to show the on-screen test panel.
        </p>
      </section>

      {/* Collection page */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
        <h2 className="font-semibold text-sm text-gray-300 uppercase tracking-wide">Viewer Collection Page</h2>
        <p className="text-sm text-gray-400">
          Share this with viewers so they can look up their collection. Append their username to go directly to their cards.
        </p>
        <CopyableUrl url={`${BASE}/collection`} />
        <p className="text-xs text-gray-600">
          Direct link example: <code className="text-gray-500">{BASE}/collection/username</code>
        </p>
      </section>

      {/* Twitch panel */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
        <h2 className="font-semibold text-sm text-gray-300 uppercase tracking-wide">Twitch Extension Panel</h2>
        <p className="text-sm text-gray-400">
          Register this as the <strong className="text-white">Panel HTML</strong> URL in your extension on{' '}
          <a href="https://dev.twitch.tv/console/extensions" target="_blank" className="text-purple-400 hover:text-purple-300 transition-colors">
            dev.twitch.tv
          </a>. Also allowlist the base URL as a fetch domain.
        </p>
        <CopyableUrl url={`${BASE}/twitch-panel/panel.html`} />
        <p className="text-xs text-gray-600">
          Allowlisted fetch domain: <code className="text-gray-500">{BASE}</code>
        </p>
        <p className="text-xs text-gray-600">
          Set <code className="text-gray-500">TWITCH_EXTENSION_SECRET</code> in Vercel env vars (from the extension dashboard).
        </p>
      </section>

      {/* Bot integration */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
        <h2 className="font-semibold text-sm text-gray-300 uppercase tracking-wide">Bot / Channel Points</h2>
        <p className="text-sm text-gray-400">
          Call these functions via your Twitch bot or the Browser Source's{' '}
          <strong className="text-white">Custom Javascript</strong> field in OBS:
        </p>
        <pre className="bg-gray-800 rounded-lg p-3 text-xs text-green-300 overflow-x-auto leading-relaxed">{`// Draw a card for a viewer
queueDraw('username');

// Show a viewer's collection
queueCollection('username');`}</pre>
      </section>

      {/* Active season */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
        <h2 className="font-semibold text-sm text-gray-300 uppercase tracking-wide">Active Season</h2>
        {result ? (
          <div className="space-y-3">
            <div className="text-sm space-y-1">
              <p className="text-white font-medium">{result.season.name}</p>
              <p className="text-gray-400">
                Collection: <code className="text-gray-500">{result.season.collectionName}</code>
                {' · '}{result.packs.length} pack{result.packs.length !== 1 ? 's' : ''}
                {' · '}Max concurrent: {result.season.maxConcurrentPacks}
              </p>
            </div>
            {result.packs.length > 0 && (
              <div className="divide-y divide-gray-800">
                {result.packs.map(({ pack, cards }) => (
                  <div key={pack.id} className="flex items-center gap-2 text-sm py-2 first:pt-0 last:pb-0">
                    {pack.coverImageUrl && (
                      <img src={pack.coverImageUrl} alt={pack.name} className="w-6 h-8 object-cover rounded shrink-0" />
                    )}
                    <span className="text-gray-300 flex-1">{pack.name}</span>
                    <span className="text-gray-600">{cards.length} cards</span>
                    {!pack.active && <span className="text-xs text-gray-700">(inactive)</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No active season.</p>
        )}
      </section>
    </div>
  );
}
