'use client';
import { Icon } from '@/app/components/Icon';
import { Spinner } from '../admin/components/PendingButton';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { VARIANT_LABELS } from '@/lib/variants';
import type { Variant } from '@/lib/types';
import { postJson } from './captcha-client';
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
  // An upgrade is permanent (the copies spent are destroyed), so the first tap only arms the button ("Sure?") and the second does it,
  // like the trade actions and the Twitch panel. The armed state relaxes after a few seconds.
  const [armed, setArmed] = useState(false);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (armTimer.current) clearTimeout(armTimer.current); }, []);
  const [ceremony, setCeremony] = useState<{ to: Variant; cost: number; serial?: number; mult?: number } | null>(null);

  async function go(e: React.MouseEvent) {
    e.stopPropagation();
    if (!armed) {
      setArmed(true);
      if (armTimer.current) clearTimeout(armTimer.current);
      armTimer.current = setTimeout(() => setArmed(false), 4000);
      return;
    }
    if (armTimer.current) clearTimeout(armTimer.current);
    setArmed(false);
    setState('working');
    setError('');
    try {
      const res = await postJson('/api/account/upgrade', { cardNumber, from });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Upgrade failed (${res.status})`);
      setState('done');
      // The server says where the upgrade really went (a switched-off variant is skipped) and what it cost.
      if (card) setCeremony({ to: (body.to as Variant) ?? to, cost: typeof body.cost === 'number' ? body.cost : cost, serial: typeof body.serial === 'number' ? body.serial : undefined, mult: typeof body.serialMult === 'number' ? body.serialMult : undefined });
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
        className={`inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-bold transition-colors ${
          can ? 'bg-yellow-400 text-gray-950 hover:bg-yellow-300' : 'border border-gray-700 text-gray-500 cursor-default'
        } disabled:opacity-70 ${className}`}
      >
        {state === 'working' ? <Spinner /> : state === 'done' ? <><Icon name="check" className="mr-1" />Done</> : can ? (armed ? 'Sure?' : `Upgrade (${cost})`) : `${have}/${cost}`}
      </button>
      {ceremony && card && (
        <UpgradeCeremony
          card={card}
          from={from}
          to={ceremony.to}
          cost={ceremony.cost}
          serial={ceremony.serial}
          serialMult={ceremony.mult}
          gain={gain}
          holo={holo}
          // The page refreshes when the animation closes: the row being upgraded may disappear, which would cut it short.
          onClose={() => { setCeremony(null); router.refresh(); }}
        />
      )}
      {armed && state !== 'working' && <span role="status" className="text-[11px] text-gray-400 max-w-56 text-right">Tap again to spend {cost} {VARIANT_LABELS[from]} for 1 {VARIANT_LABELS[to]}.</span>}
      {state === 'error' && <span className="text-[11px] text-red-400 max-w-56 text-right">{error}</span>}
    </span>
  );
}
