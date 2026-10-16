'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin-guard';
import { regenerateOverlayKey } from '@/lib/overlay-key';

/** Replaces the overlay key. The old OBS addresses stop working until they are replaced. */
export async function regenerateOverlayKeyAction(): Promise<void> {
  await requireAdmin();
  await regenerateOverlayKey();
  revalidatePath('/admin', 'layout');
  redirect('/admin/settings?tab=overlay&saved=overlay-key');
}
