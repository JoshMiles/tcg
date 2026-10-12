import type { ReactNode } from 'react';
import type { Trade } from '@/lib/trade-core';
import { poolsFor, stackPoints, timeLeft, type TradeCardInfo, type TradePools } from '@/lib/trade-view-core';
import { TradeStacks } from './TradeStacks';

const STATUS: Record<string, { label: string; cls: string }> = {
  accepted: { label: 'Completed', cls: 'text-emerald-300 bg-emerald-500/10 border-emerald-400/30' },
  declined: { label: 'Declined', cls: 'text-gray-400 bg-gray-800/60 border-gray-700' },
  cancelled: { label: 'Cancelled', cls: 'text-gray-400 bg-gray-800/60 border-gray-700' },
  expired: { label: 'Expired', cls: 'text-amber-300 bg-amber-500/10 border-amber-400/30' },
  countered: { label: 'Countered', cls: 'text-blue-300 bg-blue-500/10 border-blue-400/30' },
  failed: { label: 'Failed', cls: 'text-red-300 bg-red-500/10 border-red-400/30' },
};

/** One offer: who made it, what they give and what they want back, the points on each side, and (for open offers) the actions. */
export function TradeCard({
  trade, cards, title, actions, compact = false, pools,
}: {
  trade: Trade;
  cards: Record<number, TradeCardInfo>;
  title: ReactNode;
  actions?: ReactNode;
  compact?: boolean;
  /** Serial numbers, so the points include the serial bonuses of the copies that would move. */
  pools?: TradePools;
}) {
  const p = poolsFor(trade, pools);
  const givePts = stackPoints(trade.give, cards, p.give);
  const getPts = stackPoints(trade.get, cards, p.get);
  const st = STATUS[trade.status];
  return (
    <article className="rounded-2xl border border-gray-800 bg-gray-900/70 p-4 space-y-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-200">{title}</h3>
        <span className="text-xs text-gray-500">
          {st ? <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-bold ${st.cls}`}>{st.label}</span> : <>expires {timeLeft(trade.expiresAt)}</>}
          {trade.kind === 'listing' && !st && <span className="ml-2 rounded-full border border-purple-400/30 bg-purple-500/10 px-2 py-0.5 text-[11px] font-bold text-purple-300">Board</span>}
        </span>
      </header>
      <div className={`grid gap-3 ${compact ? '' : 'md:grid-cols-[1fr_auto_1fr]'} items-start`}>
        <div className="space-y-1.5">
          <p className="text-[11px] uppercase tracking-wide text-gray-500">{trade.from} gives <span className="normal-case text-gray-600">≈ {givePts.toLocaleString()} pts</span></p>
          <TradeStacks items={trade.give} cards={cards} />
        </div>
        {!compact && <div className="hidden md:flex self-center text-xl text-gray-600" aria-hidden>⇄</div>}
        <div className="space-y-1.5">
          <p className="text-[11px] uppercase tracking-wide text-gray-500">wants in return <span className="normal-case text-gray-600">≈ {getPts.toLocaleString()} pts</span></p>
          <TradeStacks items={trade.get} cards={cards} />
        </div>
      </div>
      {trade.note && <p className="text-sm text-gray-300 italic">&ldquo;{trade.note}&rdquo;</p>}
      {trade.reason && st && <p className="text-xs text-gray-500">{trade.reason}</p>}
      {actions && <div className="flex justify-end pt-1">{actions}</div>}
    </article>
  );
}
