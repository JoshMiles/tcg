'use server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin-guard';
import { sanitizeLayout, type DashboardLayout } from '@/lib/dashboard';
import { resetDashboardLayout, saveDashboardLayout, saveDashboardNotes } from '@/lib/dashboard-data';

/** Saves the widget layout (re-sanitised here: a server action can be called with anything). */
export async function saveDashboardLayoutAction(layout: DashboardLayout): Promise<{ ok: true; layout: DashboardLayout }> {
  await requireAdmin();
  const clean = sanitizeLayout(layout);
  await saveDashboardLayout(clean);
  revalidatePath('/admin');
  return { ok: true, layout: clean };
}

/** Back to the default arrangement. */
export async function resetDashboardLayoutAction(): Promise<void> {
  await requireAdmin();
  await resetDashboardLayout();
  revalidatePath('/admin');
}

export async function saveDashboardNotesAction(text: string): Promise<void> {
  await requireAdmin();
  await saveDashboardNotes(String(text ?? ''));
}
