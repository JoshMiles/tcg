import { Icon } from '@/app/components/Icon';
import { requireStaff } from '@/lib/staff-guard';
import { loadTradeAdminData } from '@/lib/trade-admin-data';
import { TradeLog } from '../../admin/trades/TradeLog';
import { PageHeader, Panel, Tile } from '../../admin/components/ui';

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata = { title: 'Trades · Mod', robots: { index: false } };

/** Open offers, the recent log and the flagged trades. A mod can cancel an offer (the cards go back to their owner) or block a viewer from trading. */
export default async function ModTradesPage({ searchParams }: { searchParams: Promise<{ flagged?: string }> }) {
  await requireStaff('mod');
  const sp = await searchParams;
  const { settings, open, seasons, rows, stats, flaggedOpen, flaggedRecent } = await loadTradeAdminData();
  const published = seasons.filter(s => s.status !== 'draft');

  return (
    <div className="space-y-6">
      <PageHeader title="Trades" subtitle="Viewer-to-viewer trading. Offered cards are held in escrow until the offer ends." />
      {!settings.enabled && <p role="status" className="rounded-xl border border-amber-500/30 bg-amber-950/20 px-4 py-2 text-sm text-amber-200"><Icon name="pause" className="mr-1" />Trading is paused for everyone.</p>}
      {(flaggedOpen > 0 || flaggedRecent > 0) && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-950/20 px-4 py-2 text-sm text-amber-200">
          <Icon name="warning" className="mr-1" />{flaggedOpen} open and {flaggedRecent} recent trade{flaggedOpen + flaggedRecent === 1 ? '' : 's'} flagged for a look (lopsided, repeated between the same pair, rapid-fire, or new accounts).{' '}
          <a href="/mod/trades?flagged=1" className="underline">Show flagged only</a>
        </p>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile label="Open offers" value={stats.openCount} sub={`${stats.escrowCards} cards in escrow`} />
        <Tile label="Completed" value={stats.accepted} sub={`of ${stats.ended} recent`} />
        <Tile label="Declined / cancelled" value={`${stats.declined} / ${stats.cancelled}`} sub={`${stats.expired} expired`} />
        <Tile label="Flagged" value={rows.filter(r => r.flags.length > 0).length} sub="in the kept history" />
      </div>
      <Panel title="Offers & log" hint="Open offers first, then the latest ended ones. Click a row for the detail, to cancel an offer or block a viewer from trading.">
        <TradeLog rows={rows} seasons={published.map(s => ({ id: s.id, name: s.name }))} initialFlaggedOnly={sp.flagged === '1'} mod />
      </Panel>
    </div>
  );
}
