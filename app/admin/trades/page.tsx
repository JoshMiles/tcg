import { Icon } from '@/app/components/Icon';
import { TRADE_LIMITS } from '@/lib/trade-core';
import { FLAG_RULES } from '@/lib/trade-insights';
import { loadTradeAdminData } from '@/lib/trade-admin-data';
import { PendingButton } from '../components/PendingButton';
import { saveTradeSettingsAction } from '../trade-actions';
import { PageTabs, pickTab } from '../components/PageTabs';
import { TradeControls } from './TradeControls';
import { TradeLog } from './TradeLog';
import { Panel, Tile, PageHeader } from '../components/ui';

export const metadata = { title: 'Trades · Admin', robots: { index: false } };
export const dynamic = 'force-dynamic';

const field = 'w-28 rounded-lg bg-gray-950 border border-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500';

export default async function AdminTradesPage({ searchParams }: { searchParams: Promise<{ saved?: string; flagged?: string; tab?: string }> }) {
  const sp = await searchParams;
  const { settings, open, history, seasons, rows, stats, cardsBySeason, flaggedOpen, flaggedRecent, now } = await loadTradeAdminData();

  const maxDay = Math.max(1, ...stats.perDay.map(d => d.offered));
  const cardLabel = (key: string) => { const [sid, n] = key.split(':'); return cardsBySeason[sid]?.[Number(n)]?.name ?? `Card #${n}`; };
  const publishedSeasons = seasons.filter(s => s.status !== 'draft');
  const tabs = [
    { id: 'overview', label: 'Overview', icon: 'chart' },
    { id: 'log', label: 'Offers & log', icon: 'list', count: stats.openCount > 0 ? stats.openCount : undefined },
    { id: 'settings', label: 'Controls & settings', icon: 'settings' },
  ] as const;
  // Opening the log from the flagged banner (?flagged=1) lands on the log tab.
  const tab = pickTab(tabs, sp.tab ?? (sp.flagged === '1' ? 'log' : undefined));

  return (
    <div className="space-y-6">
      <PageHeader title="Trades" subtitle="Viewer-to-viewer card trading on the website. Offered cards are held in escrow until the offer ends." />
      {sp.saved && <p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 px-4 py-2 text-sm text-emerald-300">Trade settings saved.</p>}
      {!settings.enabled && <p role="status" className="rounded-xl border border-amber-500/30 bg-amber-950/20 px-4 py-2 text-sm text-amber-200"><Icon name="pause" className="mr-1" />Trading is paused for everyone. Viewers can still cancel their own offers.</p>}
      {(flaggedOpen > 0 || flaggedRecent > 0) && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-950/20 px-4 py-2 text-sm text-amber-200"><Icon name="warning" className="mr-1" />{flaggedOpen} open and {flaggedRecent} recent trade{flaggedOpen + flaggedRecent === 1 ? '' : 's'} flagged for a look (lopsided, repeated between the same pair, rapid-fire, or new accounts). Use <strong>Flagged only</strong> in the log below.</p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Tile label="Open offers" value={stats.openCount} sub={`${stats.escrowCards} cards in escrow`} />
        <Tile label="Completed" value={stats.accepted} sub={`of ${stats.ended} recent`} />
        <Tile label="Accept rate" value={stats.acceptRate === null ? '-' : `${Math.round(stats.acceptRate * 100)}%`} sub="of offers that ended" />
        <Tile label="Median time to accept" value={stats.medianAcceptMin === null ? '-' : stats.medianAcceptMin < 90 ? `${stats.medianAcceptMin}m` : `${(stats.medianAcceptMin / 60).toFixed(1)}h`} />
        <Tile label="Declined / cancelled" value={`${stats.declined} / ${stats.cancelled}`} sub={`${stats.expired} expired`} />
        <Tile label="Flagged" value={rows.filter(r => r.flags.length > 0).length} sub="in the kept history" />
      </div>

      <PageTabs tabs={tabs} active={tab} base="/admin/trades" label="Trade sections" />

      {tab === 'overview' && (
      <div className="grid xl:grid-cols-3 gap-6">
        <Panel title="Offers per day" hint="Last 14 days. The bar is offers made; the green part is trades completed that day.">
          <div className="flex items-end gap-1.5 h-32" role="img" aria-label="Offers and completed trades per day">
            {stats.perDay.map(d => (
              <div key={d.day} className="flex-1 flex flex-col justify-end h-full group relative" title={`${d.day}: ${d.offered} offered, ${d.accepted} completed`}>
                <div className="w-full rounded-t bg-sky-500/50" style={{ height: `${(d.offered / maxDay) * 100}%`, minHeight: d.offered ? 3 : 0 }} />
                <div className="w-full bg-emerald-400/80" style={{ height: `${(Math.min(d.accepted, d.offered || d.accepted) / maxDay) * 100}%` }} />
              </div>
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-gray-600"><span>{stats.perDay[0]?.day.slice(5)}</span><span>{stats.perDay.at(-1)?.day.slice(5)}</span></div>
          {stats.since && <p className="text-[11px] text-gray-600">Based on the last {stats.ended} ended trades (kept history), since {new Date(stats.since).toLocaleDateString()}.</p>}
        </Panel>
        <Panel title="Most active traders" hint="Completed trades in the kept history.">
          {stats.topTraders.length === 0 ? <p className="text-sm text-gray-600">No completed trades yet.</p> : (
            <ol className="space-y-1.5">{stats.topTraders.map((t, i) => (
              <li key={t.username} className="flex items-center gap-3 text-sm"><span className="w-4 text-xs text-gray-600 tabular-nums">{i + 1}</span><a href={`/admin/users/${encodeURIComponent(t.username)}`} className="text-gray-200 hover:text-yellow-300 truncate">{t.username}</a><span className="ml-auto text-xs text-gray-500 tabular-nums">{t.trades} trades · {t.cards} cards</span></li>
            ))}</ol>
          )}
        </Panel>
        <Panel title="Most traded cards" hint="Copies moved in completed trades.">
          {stats.topCards.length === 0 ? <p className="text-sm text-gray-600">No completed trades yet.</p> : (
            <ol className="space-y-1.5">{stats.topCards.map((c, i) => (
              <li key={c.key} className="flex items-center gap-3 text-sm"><span className="w-4 text-xs text-gray-600 tabular-nums">{i + 1}</span><span className="text-gray-200 truncate">{cardLabel(c.key)}</span><span className="ml-auto text-xs text-gray-500 tabular-nums">{c.copies} copies</span></li>
            ))}</ol>
          )}
        </Panel>
      </div>
      )}

      {tab === 'log' && (
      <Panel title="Offers & log" hint="Open offers first, then the latest ended ones. Click a row for the full detail, to cancel, extend or block a viewer.">
        <TradeLog rows={rows} seasons={publishedSeasons.map(s => ({ id: s.id, name: s.name }))} initialFlaggedOnly={sp.flagged === '1'} />
      </Panel>
      )}

      {tab === 'settings' && (
      <div className="grid xl:grid-cols-2 gap-6">
        <Panel title="Controls">
          <TradeControls seasons={publishedSeasons.map(s => ({ id: s.id, name: s.name, frozen: !!s.tradingFrozen, open: open.filter(t => t.seasonId === s.id).length }))} openTotal={open.length} />
        </Panel>

        <Panel title="Settings">
          <form action={saveTradeSettingsAction} className="space-y-4">
            <label className="flex items-start gap-3 text-sm text-gray-300">
              <input type="checkbox" name="enabled" defaultChecked={settings.enabled} className="mt-1 h-4 w-4 accent-yellow-500" />
              <span><strong className="text-white">Trading is on.</strong> Turn it off to freeze trading for everyone: nothing new can be offered or accepted, but viewers can still cancel their own offers to get their cards back.</span>
            </label>
            <div className="flex flex-wrap gap-4">
              <label className="text-xs text-gray-500 space-y-1 block">Offer lasts (hours)
                <input type="number" name="expiryHours" defaultValue={settings.expiryHours} min={TRADE_LIMITS.expiryHours.min} max={TRADE_LIMITS.expiryHours.max} className={field} />
              </label>
              <label className="text-xs text-gray-500 space-y-1 block">Open offers per viewer
                <input type="number" name="maxOpenPerUser" defaultValue={settings.maxOpenPerUser} min={TRADE_LIMITS.maxOpenPerUser.min} max={TRADE_LIMITS.maxOpenPerUser.max} className={field} />
              </label>
              <label className="text-xs text-gray-500 space-y-1 block">Cooldown between offers (s)
                <input type="number" name="cooldownSeconds" defaultValue={settings.cooldownSeconds} min={TRADE_LIMITS.cooldownSeconds.min} max={TRADE_LIMITS.cooldownSeconds.max} className={field} />
              </label>
              <label className="text-xs text-gray-500 space-y-1 block">Card stacks per side
                <input type="number" name="maxStacksPerSide" defaultValue={settings.maxStacksPerSide} min={TRADE_LIMITS.maxStacksPerSide.min} max={TRADE_LIMITS.maxStacksPerSide.max} className={field} />
              </label>
              <label className="text-xs text-gray-500 space-y-1 block">Minimum account age (hours)
                <input type="number" name="minAccountHours" defaultValue={settings.minAccountHours} min={TRADE_LIMITS.minAccountHours.min} max={TRADE_LIMITS.minAccountHours.max} className={field} />
              </label>
            </div>
            <p className="text-xs text-gray-600">Minimum account age: a viewer can&apos;t offer or accept until their profile is that old (0 = no limit). Flags use fixed rules: one side worth {FLAG_RULES.lopsidedRatio}× the other (and {FLAG_RULES.lopsidedGap}+ points apart), {FLAG_RULES.repeatTrades}+ trades between the same pair in {FLAG_RULES.repeatDays} days, {FLAG_RULES.burstOffers}+ offers in {FLAG_RULES.burstMinutes} minutes, or an account under {FLAG_RULES.newAccountHours}h old.</p>
            <PendingButton pendingLabel="Saving…" className="px-5 py-2 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-gray-950 font-bold text-sm">Save settings</PendingButton>
          </form>
        </Panel>
      </div>
      )}
    </div>
  );
}
