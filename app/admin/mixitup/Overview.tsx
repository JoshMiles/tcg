import Link from 'next/link';
import { Icon } from '@/app/components/Icon';
import type { MixItUpLogEntry } from '@/lib/mixitup';
import type { StatusCard, StreamNumbers } from '@/lib/mixitup-page';
import { Panel, Tile } from '../components/ui';
import { LogRows } from './MixItUpLog';
import { OverviewActions } from './OverviewActions';

export const CHIP_STYLE = {
  ok: { badge: 'badge-success', icon: 'checkCircle' },
  warn: { badge: 'badge-warning', icon: 'warning' },
  bad: { badge: 'badge-error', icon: 'alert' },
  muted: { badge: 'badge-ghost', icon: 'info' },
} as const;

const ROW_TEXT = { ok: 'text-green-300', warn: 'text-amber-300', bad: 'text-red-300', muted: 'text-gray-400' } as const;

function Card({ card }: { card: StatusCard }) {
  const style = CHIP_STYLE[card.tone];
  return (
    <section className="card rounded-2xl p-5 space-y-3" aria-label={card.title}>
      <div className="flex items-start justify-between gap-2">
        <h2 className="card-title text-base text-white">{card.title}</h2>
        <span className={`badge badge-sm gap-1 shrink-0 ${style.badge}`}><Icon name={style.icon} />{card.tone === 'ok' ? 'Good' : card.tone === 'muted' ? 'Waiting' : card.tone === 'warn' ? 'Check' : 'Problem'}</span>
      </div>
      <p className="text-sm font-semibold text-white">{card.state}</p>
      {card.rows.length > 0 && (
        <dl className="space-y-1 text-xs">
          {card.rows.map(r => (
            <div key={r.label} className="flex flex-wrap gap-x-2">
              <dt className="text-gray-500 shrink-0">{r.label}</dt>
              <dd className={`min-w-0 wrap-break-word ${ROW_TEXT[r.tone]}`}>{r.text}</dd>
            </div>
          ))}
        </dl>
      )}
      {card.todo && (
        <div className="rounded-lg border border-gray-800 bg-gray-950/50 px-3 py-2 text-xs text-gray-300 space-y-1.5">
          <p><span className="font-bold text-gray-200">What to do: </span>{card.todo}</p>
          {card.fix && <Link href={card.fix.href} className="link link-primary font-semibold">{card.fix.label}</Link>}
        </div>
      )}
    </section>
  );
}

/** Mix It Up → Overview: three status cards, this stream's numbers, quick actions and the last five log rows. */
export function Overview({ cards, numbers, recent, setup, streamExtra, obsPaired, login, now }: {
  cards: StatusCard[]; numbers: StreamNumbers; recent: MixItUpLogEntry[]; setup: boolean; streamExtra: number; obsPaired: boolean; login: string; now: number;
}) {
  const more = numbers.partial ? 'at least' : undefined;
  return (
    <div className="space-y-6">
      {setup && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-yellow-500/30 bg-yellow-500/5 px-5 py-4">
          <p className="text-sm text-gray-200">Something is not set up yet. The cards below say what to do.</p>
          <Link href="/admin/mixitup?tab=connection" className="btn btn-primary btn-sm"><Icon name="wrench" />Set up Mix It Up</Link>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">{cards.map(c => <Card key={c.id} card={c} />)}</div>

      <Panel title={numbers.label} icon="activity" hint={numbers.label === 'This stream' ? 'Counted from the request logs since the stream went live.' : 'No stream is live, so these count the last 24 hours.'}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
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

      <Panel title="Quick actions" icon="zap" hint="Each one shows its answer right here.">
        <OverviewActions obsPaired={obsPaired} streamExtra={streamExtra} login={login} />
      </Panel>

      <Panel title="Latest requests" icon="list" actions={<Link href="/admin/mixitup?tab=log" className="link link-primary text-sm font-semibold">See all</Link>}>
        <LogRows log={recent} now={now} />
      </Panel>
    </div>
  );
}
