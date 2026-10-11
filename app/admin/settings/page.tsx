import { getActiveSeasonWithPacks } from '@/lib/kv';
import { CopyableUrl } from '../components/copyable-url';
import { getBuildInfo } from '@/lib/version';
import { getOverlaySettings } from '@/lib/overlay-settings';
import { saveOverlaySettingsAction, saveOverlayLayoutAction, saveScoringSettingsAction, resetScoringSettingsAction } from '../actions';
import { getScoringSettings, DEFAULT_SCORING, SCORING_LIMITS, type ScoringSettings } from '@/lib/scoring';
import { getSeasonLeaderboard, collectionBonuses } from '@/lib/leaderboard';
import { OverlayLayoutEditor } from './OverlayLayoutEditor';

export const dynamic = 'force-dynamic';

const BASE = 'https://tcg-khaki.vercel.app';

export default async function SettingsPage() {
  const result = await getActiveSeasonWithPacks();
  const build = getBuildInfo();
  const overlay = await getOverlaySettings();
  const scoring = await getScoringSettings();
  // A live read-out of what the current numbers mean for the active season.
  const board = result ? await getSeasonLeaderboard(result.season) : null;
  const bonusAtFull = board ? collectionBonuses(board.values, board.values.totalCards) : null;

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* OBS overlay */}
      <section className="tcg-panel rounded-xl p-5 space-y-3">
        <h2 className="font-semibold text-sm text-gray-300 uppercase tracking-wide">OBS Overlay</h2>
        <p className="text-sm text-gray-400">
          Add as a <strong className="text-white">Browser Source</strong> in OBS.
          Size it as recommended in <strong className="text-white">Overlay Layout</strong> below ({overlay.layout.width} × {overlay.layout.height}).
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
        <form action={saveOverlaySettingsAction} className="rounded-lg bg-gray-950/60 border border-gray-800 p-3 space-y-3">
          <p className="text-sm text-gray-300 font-semibold">Only when live</p>
          <label className="flex items-start gap-2.5 text-sm text-gray-300 cursor-pointer">
            <input type="checkbox" name="livePacksOnly" defaultChecked={overlay.livePacksOnly} className="mt-1 accent-yellow-500" />
            <span>Pack openings<span className="block text-xs text-gray-500">Ignore pack triggers from your bot / channel points while you&apos;re offline.</span></span>
          </label>
          <label className="flex items-start gap-2.5 text-sm text-gray-300 cursor-pointer">
            <input type="checkbox" name="liveCollectionsOnly" defaultChecked={overlay.liveCollectionsOnly} className="mt-1 accent-yellow-500" />
            <span>Collection displays<span className="block text-xs text-gray-500">Ignore &ldquo;show collection&rdquo; triggers while you&apos;re offline.</span></span>
          </label>
          <p className="text-xs text-gray-500 leading-relaxed">
            Ignored triggers are dropped, not saved for later. Offline means no overlay is open, or OBS says it isn&apos;t streaming.
            That needs the browser source&apos;s <em className="text-gray-300">“Read access to OBS status information”</em> permission above;
            without it the overlay can&apos;t tell, so triggers are allowed whenever it&apos;s open. Quick actions on the dashboard always work.
          </p>
          <button type="submit" className="px-3 py-1.5 rounded-lg bg-yellow-500 text-gray-950 text-sm font-semibold hover:bg-yellow-400 transition-colors">Save</button>
        </form>
      </section>

      {/* Overlay layout */}
      <section className="tcg-panel rounded-xl p-5 space-y-3">
        <h2 className="font-semibold text-sm text-gray-300 uppercase tracking-wide">Overlay Layout</h2>
        <OverlayLayoutEditor initial={overlay.layout} action={saveOverlayLayoutAction} />
      </section>

      {/* Scoring */}
      <section className="tcg-panel rounded-xl p-5 space-y-4">
        <div className="space-y-1">
          <h2 className="font-semibold text-sm text-gray-300 uppercase tracking-wide">Scoring</h2>
          <p className="text-sm text-gray-400 leading-relaxed">
            Tune how cards are valued and how the leaderboard is scored. Changes apply <strong className="text-white">immediately to every season</strong> — the
            leaderboard, card values, My Stats and the FAQ all recompute from these numbers. The defaults match the original scoring.
          </p>
        </div>

        {board && bonusAtFull && (
          <div className="rounded-lg bg-gray-950/60 border border-gray-800 p-3 text-xs text-gray-400 leading-relaxed">
            <span className="text-gray-300 font-semibold">Right now ({result!.season.name}):</span> one Regular of every card is worth{' '}
            <strong className="text-white">{board.values.setValue.toLocaleString()}</strong> points (the &ldquo;set value&rdquo;). A completed collection earns{' '}
            <strong className="text-white">{bonusAtFull.completion.toLocaleString()}</strong> completion +{' '}
            <strong className="text-white">{bonusAtFull.set.toLocaleString()}</strong> complete-collection bonus. The top collector has{' '}
            <strong className="text-white">{(board.rows[0]?.score ?? 0).toLocaleString()}</strong> points.
          </div>
        )}

        <form action={saveScoringSettingsAction} className="space-y-5">
          <ScoringGroup title="Card values">
            <ScoringField name="baseScore" label="Base score" settings={scoring} help="Points one Regular copy of an average card is worth. Scales every card value (and the bonuses, which are measured against card values)." />
            <ScoringField name="rarityExponent" label="Rarity strength" settings={scoring} help="How strongly rarity counts. 1 = a card half as likely is worth twice as much; below 1 flattens the gap between common and rare, above 1 widens it." />
          </ScoringGroup>

          <ScoringGroup title="Scarcity (how few copies of a version exist)">
            <ScoringField name="scarcityMax" label="Max bonus (×)" settings={scoring} help="The most a scarce version can be worth over average. 2 = up to double." />
            <ScoringField name="scarcityMin" label="Min multiplier (×)" settings={scoring} help="The least a very common version can fall to. 0.5 = down to half." />
            <ScoringField name="scarcitySmoothing" label="Smoothing" settings={scoring} help="Steadies values while few cards exist (early season). Higher = values move less; 1 is the original behaviour." />
          </ScoringGroup>

          <ScoringGroup title="Upgrades">
            <ScoringField name="upgradeMargin" label="Upgrade margin (×)" settings={scoring} help="An upgraded copy is worth at least this many times the copies spent to make it (before scarcity shifts). 1.2 = 20% more." />
          </ScoringGroup>

          <ScoringGroup title="Collection bonuses (% of the set value)">
            <ScoringField name="completionBonusPct" label="Completion bonus (%)" settings={scoring} help="Earned in proportion to how much of the set you own; this is the amount at 100%. 25 = a quarter of the set value." />
            <ScoringField name="completeSetBonusPct" label="Complete collection bonus (%)" settings={scoring} help="Extra, for owning at least one of every card. 50 = half the set value." />
          </ScoringGroup>

          <ScoringGroup title="Leaderboard">
            <ScoringField name="leaderboardSize" label="Collectors listed" settings={scoring} help="How many collectors the leaderboard page and the Twitch panel show." />
          </ScoringGroup>

          <div className="flex items-center gap-3 pt-1">
            <button type="submit" className="px-3 py-1.5 rounded-lg bg-yellow-500 text-gray-950 text-sm font-semibold hover:bg-yellow-400 transition-colors">Save scoring</button>
            <span className="text-xs text-gray-600">Values outside the allowed range are clamped when saved.</span>
          </div>
        </form>

        <form action={resetScoringSettingsAction}>
          <button type="submit" className="text-xs text-gray-500 hover:text-red-300 transition-colors underline underline-offset-2">Reset all scoring to the defaults</button>
        </form>
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

function ScoringGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-lg bg-gray-950/60 border border-gray-800 p-3 space-y-3">
      <legend className="px-1 text-xs font-semibold text-gray-300 uppercase tracking-wide">{title}</legend>
      {children}
    </fieldset>
  );
}

function ScoringField({ name, label, help, settings }: { name: keyof ScoringSettings; label: string; help: string; settings: ScoringSettings }) {
  const { min, max, step } = SCORING_LIMITS[name];
  const isDefault = settings[name] === DEFAULT_SCORING[name];
  return (
    <div className="grid sm:grid-cols-[11rem_1fr] gap-x-4 gap-y-1 items-start">
      <label htmlFor={`scoring-${name}`} className="text-sm text-gray-300 font-medium pt-1.5">
        {label}
        <span className="block text-[11px] font-normal text-gray-600">default {DEFAULT_SCORING[name]}{isDefault ? '' : ' · changed'}</span>
      </label>
      <div className="space-y-1">
        <input
          id={`scoring-${name}`}
          name={name}
          type="number"
          min={min}
          max={max}
          step={step}
          defaultValue={settings[name]}
          className="w-32 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-yellow-500"
        />
        <p className="text-xs text-gray-500 leading-relaxed">{help}</p>
      </div>
    </div>
  );
}
