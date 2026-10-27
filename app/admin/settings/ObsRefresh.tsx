'use client';
import { useActionState } from 'react';
import { Icon } from '@/app/components/Icon';
import { PendingButton } from '@/app/components/PendingButton';
import type { ActionResult } from '../action-types';
import { refreshOverlayInObsAction } from './obs-actions';

/** "Refresh overlay in OBS": TCG Bridge presses Refresh cache of current page on the overlay browser source. Shown only when a bridge is paired. */
export function ObsRefresh() {
  const [state, action] = useActionState<ActionResult | null, FormData>(() => refreshOverlayInObsAction(), null);
  return (
    <form action={action} className="space-y-2">
      <PendingButton pendingLabel="Refreshing…" className="px-4 py-2 text-sm font-bold rounded-xl border border-gray-700 text-gray-100 hover:border-gray-500">
        <Icon name="refresh" className="mr-1.5" />Refresh overlay in OBS
      </PendingButton>
      {state && <p role="status" className={`text-sm ${state.ok ? 'text-green-300' : 'text-amber-200'}`}>{state.message}</p>}
    </form>
  );
}
