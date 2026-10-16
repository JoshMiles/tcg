'use server';
import { revalidatePath } from 'next/cache';
import { requireStaff } from '@/lib/staff-guard';
import { currentStaffLogin } from '@/lib/staff-actor';
import { updateFeedback } from '@/lib/feedback';

/** Sets the status and/or writes the reply on one suggestion or problem report. The sender gets a bell notice. Mods may use it. */
export async function updateFeedbackAction(id: string, formData: FormData): Promise<void> {
  await requireStaff('mod');
  const reply = formData.get('reply');
  await updateFeedback(id, { status: formData.get('status'), reply: typeof reply === 'string' ? reply : undefined }, await currentStaffLogin());
  revalidatePath('/admin/feedback');
  revalidatePath('/mod/feedback');
}
