'use server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin-guard';
import { deleteTextPreset, getTextPresets, saveTextPreset } from '@/lib/text-presets-store';
import type { TextPreset } from '@/lib/text-presets';

// Named text styles for the card back editor (and later the overlay editor). Staff-wide.

export async function listTextPresetsAction(): Promise<TextPreset[]> {
  await requireAdmin();
  return getTextPresets();
}

export async function saveTextPresetAction(name: string, style: unknown): Promise<TextPreset[]> {
  await requireAdmin();
  const list = await saveTextPreset(name, style);
  revalidatePath('/admin/packs/[packId]', 'page');
  return list;
}

export async function deleteTextPresetAction(id: string): Promise<TextPreset[]> {
  await requireAdmin();
  const list = await deleteTextPreset(id);
  revalidatePath('/admin/packs/[packId]', 'page');
  return list;
}
