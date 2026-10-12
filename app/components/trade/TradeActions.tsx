'use client';
import { Icon } from '@/app/components/Icon';
import { Spinner } from '../../admin/components/PendingButton';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TradeCeremony } from '../TradeCeremony';
import type { Swap } from '@/lib/trade-notice-core';

type Action = 'accept' | 'decline' | 'cancel';

/** Accept / decline / counter / cancel buttons for one offer. The server decides everything; this reports the outcome and refreshes. */
export function TradeActions({
  tradeId, mode, canAccept = true, blocked,
}: {
  tradeId: string;
  /** incoming: an offer made to you; outgoing: your own; board: someone's open listing. */
  mode: 'incoming' | 'outgoing' | 'board';
  canAccept?: boolean;
  /** Why accepting isn't possible right now (e.g. "You need 2× Dinogidds"). */
  blocked?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [swap, setSwap] = useState<Swap | null>(null);

  async function run(action: Action) {
    setBusy(action);
    setError('');
    try {
      const res = await fetch(`/api/trades/${tradeId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `That didn't work (${res.status})`);
      setDone(action === 'accept' ? 'Trade complete!' : action === 'decline' ? 'Declined' : 'Cancelled');
      // The trade animation plays first; the page refreshes when it closes (the accepted offer disappears from this list).
      if (action === 'accept' && body.swap) setSwap(body.swap as Swap);
      else router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn\'t work');
    } finally {
      setBusy(null);
    }
  }

  const btn = 'inline-flex items-center justify-center gap-2 px-3.5 py-1.5 rounded-full text-sm font-bold transition-colors disabled:opacity-50';
  if (done) {
    return (
      <>
        <span className="text-sm font-semibold text-emerald-300"><Icon name="check" className="mr-1" />{done}</span>
        {swap && <TradeCeremony swap={swap} onClose={() => { setSwap(null); router.refresh(); }} />}
      </>
    );
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {mode !== 'outgoing' && (
          <button type="button" disabled={!!busy || !canAccept} onClick={() => run('accept')} title={blocked} className={`${btn} bg-yellow-400 text-gray-950 hover:bg-yellow-300`}>
            {busy === 'accept' ? <Spinner /> : mode === 'board' ? 'Take this trade' : 'Accept'}
          </button>
        )}
        {mode === 'incoming' && (
          <>
            <Link href={`/trade/new?counter=${tradeId}`} className={`${btn} border border-gray-600 text-gray-200 hover:border-yellow-500/60 hover:text-yellow-300`}>Counter</Link>
            <button type="button" disabled={!!busy} onClick={() => run('decline')} className={`${btn} text-gray-400 hover:text-white`}>{busy === 'decline' ? <Spinner /> : 'Decline'}</button>
          </>
        )}
        {mode === 'outgoing' && (
          <button type="button" disabled={!!busy} onClick={() => run('cancel')} className={`${btn} border border-gray-600 text-gray-200 hover:border-red-400/60 hover:text-red-300`}>{busy === 'cancel' ? <Spinner /> : 'Cancel offer'}</button>
        )}
      </div>
      {blocked && mode !== 'outgoing' && !canAccept && <span className="text-[11px] text-amber-400 max-w-[16rem] text-right">{blocked}</span>}
      {error && <span role="alert" className="text-[11px] text-red-400 max-w-[16rem] text-right">{error}</span>}
    </div>
  );
}
