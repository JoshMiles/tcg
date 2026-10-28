import Link from 'next/link';
import { ObsRefresh } from '../settings/ObsRefresh';
import { Panel, Tile } from '../components/ui';
import type { StreamNumbers } from '@/lib/mixitup-page';
import { FEED_FILTERS, type FeedFilter, type FeedItem } from '@/lib/stream-page';
import { timeAgo } from '@/lib/site-data';
import { HappyHourBox, type HappyHourView } from './HappyHourBox';
import { PackGoalBox, type PackGoalView } from './PackGoalBox';
import { PullsControls } from './OverviewActions';
import { BlockedList, QueueList, type BlockRow, type QueueView } from './LiveLists';
import { LocalTime } from './LocalTime';

const KIND_TEXT = { pulls: 'text-emerald-300', requests: 'text-sky-300', events: 'text-violet-300', problems: 'text-red-300' } as const;

/** One list of everything that just happened, with the filter kept in the address (`?feed=`). */
function Feed({ items, filter, now, total }: { items: FeedItem[]; filter: FeedFilter; now: number; total: number }) {
  return (
    <Panel title="Live feed" icon="activity" hint="Requests to Mix It Up, chat commands and event rewards in one list, newest first. The full log is under History.">
      <nav aria-label="Feed filter" className="flex flex-wrap gap-2">
        {FEED_FILTERS.map(f => (
          <Link key={f.id} href={f.id === 'all' ? '/admin/stream?section=live' : `/admin/stream?section=live&feed=${f.id}`} scroll={false} aria-current={f.id === filter ? 'true' : undefined}
            className={`btn btn-sm ${f.id === filter ? 'btn-primary' : 'btn-outline'}`}>{f.label}</Link>
        ))}
      </nav>
      {items.length === 0 ? <p className="text-sm text-gray-500">{total === 0 ? 'Nothing yet.' : 'Nothing matches this filter.'}</p> : (
        <ul className="divide-y divide-gray-800/70 text-sm">
          {items.map((e, i) => (
            <li key={`${e.at}-${i}`} className="py-2.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
              <span className={`text-[11px] font-bold uppercase tracking-wider ${KIND_TEXT[e.kind]}`}>{e.tag}</span>
              <span className="font-semibold text-white">{e.who}</span>
              <span className="text-gray-400 min-w-0 wrap-break-word">{e.text}</span>
              <span className="sm:ml-auto"><LocalTime at={e.at} ago={timeAgo(e.at, now)} /></span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** Stream → Live: controls on the left (stacked above the feed on a phone), the stream's numbers and the one feed on the right. */
export function Live({ numbers, feed, filter, feedTotal, now, pulls, happyHour, packGoal, queue, blocks, obsPaired }: {
  numbers: StreamNumbers; feed: FeedItem[]; filter: FeedFilter; feedTotal: number; now: number;
  pulls: { streamExtra: number; paused: boolean; pauseReason: string; pauseChat: boolean; awardsOff: boolean };
  happyHour: HappyHourView | null; packGoal: { running: PackGoalView | null; buffs: { id: string; name: string }[] };
  queue: QueueView[]; blocks: BlockRow[]; obsPaired: boolean;
}) {
  const more = numbers.partial ? 'at least' : undefined;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-start">
      <div className="space-y-6 min-w-0">
        <Panel title="Pulls" icon="cards">
          <PullsControls {...pulls} />
        </Panel>
        <HappyHourBox running={happyHour} />
        <PackGoalBox running={packGoal.running} buffs={packGoal.buffs} />
        <Panel title="Queue" icon="list" hint="Pulls and show-offs waiting for the overlay, next first. Clearing refunds every waiting pull.">
          <QueueList queue={queue} />
        </Panel>
        <Panel title="Blocked from pulls" icon="ban">
          <BlockedList blocks={blocks} />
        </Panel>
        <Panel title="Overlay" icon="refresh" hint="TCG Bridge reloads the overlay browser source.">
          {obsPaired ? <ObsRefresh /> : <p className="text-sm text-gray-500">Pair TCG Bridge under Connections to control the overlay.</p>}
        </Panel>
      </div>
      <div className="space-y-6 min-w-0">
        <Panel title={numbers.label} icon="activity" hint={numbers.label === 'This stream' ? 'Counted from the request logs since the stream went live.' : 'No stream is live, so these count the last 24 hours.'}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Tile label="Paid pulls" value={numbers.paid} sub={more} icon="cards" />
            <Tile label="Currency taken" value={numbers.taken.toLocaleString('en-GB')} sub={more} icon="coins" />
            <Tile label="Added back" value={numbers.added.toLocaleString('en-GB')} sub="refunds and buff payouts" icon="gift" />
            <Tile label="Commands run" value={numbers.commands} sub={more} icon="chat" />
            <Tile label="Refused" value={numbers.refusals} sub={more} tone={numbers.refusals > 0 ? 'amber' : undefined} icon="ban" />
          </div>
          {numbers.topReason && <p className="text-sm text-gray-300">Most common refusal: <strong className="text-white">{numbers.topReason.label}</strong> ({numbers.topReason.count}).</p>}
          <p className="text-[11px] text-gray-500">
            The logs keep only their last 20 lines each{numbers.partial ? ', and one is full, so a busy stream can be higher than shown' : ''}. &ldquo;Added back&rdquo; counts every add call, so refunds of pulls that were not saved and Bonus Brie Bucks payouts are together.
          </p>
        </Panel>
        <Feed items={feed} filter={filter} now={now} total={feedTotal} />
      </div>
    </div>
  );
}
