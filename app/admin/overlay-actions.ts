'use server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin-guard';
import { getOverlayStatus } from '@/lib/overlay';
import { addScheduledLook, bumpReloadToken, listPresets, removeScheduledLook, saveZones, setSeasonLook } from '@/lib/overlay-settings';
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

/** Schedules a preset between two instants (epoch ms): the overlay layers it over the season look while it runs and reloads itself at each edge. */
export async function addScheduledLookAction(presetId: string, start: number, end: number): Promise<OverlayActionResult> {
  await requireAdmin();
  const r = await addScheduledLook(presetId, start, end);
  if (!r.ok) return r;
  revalidatePath('/admin/overlay');
  return { ok: true, message: 'Look scheduled. Idle overlays reload by themselves at the start and end.' };
}

export async function removeScheduledLookAction(id: string): Promise<OverlayActionResult> {
  await requireAdmin();
  await removeScheduledLook(id);
  revalidatePath('/admin/overlay');
  return { ok: true, message: 'Scheduled look removed.' };
}

/** Saves a scope's editor-only Twitch UI zones (staff-wide, never sent to the live overlay). */
export async function saveOverlayZonesAction(scope: string, zones: unknown): Promise<void> {
  await requireAdmin();
  await saveZones(scope, zones);
}
