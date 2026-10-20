'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { randomBytes } from 'crypto';
import { requireAdmin } from '@/lib/admin-guard';
import { achievementSettingsFromForm, getCustomGoals, saveAchievementSettings, saveCustomGoals } from '@/lib/achievement-settings';
import { normalizeCustomGoals, type CustomGoal } from '@/lib/achievements';
import { recountAchievements } from '@/lib/achievements-store';
import { notifyAdminLog } from '@/lib/discord';
import { currentStaffLogin } from '@/lib/staff-actor';

const done = (saved: string): never => {
  revalidatePath('/admin/achievements');
  redirect(`/admin/achievements?saved=${saved}`);
};

/** Saves which built-in achievements are on, and any replacement title or detail. A missing checkbox means off. */
export async function saveAchievementSettingsAction(formData: FormData) {
  await requireAdmin();
  await saveAchievementSettings(achievementSettingsFromForm(formData));
  await notifyAdminLog({ action: 'Achievement list changed', by: await currentStaffLogin() });
  done('settings');
}

/** Creates (no id) or edits one custom goal. Goals already earned stay on profiles whatever happens here. */
export async function saveCustomGoalAction(formData: FormData) {
  await requireAdmin();
  const num = (k: string) => Number(formData.get(k));
  const id = String(formData.get('id') ?? '') || randomBytes(4).toString('hex');
  const next = normalizeCustomGoals([{
    id,
    on: formData.get('on') === 'on',
    title: formData.get('title'),
    detail: formData.get('detail'),
    icon: formData.get('icon'),
    buffId: formData.get('buffId'),
    rule: { type: formData.get('rule'), n: num('n'), stars: num('stars'), variant: formData.get('variant') },
  }])[0] as CustomGoal | undefined;
  if (!next) redirect('/admin/achievements?error=goal');
  const all = await getCustomGoals();
  await saveCustomGoals(all.some(g => g.id === id) ? all.map(g => (g.id === id ? next : g)) : [...all, next]);
  await notifyAdminLog({ action: `Custom achievement saved: ${next.title}`, by: await currentStaffLogin() });
  done('goal');
}

export async function deleteCustomGoalAction(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get('id') ?? '');
  await saveCustomGoals((await getCustomGoals()).filter(g => g.id !== id));
  await notifyAdminLog({ action: 'Custom achievement deleted', by: await currentStaffLogin() });
  done('deleted');
}

/** Rebuilds the "earned by" counts from every player's stored goals. */
export async function recountAchievementsAction() {
  await requireAdmin();
  await recountAchievements();
  done('recount');
}
