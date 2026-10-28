import Link from 'next/link';
import { Icon } from '@/app/components/Icon';
import type { StatusCard } from '@/lib/mixitup-page';
import { Panel } from '../components/ui';
import { ranAgo, type ChecklistResult } from '@/lib/bridge-checklist-core';
import { UPTIME_LABEL, UPTIME_PARTS, segments, type UptimeStream } from '@/lib/bridge-uptime-core';

export const CHIP_STYLE = {
  ok: { badge: 'badge-success', icon: 'checkCircle' },
  warn: { badge: 'badge-warning', icon: 'warning' },
  bad: { badge: 'badge-error', icon: 'alert' },
  muted: { badge: 'badge-ghost', icon: 'info' },
} as const;

export const ROW_TEXT = { ok: 'text-green-300', warn: 'text-amber-300', bad: 'text-red-300', muted: 'text-gray-400' } as const;

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
export function UptimeStrip({ s, now }: { s: UptimeStream; now: number }) {
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


/** The last pre-stream checklist TCG Bridge ran (Test section). */
export function ChecklistPanel({ checklist, now }: { checklist: ChecklistResult | null; now: number }) {
  return (
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
  );
}
