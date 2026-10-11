'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { VARIANT_LABELS } from '@/lib/variants';
import type { Variant } from '@/lib/types';

/**
 * Spends `cost` copies of `from` for one of the next variant, via the logged-in session. The server decides
 * everything (ownership, cost, whether upgrades are on); this only reports the outcome and refreshes the page.
 */
export function UpgradeButton({
  cardNumber, from, to, have, cost, className = '',
}: {
  cardNumber: number; from: Variant; to: Variant; have: number; cost: number; className?: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');
  const can = have >= cost;

  async function go(e: React.MouseEvent) {
    e.stopPropagation();
    setState('working');
    setError('');
    try {
      const res = await fetch('/api/account/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardNumber, from }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Upgrade failed (${res.status})`);
      setState('done');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upgrade failed');
      setState('error');
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <button
        type="button"
        onClick={go}
        disabled={!can || state === 'working'}
        title={can
          ? `Spend ${cost} ${VARIANT_LABELS[from]} for 1 ${VARIANT_LABELS[to]}`
          : `Needs ${cost} ${VARIANT_LABELS[from]} (you have ${have})`}
        className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${
          can ? 'bg-yellow-400 text-gray-950 hover:bg-yellow-300' : 'border border-gray-700 text-gray-500 cursor-default'
        } disabled:opacity-70 ${className}`}
      >
        {state === 'working' ? '…' : state === 'done' ? '✓ Done' : can ? `Upgrade (${cost})` : `${have}/${cost}`}
      </button>
      {state === 'error' && <span className="text-[11px] text-red-400 max-w-[14rem] text-right">{error}</span>}
    </span>
  );
}
