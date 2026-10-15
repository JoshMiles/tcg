'use client';
import { Icon } from '@/app/components/Icon';
import { Spinner } from '../../admin/components/PendingButton';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { postJson } from '../captcha-client';
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
  // Every action needs a second tap ("Sure?"), like the Twitch panel: accepting swaps cards for good, and one stray tap on a phone
  // must not do it. The armed state fades after a few seconds.
  const [armed, setArmed] = useState<Action | null>(null);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (armTimer.current) clearTimeout(armTimer.current); }, []);
  function press(action: Action) {
    if (armed === action) { if (armTimer.current) clearTimeout(armTimer.current); setArmed(null); void run(action); return; }
    setArmed(action);
    if (armTimer.current) clearTimeout(armTimer.current);
    armTimer.current = setTimeout(() => setArmed(null), 4000);
  }

  async function run(action: Action) {
    setBusy(action);
    setError('');
    try {
      const res = await postJson(`/api/trades/${tradeId}`, { action });
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
          <button type="button" disabled={!!busy || !canAccept} onClick={() => press('accept')} title={blocked} className={`${btn} bg-yellow-400 text-gray-950 hover:bg-yellow-300 ${armed === 'accept' ? 'ring-2 ring-yellow-200' : ''}`}>
            {busy === 'accept' ? <Spinner /> : armed === 'accept' ? 'Sure?' : mode === 'board' ? 'Take this trade' : 'Accept'}
          </button>
        )}
        {mode === 'incoming' && (
          <>
            <Link href={`/trade/new?counter=${tradeId}`} className={`${btn} border border-gray-600 text-gray-200 hover:border-yellow-500/60 hover:text-yellow-300`}>Counter</Link>
            <button type="button" disabled={!!busy} onClick={() => press('decline')} className={`${btn} ${armed === 'decline' ? 'border border-red-400/60 text-red-300' : 'text-gray-400 hover:text-white'}`}>{busy === 'decline' ? <Spinner /> : armed === 'decline' ? 'Sure?' : 'Decline'}</button>
          </>
        )}
        {mode === 'outgoing' && (
          <button type="button" disabled={!!busy} onClick={() => press('cancel')} className={`${btn} border ${armed === 'cancel' ? 'border-red-400/60 text-red-300' : 'border-gray-600 text-gray-200 hover:border-red-400/60 hover:text-red-300'}`}>{busy === 'cancel' ? <Spinner /> : armed === 'cancel' ? 'Sure?' : 'Cancel offer'}</button>
        )}
      </div>
      {armed && !busy && <span role="status" className="text-[11px] text-gray-400 max-w-[16rem] text-right">{armed === 'accept' ? (mode === 'board' ? 'Tap again to take this trade.' : 'Tap again to accept.') : armed === 'decline' ? 'Tap again to decline.' : 'Tap again to cancel and get your cards back.'}</span>}
      {blocked && mode !== 'outgoing' && !canAccept && <span className="text-[11px] text-amber-400 max-w-[16rem] text-right">{blocked}</span>}
      {error && <span role="alert" className="text-[11px] text-red-400 max-w-[16rem] text-right">{error}</span>}
    </div>
  );
}
