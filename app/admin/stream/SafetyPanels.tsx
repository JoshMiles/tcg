import { PendingButton } from '@/app/components/PendingButton';
import type { LedgerCheck } from '@/lib/bridge-chat';
import type { ChatSettings } from '@/lib/bridge-chat-core';
import { Panel } from '../components/ui';
import { saveChatSafetyAction, saveWatchdogAction } from './mixitup-actions';

/** The overlay watchdog (ROADMAP 55.8), moved here from the Big pulls tab in 63.3: a small panel of its own on the Connection tab. 63.4 builds the rest of Connections. */
export function WatchdogPanel({ on }: { on: boolean }) {
  return (
    <Panel title="Overlay watchdog" icon="refresh" hint="While the stream is live, if the overlay has not pinged the site for 30 seconds but OBS shows the overlay source, the site asks TCG Bridge to refresh it. At most once every 5 minutes; each refresh is written to the Log. Off until you switch it on.">
      <form action={saveWatchdogAction} className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm font-semibold text-white">
          <input type="checkbox" name="overlayWatchdog" defaultChecked={on} className="toggle toggle-sm toggle-primary" />
          Refresh a quiet overlay
        </label>
        <PendingButton type="submit" className="btn btn-primary btn-sm">Save</PendingButton>
      </form>
    </Panel>
  );
}

/** The Brie Bucks backup and the check of the charges (ROADMAP 55.10), moved here from Chat and Brie Bucks in 63.3. Saved on its own, so it never touches the start and end lines. */
export function BrieBucksSafetyPanel({ chat }: { chat: ChatSettings }) {
  return (
    <Panel title="Brie Bucks safety" icon="shield" hint="Both go through TCG Bridge 0.8.0 or newer and are off until you switch them on. The result of the last check is under History.">
      <form action={saveChatSafetyAction} className="space-y-4">
        <div className="space-y-1">
          <label className="flex items-center gap-2 text-sm font-semibold text-white"><input type="checkbox" name="backup" defaultChecked={chat.backup} className="toggle toggle-sm toggle-primary" />Back up everyone&rsquo;s Brie Bucks at the start and end</label>
          <p className="text-xs text-gray-500">TCG Bridge saves a CSV in Documents\TCG Bridge\backups (the newest 30 are kept). The Settings tab of the app has Open backups.</p>
        </div>
        <div className="space-y-1">
          <label className="flex items-center gap-2 text-sm font-semibold text-white"><input type="checkbox" name="check" defaultChecked={chat.check} className="toggle toggle-sm toggle-primary" />Check the charges when the stream ends</label>
          <p className="text-xs text-gray-500">TCG Bridge keeps its own list of every charge and refund. At the end the site compares it with its own and lists the ones only one side has, or with a different amount. Balances are not compared.</p>
        </div>
        <PendingButton type="submit" className="btn btn-primary btn-sm">Save</PendingButton>
      </form>
    </Panel>
  );
}

/** The last Brie Bucks check, shown in History (moved from Chat and Brie Bucks in 63.3). */
export function LedgerCheckPanel({ check, when }: { check: LedgerCheck | null; when: (t: number) => string }) {
  return (
    <Panel title="Last Brie Bucks check" icon="check">
      {!check ? <p className="text-sm text-gray-500">No check has run yet.</p> : (
        <>
          <p className="text-sm text-gray-300">{when(check.at)}: the site sent {check.site}, TCG Bridge recorded {check.app}. {check.problems.length ? `${check.problems.length} differ.` : 'They match.'}</p>
          {check.problems.length > 0 && <ul className="list-disc pl-5 text-sm text-amber-300 space-y-0.5">{check.problems.map(p => <li key={p}>{p}</li>)}</ul>}
        </>
      )}
    </Panel>
  );
}
