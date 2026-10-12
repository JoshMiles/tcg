'use server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin-guard';
import { getOverlayStatus } from '@/lib/overlay';
import { bumpReloadToken, listPresets, setSeasonLook } from '@/lib/overlay-settings';
import { deleteVersion } from '@/lib/overlay-versions';
import { getSeason } from '@/lib/kv';

export interface OverlayActionResult { ok: boolean; message: string }

/** Asks every connected overlay to reload its look (each reloads once it is idle, within a heartbeat or two). */
export async function refreshOverlayAction(): Promise<OverlayActionResult> {
  await requireAdmin();
  const status = await getOverlayStatus();
  await bumpReloadToken();
  return status.connected === 0
    ? { ok: true, message: 'No overlay is connected right now. It will pick up the saved look the next time it loads.' }
    : { ok: true, message: `Asked ${status.connected} overlay${status.connected === 1 ? '' : 's'} to refresh. They reload within about 10 seconds, once nothing is animating.` };
}

export async function deleteOverlayVersionAction(id: string): Promise<OverlayActionResult> {
  await requireAdmin();
  await deleteVersion(id);
  revalidatePath('/admin/overlay');
  return { ok: true, message: 'Version deleted.' };
}

/** Attaches a preset to a season (or clears it): while that season is active its look is layered over the global values. */
export async function setSeasonLookAction(seasonId: string, presetId: string | null): Promise<OverlayActionResult> {
  await requireAdmin();
  const season = await getSeason(seasonId);
  if (!season) return { ok: false, message: 'That season no longer exists.' };
  if (presetId && !(await listPresets()).some(p => p.id === presetId)) return { ok: false, message: 'That preset no longer exists.' };
  await setSeasonLook(seasonId, presetId);
  revalidatePath('/admin/overlay');
  return { ok: true, message: presetId ? `${season.name} now uses that look while it is active. Refresh the overlay to see it.` : `${season.name} follows the global look again.` };
}
