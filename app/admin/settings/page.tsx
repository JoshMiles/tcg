import { getActiveSeasonWithCards } from '@/lib/kv';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const result = await getActiveSeasonWithCards();

  const overlayPath = '/overlay.html';

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Overlay URL */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
        <h2 className="font-semibold text-sm text-gray-300 uppercase tracking-wide">Widget / Overlay</h2>
        <p className="text-sm text-gray-400">
          Add this URL as a <strong className="text-white">Browser Source</strong> in OBS. Set the width to{' '}
          <code className="text-yellow-400">800</code> and height to{' '}
          <code className="text-yellow-400">600</code>.
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 bg-gray-800 rounded-lg px-3 py-2 text-sm text-yellow-300 break-all">
            {'<your-vercel-url>'}{overlayPath}
          </code>
        </div>
        <p className="text-xs text-gray-600">
          Append <code>?dev</code> to the URL to show the test panel (e.g. when testing locally).
        </p>
      </section>

      {/* Bot integration */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
        <h2 className="font-semibold text-sm text-gray-300 uppercase tracking-wide">Bot / Channel Points Integration</h2>
        <p className="text-sm text-gray-400">
          Call these functions from your Twitch bot or channel points reward handler via the Browser Source's{' '}
          <strong className="text-white">Custom Javascript</strong> field:
        </p>
        <pre className="bg-gray-800 rounded-lg p-3 text-xs text-green-300 overflow-x-auto">{`// Draw a card for a viewer
queueDraw('username');

// Show a viewer's collection
queueCollection('username');`}</pre>
        <p className="text-sm text-gray-400">
          Or trigger them from a Nightbot / StreamElements custom command by injecting script into the browser source URL.
        </p>
      </section>

      {/* Active season info */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-2">
        <h2 className="font-semibold text-sm text-gray-300 uppercase tracking-wide">Active Season</h2>
        {result ? (
          <div className="text-sm space-y-1">
            <p className="text-white font-medium">{result.season.name}</p>
            <p className="text-gray-400">{result.cards.length} cards · Max concurrent: {result.season.maxConcurrentPacks ?? 1} pack{(result.season.maxConcurrentPacks ?? 1) !== 1 ? 's' : ''}</p>
            <p className="text-gray-400">Sound volume: {((result.season.soundVolume ?? 1) * 100).toFixed(0)}%</p>
          </div>
        ) : (
          <p className="text-sm text-gray-500">No active season.</p>
        )}
      </section>
    </div>
  );
}
