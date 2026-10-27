'use server';
import { requireAdmin } from '@/lib/admin-guard';
import { recordAudit } from '@/lib/audit';
import { refreshOverlayInObs } from '@/lib/bridge';
import type { ActionResult } from '../action-types';

/** Asks TCG Bridge to refresh the overlay browser source in OBS (the "Refresh cache of current page" button), and says how it went. */
export async function refreshOverlayInObsAction(): Promise<ActionResult> {
  await requireAdmin();
  const r = await refreshOverlayInObs();
  await recordAudit('everyone', r.ok ? 'Overlay refreshed in OBS' : 'Overlay refresh in OBS failed', r.error);
  return r.ok
    ? { ok: true, message: 'Refreshed the overlay in OBS.' }
    : { ok: false, message: `Could not refresh the overlay in OBS: ${r.error ?? 'unknown reason'}` };
}
