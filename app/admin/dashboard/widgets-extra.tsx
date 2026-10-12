import Link from 'next/link';
import { Icon } from '@/app/components/Icon';
import { timeAgo } from '@/lib/site-data';
import type { DashboardData } from '@/lib/dashboard-data';
import { sum } from '@/lib/stats';
import { Delta, Sparkline, StackedBars } from './charts';
import { Empty, More, Panel } from './panel';
import { OverlayControls } from './OverlayControls';

const RANGE_WORD = { '24h': 'the last 24 hours', '7d': 'the last 7 days', season: 'this season' } as const;
const PREV_WORD = { '24h': 'the 24 hours before', '7d': 'the 7 days before', season: 'the previous period' } as const;

function bucketLabels(starts: number[], step: 'hour' | 'day'): string[] {
  return starts.map(s => {
    const d = new Date(s);
    return step === 'hour' ? `${String(d.getUTCHours()).padStart(2, '0')}:00` : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  });
}

const trackingNote = (d: DashboardData) =>
  d.series?.since
    ? `Counting since ${new Date(d.series.since).toLocaleDateString()}; earlier activity isn't included.`
    : 'Nothing has been counted yet. Charts fill in from the first pull.';

export function Attention({ d }: { d: DashboardData }) {
  const items = d.attention;
  return (
    <Panel title="Needs attention" icon="alert" flush action={items.length > 0 ? <span className="text-xs font-bold text-amber-300">{items.length}</span> : undefined}>
      {items.length === 0 ? (
        <div className="px-5 py-8 flex flex-col items-center gap-2 text-center">
          <Icon name="checkCircle" className="w-8 h-8 text-emerald-400" />
          <p className="text-sm font-semibold text-gray-200">All clear</p>
          <p className="text-xs text-gray-500">Nothing needs doing right now.</p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-800/60">
          {items.map(it => (
            <li key={it.id} className="px-5 py-3 flex items-start gap-3">
              <Icon name={it.level === 'warn' ? 'warning' : 'info'} className={`w-[1.1rem] h-[1.1rem] mt-0.5 ${it.level === 'warn' ? 'text-amber-400' : 'text-sky-300'}`} />
              <p className="flex-1 min-w-0 text-sm text-gray-300 leading-snug">{it.text}</p>
              {it.href && <Link href={it.href} className="shrink-0 text-xs font-semibold text-yellow-400 hover:text-yellow-300">{it.cta ?? 'Open'} →</Link>}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function PullsChart({ d }: { d: DashboardData }) {
  const s = d.series;
  const p = d.prevSeries;
  const total = s ? sum(s.data.pull) : 0;
  const prevTotal = p ? sum(p.data.pull) : 0;
  const reverse = s?.data['v:reverse'] ?? [];
  const full = s?.data['v:full'] ?? [];
  const shiny = s?.data['v:shiny'] ?? [];
  const regular = s ? s.data.pull.map((n, i) => Math.max(0, n - (reverse[i] ?? 0) - (full[i] ?? 0) - (shiny[i] ?? 0))) : [];
  const layers = [
    { label: 'Regular', color: '#64748b', values: regular },
    { label: 'Reverse Holo', color: '#8b5cf6', values: reverse },
    { label: 'Full Art', color: '#0ea5e9', values: full },
    { label: 'Shiny', color: '#f59e0b', values: shiny },
  ];
  return (
    <Panel title="Pulls over time" icon="chart" action={<span className="text-xs text-gray-500">{RANGE_WORD[d.range]}</span>}>
      {!s ? <p className="text-sm text-gray-600">No data.</p> : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
            <p className="font-display text-3xl font-bold text-white tabular-nums">{total.toLocaleString()} <span className="text-sm font-normal text-gray-500">pulls</span></p>
            <p className="text-xs text-gray-500">vs {PREV_WORD[d.range]}: <Delta now={total} prev={prevTotal} /></p>
            <p className="text-xs text-gray-500">{sum(s.data.newCard).toLocaleString()} new cards · {sum(s.data.upgrade).toLocaleString()} upgrades</p>
          </div>
          <StackedBars layers={layers} labels={bucketLabels(s.starts, s.step)} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-400">
              {layers.map(l => <li key={l.label} className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ background: l.color }} />{l.label}</li>)}
            </ul>
            <p className="text-[11px] text-gray-600">{trackingNote(d)}</p>
          </div>
        </div>
      )}
    </Panel>
  );
}

export function Economy({ d }: { d: DashboardData }) {
  const rows = d.board?.rows ?? [];
  const cards = d.board ? [...d.board.values.cards.values()] : [];
  if (rows.length === 0) return <Panel title="Economy health" icon="coins"><p className="text-sm text-gray-600">No scores yet.</p></Panel>;
  const scores = rows.map(r => r.score).sort((a, b) => b - a);
  const total = sum(scores);
  const median = scores[Math.floor(scores.length / 2)] ?? 0;
  const topN = Math.max(1, Math.ceil(scores.length * 0.1));
  const topShare = total > 0 ? Math.round((sum(scores.slice(0, topN)) / total) * 100) : 0;
  const byCopies = cards.slice().sort((a, b) => a.copies - b.copies);
  const name = (n: number) => d.allCards.find(c => c.number === n)?.name ?? `#${n}`;
  const stat = (label: string, value: string) => (
    <div className="rounded-lg bg-gray-950/50 border border-gray-800 px-3 py-2"><p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">{label}</p><p className="font-display text-xl font-bold text-white tabular-nums">{value}</p></div>
  );
  return (
    <Panel title="Economy health" icon="coins">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {stat('Points in play', total.toLocaleString())}
          {stat('Median score', median.toLocaleString())}
          {stat('Average score', Math.round(total / scores.length).toLocaleString())}
          {stat(`Top ${topN} hold`, `${topShare}%`)}
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-gray-500 font-bold uppercase tracking-wider text-[10px] mb-1">Scarcest</p>
            <ul className="space-y-0.5">{byCopies.slice(0, 3).map(c => <li key={c.number} className="flex justify-between gap-2 text-gray-300"><span className="truncate">{name(c.number)}</span><span className="tabular-nums text-gray-500">{c.copies}</span></li>)}</ul>
          </div>
          <div>
            <p className="text-gray-500 font-bold uppercase tracking-wider text-[10px] mb-1">Most common</p>
            <ul className="space-y-0.5">{byCopies.slice(-3).reverse().map(c => <li key={c.number} className="flex justify-between gap-2 text-gray-300"><span className="truncate">{name(c.number)}</span><span className="tabular-nums text-gray-500">{c.copies}</span></li>)}</ul>
          </div>
        </div>
        <p className="text-[11px] text-gray-600">If a few viewers hold most of the points, a scoring tweak (Settings → Scoring) may help new viewers catch up.</p>
      </div>
    </Panel>
  );
}

export function Viewers({ d }: { d: DashboardData }) {
  const daily = d.dailyViewers;
  const today = daily[daily.length - 1] ?? 0;
  const yesterday = daily[daily.length - 2] ?? 0;
  const newViewers = d.series ? sum(d.series.data.newViewer) : 0;
  const prevNew = d.prevSeries ? sum(d.prevSeries.data.newViewer) : 0;
  return (
    <Panel title="Viewers" icon="users" action={<span className="text-xs text-gray-500">{RANGE_WORD[d.range]}</span>}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-gray-950/50 border border-gray-800 px-3 py-2"><p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Active today</p><p className="font-display text-2xl font-bold text-white tabular-nums">{today}</p><Delta now={today} prev={yesterday} /></div>
          <div className="rounded-lg bg-gray-950/50 border border-gray-800 px-3 py-2"><p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">New viewers</p><p className="font-display text-2xl font-bold text-white tabular-nums">{newViewers}</p><Delta now={newViewers} prev={prevNew} /></div>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1">Active per day (7 days)</p>
          <Sparkline values={daily} stroke="#38bdf8" />
        </div>
        <p className="text-[11px] text-gray-600">{today > 0 ? `${Math.max(0, today - Math.min(today, newViewers))} returning today. ` : ''}{trackingNote(d)}</p>
      </div>
    </Panel>
  );
}

export function Progress({ d }: { d: DashboardData }) {
  const days = Math.max(1, Math.ceil((Date.now() - d.season.createdAt) / 86_400_000));
  const found = d.cardStats.filter(c => c.ownedBy > 0).length;
  const pool = d.allCards.length;
  const pct = pool > 0 ? Math.round((found / pool) * 100) : 0;
  const complete = d.users.filter(([, owned]) => new Set(owned.map(e => e % 1_000_000)).size >= pool && pool > 0).length;
  const row = (label: string, value: string) => <div className="flex items-baseline justify-between gap-3 text-sm"><span className="text-gray-400">{label}</span><span className="text-gray-100 tabular-nums font-semibold">{value}</span></div>;
  return (
    <Panel title="Season progress" icon="calendar">
      <div className="space-y-3">
        <div>
          <div className="flex items-baseline justify-between text-xs mb-1"><span className="text-gray-500">Card pool found by the community</span><span className="text-yellow-400 font-bold tabular-nums">{found}/{pool} · {pct}%</span></div>
          <div className="h-2 rounded-full bg-gray-800 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-yellow-500 to-amber-300" style={{ width: `${pct}%` }} /></div>
        </div>
        {row('Running for', `${days} day${days === 1 ? '' : 's'}`)}
        {row('Copies in collections', d.totalOwned.toLocaleString())}
        {row('Average per day', Math.round(d.totalOwned / days).toLocaleString())}
        {row('Complete collections', complete.toLocaleString())}
      </div>
    </Panel>
  );
}

export function Changes({ d, describe }: { d: DashboardData; describe: (e: DashboardData['adminActions'][number], d: DashboardData) => { icon: Parameters<typeof Icon>[0]['name']; text: string } }) {
  const events = d.adminActions.slice(0, 8);
  return (
    <Panel title="Admin actions" icon="shield" flush action={<More href="/admin/activity">All activity →</More>}>
      {events.length === 0 ? <Empty>No admin actions in the recent log.</Empty> : (
        <ul className="divide-y divide-gray-800/60">
          {events.map(e => {
            const { icon, text } = describe(e, d);
            return (
              <li key={e.seq} className="px-5 py-2 flex items-center gap-3 text-sm">
                <Icon name={icon} className="text-gray-500" />
                <span className="flex-1 min-w-0 truncate text-gray-300">{text}</span>
                <span className="text-xs text-gray-600 shrink-0">{timeAgo(e.at)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

export function OverlayControlsWidget({ d }: { d: DashboardData }) {
  return (
    <Panel title="Overlay controls" icon="monitor" action={<More href="/admin/settings?tab=overlay">Settings →</More>}>
      <OverlayControls queued={d.overlay?.queued ?? 0} connected={d.overlay?.connected ?? 0} packsOnly={d.overlaySettings.livePacksOnly} collectionsOnly={d.overlaySettings.liveCollectionsOnly} />
    </Panel>
  );
}

/** The activity pulse, now driven by the chosen range and the stored counters. */
export function PulseWidget({ d }: { d: DashboardData }) {
  const s = d.series;
  const p = d.prevSeries;
  const rows: [string, number, number][] = s && p
    ? [['Pulls', sum(s.data.pull), sum(p.data.pull)], ['Upgrades', sum(s.data.upgrade), sum(p.data.upgrade)], ['Trades', sum(s.data.trade), sum(p.data.trade)], ['Grants', sum(s.data.grant), sum(p.data.grant)]]
    : [];
  return (
    <Panel title="Activity pulse" icon="trend" action={<span className="text-xs text-gray-500">{RANGE_WORD[d.range]}</span>}>
      {!s ? <p className="text-sm text-gray-600">No data.</p> : (
        <div className="space-y-2.5">
          {rows.map(([label, now, prev]) => (
            <div key={label} className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-gray-400">{label}</span>
              <span className="flex items-baseline gap-2 text-sm"><strong className="text-white tabular-nums">{now.toLocaleString()}</strong><Delta now={now} prev={prev} /></span>
            </div>
          ))}
          <Sparkline values={s.data.pull} />
          <p className="text-[11px] text-gray-600">{trackingNote(d)}</p>
        </div>
      )}
    </Panel>
  );
}
