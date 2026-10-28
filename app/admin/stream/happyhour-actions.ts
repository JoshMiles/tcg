'use server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin-guard';
import { endHappyHour, startHappyHour } from '@/lib/happyhour';
import type { ActionResult } from '../action-types';

// The Paid pulls tab's Happy hour box (ROADMAP 55.4c). Staff only; the input is validated in lib/happyhour.ts.

export async function startHappyHourAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const staff = await requireAdmin();
  const r = await startHappyHour({ minutes: formData.get('minutes'), kind: formData.get('kind'), percent: formData.get('percent') }, staff.login);
  if (r.ok) revalidatePath('/admin/stream');
  return r;
}

export async function endHappyHourAction(): Promise<ActionResult> {
  const staff = await requireAdmin();
  const r = await endHappyHour(staff.login);
  revalidatePath('/admin/stream');
  return { ok: true, message: r.message };
}
