'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { VARIANT_LABELS } from '@/lib/variants';
import type { Variant } from '@/lib/types';
import { UpgradeCeremony, type CeremonyCard } from './UpgradeCeremony';
import type { HoloSpecs } from '@/lib/holo-core';

/**
 * Spends `cost` copies of `from` for one of the next variant, via the logged-in session. The server decides
 * everything (ownership, cost, whether upgrades are on); this only reports the outcome and refreshes the page.
 */
export function UpgradeButton({
  cardNumber, from, to, have, cost, className = '', card, gain, holo,
}: {
  cardNumber: number; from: Variant; to: Variant; have: number; cost: number; className?: string;
  /** The card's art and name. With it, a successful upgrade plays the upgrade animation. */
  card?: CeremonyCard;
  /** Projected score change, shown in the animation. */
  gain?: number;
  /** The card's shimmer per variant (the Overlay Editor's holo settings). */
  holo?: HoloSpecs;
}) {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');
  const can = have >= cost;
  const [ceremony, setCeremony] = useState<{ to: Variant; cost: number } | null>(null);

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
      // The server says where the upgrade really went (a switched-off variant is skipped) and what it cost.
      if (card) setCeremony({ to: (body.to as Variant) ?? to, cost: typeof body.cost === 'number' ? body.cost : cost });
      else router.refresh();
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
      {ceremony && card && (
        <UpgradeCeremony
          card={card}
          from={from}
          to={ceremony.to}
          cost={ceremony.cost}
          gain={gain}
          holo={holo}
          // The page refreshes when the animation closes: the row being upgraded may disappear, which would cut it short.
          onClose={() => { setCeremony(null); router.refresh(); }}
        />
      )}
      {state === 'error' && <span className="text-[11px] text-red-400 max-w-[14rem] text-right">{error}</span>}
    </span>
  );
}
