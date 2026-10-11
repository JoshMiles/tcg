import { listSeasons } from '@/lib/kv';
import { getTradeSettings, listOpenTrades, sweepTrades, tradeHistory } from '@/lib/trades';
import { TRADE_LIMITS } from '@/lib/trade-core';
import { getTradeCards } from '@/lib/trade-view';
import type { TradeCardInfo } from '@/lib/trade-view-core';
import { TradeCard } from '@/app/components/trade/TradeCard';
import { PendingButton } from '../components/PendingButton';
import { ConfirmButton } from '../components/ConfirmButton';
import { adminCancelTradeAction, saveTradeSettingsAction } from '../trade-actions';

export const dynamic = 'force-dynamic';

const field = 'w-28 rounded-lg bg-gray-950 border border-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500';

export default async function AdminTradesPage({ searchParams }: { searchParams: Promise<{ saved?: string; cancelled?: string }> }) {
  const sp = await searchParams;
  await sweepTrades();
  const [settings, open, history, seasons] = await Promise.all([getTradeSettings(), listOpenTrades(), tradeHistory(), listSeasons()]);

  // Card names/art/points for every season that has an offer in the lists below.
  const cardsBySeason: Record<string, Record<number, TradeCardInfo>> = {};
  for (const s of seasons) {
    if ([...open, ...history.slice(0, 40)].some(t => t.seasonId === s.id)) cardsBySeason[s.id] = await getTradeCards(s);
  }
  const seasonName = (id: string) => seasons.find(s => s.id === id)?.name ?? id;
  const escrowed = open.filter(t => t.escrowed).reduce((n, t) => n + t.give.reduce((m, i) => m + i.count, 0), 0);

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold text-white">Trades</h1>
        <p className="text-sm text-gray-500 mt-0.5">Viewer-to-viewer card trading on the website. Offered cards are held in escrow until the offer ends.</p>
      </div>
      {sp.saved && <p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 px-4 py-2 text-sm text-emerald-300">Trade settings saved.</p>}
      {sp.cancelled && <p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 px-4 py-2 text-sm text-emerald-300">Offer cancelled and the cards returned.</p>}

      <section className="rounded-xl border border-gray-800 bg-gray-900 p-5 space-y-4">
        <h2 className="font-semibold text-white">Settings</h2>
        <form action={saveTradeSettingsAction} className="space-y-4">
          <label className="flex items-start gap-3 text-sm text-gray-300">
            <input type="checkbox" name="enabled" defaultChecked={settings.enabled} className="mt-1 h-4 w-4 accent-yellow-500" />
            <span><strong className="text-white">Trading is on.</strong> Turn it off to freeze trading: nothing new can be offered or accepted, but viewers can still cancel their own offers to get their cards back.</span>
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
          </div>
          <PendingButton pendingLabel="Saving…" className="px-5 py-2 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-gray-950 font-bold text-sm">Save settings</PendingButton>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold text-white">Open offers <span className="text-sm font-normal text-gray-500">({open.length} · {escrowed} cards in escrow)</span></h2>
        {open.length === 0 ? <p className="text-sm text-gray-500">No open offers.</p> : open.map(t => (
          <TradeCard
            key={t.id}
            trade={t}
            cards={cardsBySeason[t.seasonId] ?? {}}
            title={<>{t.from}{t.to ? <> → {t.to}</> : ' → board'} <span className="text-gray-600 font-normal">· {seasonName(t.seasonId)}</span></>}
            actions={
              <form action={adminCancelTradeAction.bind(null, t.id)}>
                <ConfirmButton title="Cancel this offer?" message={`The escrowed cards go back to ${t.from}.`} confirmLabel="Cancel offer" className="px-3 py-1.5 rounded-lg border border-red-500/40 text-red-300 text-xs font-semibold hover:bg-red-500/10">Cancel &amp; refund</ConfirmButton>
              </form>
            }
          />
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold text-white">Trade log <span className="text-sm font-normal text-gray-500">(latest {Math.min(history.length, 40)} of {history.length})</span></h2>
        {history.length === 0 ? <p className="text-sm text-gray-500">Nothing has ended yet.</p> : history.slice(0, 40).map(t => (
          <TradeCard
            key={t.id}
            trade={t}
            cards={cardsBySeason[t.seasonId] ?? {}}
            compact
            title={<>{t.from}{t.to ? <> → {t.to}</> : ' → board'}{t.status === 'accepted' && t.resolvedBy && t.kind === 'listing' ? <> · taken by {t.resolvedBy}</> : null} <span className="text-gray-600 font-normal">· {seasonName(t.seasonId)}{t.resolvedAt ? ` · ${new Date(t.resolvedAt).toLocaleString()}` : ''}</span></>}
          />
        ))}
      </section>
    </div>
  );
}
