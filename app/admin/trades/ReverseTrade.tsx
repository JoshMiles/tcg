'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/app/components/Icon';
import { ArmedButton } from '../components/ArmedButton';
import { reverseTradeAction } from '../trade-actions';

/** Staff only: put every print of this completed trade back where it started. Needs a reason; all or nothing. */
export function ReverseTrade({ tradeId }: { tradeId: string }) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const run = () => start(async () => {
    const r = await reverseTradeAction(tradeId, reason);
    setMsg({ ok: r.ok, text: r.message });
    if (r.ok) router.refresh();
  });
  return (
    <div className="space-y-2 rounded-xl border border-gray-800 bg-gray-900/50 p-3">
      <label className="block text-xs font-semibold text-white" htmlFor={`rev-${tradeId}`}>Reverse this trade</label>
      <input id={`rev-${tradeId}`} value={reason} onChange={e => setReason(e.target.value)} maxLength={300} placeholder="Reason (both people are told)"
        className="w-full rounded-lg bg-gray-950 border border-gray-700 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-yellow-500" />
      <ArmedButton disabled={pending || !reason.trim()} onConfirm={run}
        className="px-3 py-1.5 rounded-lg border border-red-500/40 text-red-300 text-xs font-semibold hover:bg-red-500/10 disabled:opacity-50"
        armedClassName="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-500 disabled:opacity-50" armedLabel="Sure? Reverse trade">
        <Icon name="undo" className="mr-1" />Reverse trade
      </ArmedButton>
      {msg && <p role="status" className={`text-xs ${msg.ok ? 'text-green-300' : 'text-red-300'}`}>{msg.text}</p>}
    </div>
  );
}
