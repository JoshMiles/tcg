'use client';

import { useState, useRef, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from './Icon';
import { Spinner } from '@/app/components/PendingButton';
import { useTrainerCardAction } from '@/app/u/[username]/actions';

export function UseTrainerButton({
  cardNumber,
  cardName,
  seasonId,
  isFavourite,
  disabled,
  className = '',
}: {
  cardNumber: number;
  cardName: string;
  seasonId?: string;
  isFavourite?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isPending, startTransition] = useTransition();
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (armTimer.current) clearTimeout(armTimer.current);
  }, []);

  const canUse = !disabled && !isFavourite && state !== 'working' && !isPending;

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (!canUse) return;

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

    startTransition(async () => {
      try {
        const res = await useTrainerCardAction(cardNumber, seasonId);
        if (!res.ok) {
          setError(res.error || 'Failed to use trainer card');
          setState('error');
          return;
        }
        setState('done');
        setSuccessMsg(res.message || `Used ${cardName}!`);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to use trainer card');
        setState('error');
      }
    });
  }

  const tooltip = isFavourite
    ? 'Favourited editions cannot be used'
    : disabled
      ? 'No usable Regular edition available'
      : armed
        ? 'Click again to confirm: consumes 1 Regular edition'
        : `Use this trainer card (${cardName})`;

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={!canUse || state === 'done'}
        title={tooltip}
        className={`inline-flex items-center gap-1.5 text-xs font-bold rounded-full px-3 py-1.5 border transition-colors ${
          canUse
            ? armed
              ? 'bg-amber-400 text-gray-950 border-amber-300 hover:bg-amber-300'
              : 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/20'
            : 'border-gray-800 text-gray-600 cursor-not-allowed bg-transparent'
        } disabled:opacity-60 ${className}`}
      >
        {state === 'working' || isPending ? (
          <>
            <Spinner />
            <span>Using...</span>
          </>
        ) : state === 'done' ? (
          <>
            <Icon name="check" />
            <span>Used</span>
          </>
        ) : armed ? (
          <>
            <Icon name="zap" />
            <span>Sure?</span>
          </>
        ) : (
          <>
            <Icon name="zap" />
            <span>Use trainer card</span>
          </>
        )}
      </button>

      {armed && state === 'idle' && (
        <span role="status" className="text-[11px] text-amber-300 max-w-64">
          Tap again to use. Consumes 1 Regular edition.
        </span>
      )}
      {state === 'done' && successMsg && (
        <span role="status" className="text-[11px] text-emerald-300 max-w-64">
          {successMsg}
        </span>
      )}
      {state === 'error' && error && (
        <span role="status" className="text-[11px] text-red-400 max-w-64">
          {error}
        </span>
      )}
    </span>
  );
}
