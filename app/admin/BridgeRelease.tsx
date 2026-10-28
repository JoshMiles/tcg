import Link from 'next/link';
import { Icon } from '@/app/components/Icon';
import { listBridges, readBridge } from '@/lib/bridge';
import { CONNECTED_MS } from '@/lib/bridge-core';
import { bridgeVersionLine, latestBridgeRelease, type BridgeRelease } from '@/lib/bridge-release';
import { timeAgo } from '@/lib/site-data';

const CONNECTION = '/admin/mixitup?tab=connection';
const link = 'text-yellow-400 hover:underline';
const sha = (c: string) => c.slice(0, 7);

function ReleaseLines({ release, failed }: { release: BridgeRelease | null; failed: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Latest release</p>
      {release ? (
        <p className="text-sm text-gray-200">
          <a href={release.url} target="_blank" rel="noopener noreferrer" className={link}>{release.version}</a>
          {release.date && <span className="text-gray-500">, {release.date}</span>}
          {release.commit && <>, <a href={`https://github.com/JoshMiles/tcg/commit/${release.commit}`} target="_blank" rel="noopener noreferrer" className={`${link} font-mono`}>{sha(release.commit)}</a></>}
          {release.installerUrl && <>, <a href={release.installerUrl} className={link}>installer</a></>}
        </p>
      ) : (
        <p className="text-sm text-gray-500">Not known yet.</p>
      )}
      {failed && <p className="text-xs text-amber-300">Could not check GitHub just now{release ? ', showing the last answer' : ''}.</p>}
    </div>
  );
}

/** The dashboard card: the newest TCG Bridge release and the app that is paired. Streamed in, so a slow GitHub never holds the page. */
export async function BridgeReleaseCard() {
  const now = Date.now();
  const [{ release, failed }, bridge, bridges] = await Promise.all([latestBridgeRelease(now), readBridge(), listBridges()]);
  const connected = !!bridge.at && now - bridge.at <= CONNECTED_MS;
  const line = bridgeVersionLine(bridge.appVersion, release?.version ?? null);
  const outdated = line.startsWith('Out of date');
  return (
    <section className="card rounded-2xl px-6 py-4 space-y-3">
      <h2 className="font-semibold text-white flex items-center gap-2"><Icon name="link" className="text-yellow-400" />TCG Bridge</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <ReleaseLines release={release} failed={failed} />
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Running app</p>
          {bridges.length === 0 ? (
            <p className="text-sm text-gray-500">No TCG Bridge paired. <Link href={CONNECTION} className={link}>Pair one on the Connection tab</Link>.</p>
          ) : (
            <>
              <p className="text-sm text-gray-200">
                {bridge.appVersion || 'Version not reported yet'}
                {bridge.commit && <>, <span className="font-mono">{sha(bridge.commit)}</span></>}
                <span className={connected ? 'text-emerald-400' : 'text-gray-500'}>, {connected ? 'connected' : 'not connected'}</span>
              </p>
              <p className="text-xs text-gray-500">{bridge.at ? `Last seen ${timeAgo(bridge.at, now)}` : 'Never seen'}</p>
              {line && <p className={`text-xs ${outdated ? 'text-amber-300' : 'text-gray-500'}`}>{line}</p>}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

/** The one line for the Mix It Up Connection tab: running against latest. */
export async function BridgeVersionLine({ running }: { running: string }) {
  const { release } = await latestBridgeRelease();
  const line = bridgeVersionLine(running, release?.version ?? null);
  if (!line) return null;
  return <p className={`text-xs ${line.startsWith('Out of date') ? 'text-amber-300' : 'text-gray-500'}`}>{line}</p>;
}
