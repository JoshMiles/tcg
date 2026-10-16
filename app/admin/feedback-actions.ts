'use server';
import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/staff-guard';
import { currentStaffLogin } from '@/lib/staff-actor';
import { requireAdmin } from '@/lib/admin-guard';
import { closeDeletion, getFeedback, updateFeedback } from '@/lib/feedback';
import { deleteViewerAccount } from '@/lib/account-deletion';

/** Sets the status and/or writes the reply on one suggestion or problem report. The sender gets a bell notice. Mods may use it. */
export async function updateFeedbackAction(id: string, formData: FormData): Promise<void> {
  await requireStaff('mod');
  if ((await getFeedback(id))?.kind === 'deletion') await requireAdmin(); // handling a deletion request is for admins
  const reply = formData.get('reply');
  await updateFeedback(id, { status: formData.get('status'), reply: typeof reply === 'string' ? reply : undefined }, await currentStaffLogin());
  revalidatePath('/admin/feedback');
  revalidatePath('/mod/feedback');
}

/** Deletes the viewer behind a deletion request (cards, profile, settings, notices, devices; open offers cancelled), then marks it done. Admins only. */
export async function deleteViewerForRequestAction(id: string): Promise<void> {
  const staff = await requireAdmin();
  const item = await getFeedback(id);
  if (!item || item.kind !== 'deletion' || item.status !== 'new') return;
  await deleteViewerAccount(item.user);
  await closeDeletion(id, staff.login);
  revalidatePath('/admin/feedback');
  revalidatePath('/mod/feedback');
  revalidatePath('/admin/users');
}

/** Declines a deletion request with a reason; the sender is told. Admins only. */
export async function declineDeletionAction(id: string, formData: FormData): Promise<void> {
  await requireAdmin();
  const item = await getFeedback(id);
  const reason = formData.get('reason');
  if (!item || item.kind !== 'deletion' || typeof reason !== 'string' || reason.trim().length < 3) return;
  await updateFeedback(id, { status: 'wontfix', reply: reason }, await currentStaffLogin());
  revalidatePath('/admin/feedback');
  revalidatePath('/mod/feedback');
}
