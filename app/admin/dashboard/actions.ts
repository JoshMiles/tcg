'use server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin-guard';
import { sanitizeLayout, type DashboardLayout } from '@/lib/dashboard';
import { loginForLayout } from '@/lib/dashboard';
import { deleteDashboardPreset, getDashboardPresets, saveDashboardLayout, saveDashboardNotes, saveDashboardPreset } from '@/lib/dashboard-data';
import { getOverlaySettings, saveOverlaySettings } from '@/lib/overlay-settings';

/** Saves the widget layout (re-sanitised here: a server action can be called with anything). */
export async function saveDashboardLayoutAction(layout: DashboardLayout): Promise<{ ok: true; layout: DashboardLayout }> {
  const who = await requireAdmin();
  const clean = sanitizeLayout(layout);
  await saveDashboardLayout(clean, loginForLayout(who));
  revalidatePath('/admin');
  return { ok: true, layout: clean };
}

export async function saveDashboardNotesAction(text: string): Promise<void> {
  await requireAdmin();
  await saveDashboardNotes(String(text ?? ''));
}

/** Stores the given layout as a named preset (replacing one with the same name). */
export async function saveDashboardPresetAction(name: string, layout: DashboardLayout): Promise<{ name: string; by?: string }[]> {
  const who = await requireAdmin();
  const clean = String(name ?? '').trim().slice(0, 30);
  if (!clean) throw new Error('Give the preset a name.');
  await saveDashboardPreset(clean, sanitizeLayout(layout), who.via === 'twitch' ? who.login : who.displayName);
  return (await getDashboardPresets()).map(p => ({ name: p.name, by: p.by }));
}

export async function deleteDashboardPresetAction(name: string): Promise<{ name: string; by?: string }[]> {
  await requireAdmin();
  await deleteDashboardPreset(String(name));
  return (await getDashboardPresets()).map(p => ({ name: p.name, by: p.by }));
}

/** Makes a team layout the caller's own layout. */
export async function applyDashboardPresetAction(name: string): Promise<DashboardLayout> {
  const who = await requireAdmin();
  const preset = (await getDashboardPresets()).find(p => p.name === name);
  if (!preset) throw new Error('That preset no longer exists.');
  await saveDashboardLayout(preset.layout, loginForLayout(who));
  revalidatePath('/admin');
  return preset.layout;
}

/** The overlay's "only when live" switches, from the dashboard. */
export async function setLiveGateAction(kind: 'packs' | 'collections', value: boolean): Promise<void> {
  await requireAdmin();
  const current = await getOverlaySettings();
  await saveOverlaySettings({ ...current, ...(kind === 'packs' ? { livePacksOnly: !!value } : { liveCollectionsOnly: !!value }) });
  revalidatePath('/admin');
  revalidatePath('/admin/settings');
}
