'use client';
import { useActionState, useState, useTransition } from 'react';
import { clearQueueAction } from '../actions';
import type { ActionResult } from '../action-types';
import { ConfirmButton } from '../components/ConfirmButton';
import { Spinner } from '../components/PendingButton';
import { setLiveGateAction } from './actions';

function Switch({ label, hint, on, busy, onChange }: { label: string; hint: string; on: boolean; busy: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={busy} onClick={() => onChange(!on)} className="w-full flex items-center gap-3 rounded-lg border border-gray-800 bg-gray-950/40 hover:border-gray-600 px-3 py-2.5 text-left transition-colors disabled:opacity-60">
      <span className={`relative w-9 h-5 rounded-full shrink-0 transition-colors ${on ? 'bg-yellow-500' : 'bg-gray-700'}`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${on ? 'left-[1.1rem]' : 'left-0.5'}`} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-gray-200">{label}</span>
        <span className="block text-[11px] text-gray-500">{hint}</span>
      </span>
      {busy && <Spinner />}
    </button>
  );
}

/** Queue size, the two "only when live" switches and clearing the queue, right on the dashboard. */
export function OverlayControls({ queued, connected, packsOnly, collectionsOnly }: { queued: number; connected: number; packsOnly: boolean; collectionsOnly: boolean }) {
  const [packs, setPacks] = useState(packsOnly);
  const [colls, setColls] = useState(collectionsOnly);
  const [busy, startTransition] = useTransition();
  const [which, setWhich] = useState<'packs' | 'collections' | null>(null);
  const [clearState, clearForm, clearing] = useActionState<ActionResult | null, FormData>(clearQueueAction, null);

  const set = (kind: 'packs' | 'collections', value: boolean) => {
    setWhich(kind);
    if (kind === 'packs') setPacks(value); else setColls(value);
    startTransition(async () => {
      try { await setLiveGateAction(kind, value); } catch { if (kind === 'packs') setPacks(!value); else setColls(!value); }
      setWhich(null);
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-400">{connected === 0 ? 'No overlay connected' : connected === 1 ? '1 overlay connected' : `${connected} overlays connected`}</span>
        <span className={`font-semibold tabular-nums ${queued > 0 ? 'text-amber-300' : 'text-gray-300'}`}>{queued} queued</span>
      </div>
      <Switch label="Packs only when live" hint="Ignore pack triggers while the stream is offline" on={packs} busy={busy && which === 'packs'} onChange={v => set('packs', v)} />
      <Switch label="Collections only when live" hint="Ignore show-collection triggers while offline" on={colls} busy={busy && which === 'collections'} onChange={v => set('collections', v)} />
      <form action={clearForm} className="flex items-center justify-between gap-3">
        <span className="text-xs text-green-300">{clearState?.ok ? clearState.message : ''}</span>
        <ConfirmButton
          title="Clear the overlay queue?"
          confirmLabel="Clear queue"
          message={<>Discard everything waiting for the overlay{queued > 0 ? <> (<strong className="text-white">{queued}</strong>)</> : null}? Gifted packs in the queue will never play.</>}
          className={`px-3 py-1.5 text-xs font-bold bg-gray-800 hover:bg-gray-700 text-gray-100 rounded-lg transition-colors ${clearing || queued === 0 ? 'opacity-50' : ''}`}
        >
          Clear queue
        </ConfirmButton>
      </form>
    </div>
  );
}
