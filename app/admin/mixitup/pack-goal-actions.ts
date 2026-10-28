'use server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin-guard';
import { clearPackGoal, setPackGoal } from '@/lib/pack-goal';
import type { ActionResult } from '../action-types';

// The Paid pulls tab's Community pack goal box (ROADMAP 57.5). Staff only; the input is validated in lib/pack-goal-core.ts.

export async function setPackGoalAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const staff = await requireAdmin();
  const r = await setPackGoal({ target: formData.get('target'), label: formData.get('label'), reward: formData.get('reward'), buffId: formData.get('buffId'), amount: formData.get('amount') }, staff.login);
  if (r.ok) revalidatePath('/admin/mixitup');
  return { ok: r.ok, message: r.message };
}

export async function clearPackGoalAction(): Promise<ActionResult> {
  const staff = await requireAdmin();
  const r = await clearPackGoal(staff.login);
  revalidatePath('/admin/mixitup');
  return { ok: true, message: r.message };
}
