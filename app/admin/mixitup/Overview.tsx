import Link from 'next/link';
import { Icon } from '@/app/components/Icon';
import type { MixItUpLogEntry } from '@/lib/mixitup';
import type { StatusCard, StreamNumbers } from '@/lib/mixitup-page';
import { Panel, Tile } from '../components/ui';
import { LogRows } from './MixItUpLog';
import type { RecentTestRow } from '@/lib/mixitup-test';
import { OverviewActions } from './OverviewActions';
import { TestPulls } from './TestPulls';
import { ranAgo, type ChecklistResult } from '@/lib/bridge-checklist-core';
import { UPTIME_LABEL, UPTIME_PARTS, segments, type UptimeStream } from '@/lib/bridge-uptime-core';

export const CHIP_STYLE = {
  ok: { badge: 'badge-success', icon: 'checkCircle' },
  warn: { badge: 'badge-warning', icon: 'warning' },
  bad: { badge: 'badge-error', icon: 'alert' },
  muted: { badge: 'badge-ghost', icon: 'info' },
} as const;

const ROW_TEXT = { ok: 'text-green-300', warn: 'text-amber-300', bad: 'text-red-300', muted: 'text-gray-400' } as const;

export function Card({ card }: { card: StatusCard }) {
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

const SEGMENT = { up: 'bg-green-500/70', down: 'bg-red-500/80', unknown: 'bg-gray-700/60' } as const;

/** One stream's three bars (ROADMAP 55.11): green up, red down, grey not reported, spread over the stream's length. */
function UptimeStrip({ s, now }: { s: UptimeStream; now: number }) {
  const mins = Math.max(1, Math.round(((s.to ?? now) - s.from) / 60_000));
  const when = new Date(s.from).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
  return (
    <div className="space-y-1">
      <p className="text-xs text-gray-400">{when} UTC, {mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`}{s.to === undefined ? ' (live)' : ''}</p>
      {UPTIME_PARTS.map(p => (
        <div key={p} className="flex items-center gap-2">
          <span className="w-20 shrink-0 text-[11px] text-gray-500">{UPTIME_LABEL[p]}</span>
          <div className="flex h-3 min-w-0 flex-1 overflow-hidden rounded bg-gray-800" role="img" aria-label={`${UPTIME_LABEL[p]} during the stream`}>
            {segments(s, p, now).map((g, i) => <div key={i} className={SEGMENT[g.state]} style={{ width: `${g.pct}%` }} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Mix It Up → Overview: three status cards, this stream's numbers, quick actions and the last five log rows. */
export function Overview({ cards, numbers, recent, setup, setupLabel, streamExtra, paused, pauseChat, obsPaired, login, now, testViewers, paidOn, sandbox, tests, uptime, checklist }: {
  cards: StatusCard[]; numbers: StreamNumbers; recent: MixItUpLogEntry[]; setup: boolean; setupLabel: string; streamExtra: number; paused: boolean; pauseChat: boolean; obsPaired: boolean; login: string; now: number;
  testViewers: string[]; paidOn: boolean; sandbox: boolean; tests: RecentTestRow[]; uptime: UptimeStream[]; checklist: ChecklistResult | null;
}) {
  const more = numbers.partial ? 'at least' : undefined;
  return (
    <div className="space-y-6">
      {setup && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-yellow-500/30 bg-yellow-500/5 px-5 py-4">
          <p className="text-sm text-gray-200">Something is not set up yet. The cards below say what to do.</p>
          <Link href="/admin/mixitup/setup" className="btn btn-primary btn-sm"><Icon name="wrench" />{setupLabel}</Link>
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

      <Panel title="Pre-stream checklist" icon="checkCircle" hint="Press Checklist in TCG Bridge (Status tab or tray menu) to run it. It only looks; it changes nothing.">
        {checklist ? (
          <div className="space-y-2">
            <p className={`text-sm font-semibold ${checklist.ready ? 'text-green-300' : 'text-red-300'}`}>
              {checklist.ready ? 'Ready to stream' : `${checklist.lines.filter(l => l.tone === 'bad').length} thing(s) to fix`}
              <span className="ml-2 text-xs font-normal text-gray-500">{ranAgo(checklist.at, now)}</span>
            </p>
            <ul className="space-y-1 text-sm" aria-label="Checklist results">
              {checklist.lines.map(l => (
                <li key={l.label} className="flex flex-wrap items-baseline gap-x-2">
                  <span className={`badge badge-sm gap-1 shrink-0 ${CHIP_STYLE[l.tone].badge}`}><Icon name={CHIP_STYLE[l.tone].icon} />{l.tone === 'ok' ? 'OK' : l.tone === 'bad' ? 'Fix' : 'Info'}</span>
                  <span className="font-semibold text-gray-200">{l.label}</span>
                  <span className={`min-w-0 wrap-break-word ${ROW_TEXT[l.tone]}`}>{l.text}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : <p className="text-sm text-gray-400">The checklist has not been run yet.</p>}
      </Panel>

      <Panel title="Quick actions" icon="zap" hint="Each one shows its answer right here.">
        <OverviewActions obsPaired={obsPaired} streamExtra={streamExtra} paused={paused} pauseChat={pauseChat} login={login} />
      </Panel>

      <Panel title="Test pulls" icon="flask" hint="Pretend a test viewer typed !pack in chat and watch every step: the balance check, the charge, the overlay, the save and the rules. The edition is kept apart from the real collection and counts nowhere.">
        <TestPulls viewers={testViewers} paidOn={paidOn} sandbox={sandbox} recent={tests} />
      </Panel>

      {uptime.length > 0 && (
        <Panel title="Uptime" icon="activity" hint="TCG Bridge, Mix It Up and OBS during each of the last streams. Grey is a time nobody reported.">
          <div className="space-y-4">{[...uptime].reverse().map(s => <UptimeStrip key={s.from} s={s} now={now} />)}</div>
        </Panel>
      )}

      <Panel title="Latest requests" icon="list" actions={<Link href="/admin/mixitup?tab=log" className="link link-primary text-sm font-semibold">See all</Link>}>
        <LogRows log={recent} now={now} />
      </Panel>
    </div>
  );
}
