'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin-guard';
import { ACCESS_LABELS, ACCESS_MODES, type AccessLabel, type AccessMode } from '@/lib/access-core';
import { removeTester, saveAccessSettings, setTester } from '@/lib/access';

const back = (kind: 'saved' | 'error' | 'note', text: string): never => redirect(`/admin/settings?tab=access&${kind}=${encodeURIComponent(text)}`);

/** Saves the mode, the banner label and the message on the closed page. */
export async function saveAccessAction(formData: FormData): Promise<void> {
  const staff = await requireAdmin();
  const mode = String(formData.get('mode') ?? '') as AccessMode;
  const label = String(formData.get('label') ?? '') as AccessLabel;
  if (!ACCESS_MODES.includes(mode) || !ACCESS_LABELS.includes(label)) return back('error', 'Pick a mode and a banner.');
  const r = await saveAccessSettings(staff.login, { mode, label, message: String(formData.get('message') ?? '') });
  revalidatePath('/', 'layout');
  return r.ok ? back('note', r.message) : back('error', r.message);
}

/** Adds a tester by Twitch login (or moves them to another tier). */
export async function addTesterAction(formData: FormData): Promise<void> {
  const staff = await requireAdmin();
  const r = await setTester(staff.login, formData.get('login'), formData.get('tier'), formData.get('note'));
  revalidatePath('/admin/settings');
  return r.ok ? back('note', r.message) : back('error', r.message);
}

/** Removes a tester. Called from the armed button on a row, so it returns the message instead of redirecting. */
export async function removeTesterAction(login: string): Promise<{ ok: boolean; message: string }> {
  const staff = await requireAdmin();
  const r = await removeTester(staff.login, login);
  revalidatePath('/admin/settings');
  revalidatePath('/admin/users');
  return r;
}

/** From the user page: set the viewer's tester tier, or none. */
export async function setUserTesterAction(login: string, tier: string): Promise<{ ok: boolean; message: string }> {
  const staff = await requireAdmin();
  const r = tier === 'none' ? await removeTester(staff.login, login) : await setTester(staff.login, login, tier);
  revalidatePath(`/admin/users/${login}`);
  revalidatePath('/admin/settings');
  return r;
}
