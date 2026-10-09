import { getActiveSeasonWithPacks } from '@/lib/kv';
import { CopyableUrl } from '../components/copyable-url';
import { getBuildInfo } from '@/lib/version';

export const dynamic = 'force-dynamic';

const BASE = 'https://tcg-khaki.vercel.app';

export default async function SettingsPage() {
  const result = await getActiveSeasonWithPacks();
  const build = getBuildInfo();

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* OBS overlay */}
      <section className="tcg-panel rounded-xl p-5 space-y-3">
        <h2 className="font-semibold text-sm text-gray-300 uppercase tracking-wide">OBS Overlay</h2>
        <p className="text-sm text-gray-400">
          Add as a <strong className="text-white">Browser Source</strong> in OBS.
          Width <code className="text-yellow-400">800</code> · Height <code className="text-yellow-400">600</code>.
        </p>
        <CopyableUrl url={`${BASE}/overlay.html`} />
        <p className="text-xs text-gray-600">
          Append <code className="text-gray-500">?dev</code> to show the on-screen test panel.
        </p>
        <div className="rounded-lg bg-gray-950/60 border border-gray-800 p-3 space-y-1">
          <p className="text-sm text-gray-300 font-semibold">Connection &amp; live status</p>
          <p className="text-xs text-gray-500 leading-relaxed">
            The overlay checks in every 10 seconds, so the admin sidebar and dashboard show whether it&apos;s open.
            To also show when you&apos;re <strong className="text-gray-300">live</strong>, open the browser source&apos;s properties in OBS and set{' '}
            <strong className="text-gray-300">Page permissions</strong> to{' '}
            <em className="text-gray-300">“Read access to OBS status information”</em>. Without it the overlay still reports as
            connected, but its stream status stays unknown.
          </p>
        </div>
      </section>

      {/* Collection page */}
      <section className="tcg-panel rounded-xl p-5 space-y-3">
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
      <section className="tcg-panel rounded-xl p-5 space-y-3">
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
      <section className="tcg-panel rounded-xl p-5 space-y-3">
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

      {/* Build */}
      <section className="tcg-panel rounded-xl p-5 space-y-3">
        <h2 className="font-semibold text-sm text-gray-300 uppercase tracking-wide">Build</h2>
        <dl className="grid grid-cols-[7rem_1fr] gap-y-1.5 text-sm">
          <dt className="text-gray-500">Version</dt>
          <dd className="text-white font-mono">v{build.version}</dd>
          <dt className="text-gray-500">Commit</dt>
          <dd className="font-mono">
            {build.commitUrl ? (
              <a href={build.commitUrl} target="_blank" rel="noreferrer" className="text-purple-400 hover:text-purple-300 transition-colors">{build.commit}</a>
            ) : (
              <span className="text-gray-300">{build.commit}</span>
            )}
          </dd>
          {build.branch && (<><dt className="text-gray-500">Branch</dt><dd className="text-gray-300 font-mono">{build.branch}</dd></>)}
          <dt className="text-gray-500">Environment</dt>
          <dd className="text-gray-300">{build.env}</dd>
          {build.builtAt && (<><dt className="text-gray-500">Built</dt><dd className="text-gray-300">{new Date(build.builtAt).toLocaleString()}</dd></>)}
        </dl>
        <p className="text-xs text-gray-600">
          The same version shows on the Twitch panel, so you can confirm viewers are on the latest deploy. Bump the number in{' '}
          <code className="text-gray-500">package.json</code>; the commit updates automatically on every build.
        </p>
      </section>

      {/* Active season */}
      <section className="tcg-panel rounded-xl p-5 space-y-3">
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
                      <img src={pack.coverImageUrl} alt={pack.name} loading="lazy" className="w-6 h-8 object-cover rounded shrink-0" />
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
