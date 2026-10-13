'use server';
import { getSession } from '@/lib/session';
import { getUserSettings, saveUserSettings } from '@/lib/user-settings-store';
import { sanitizeProfileLayout, type ProfilePlacement } from '@/lib/profile-widgets';
import { DEFAULT_BINDER, sanitizeBinder, type BinderConfig } from '@/lib/binder-config';

/** Saves the signed-in viewer's own Overview layout. The viewer comes from the session, never the arguments. */
export async function saveProfileLayoutAction(layout: unknown): Promise<ProfilePlacement[]> {
  const session = await getSession();
  if (!session) throw new Error('Log in to edit your profile.');
  const clean = sanitizeProfileLayout(layout);
  const current = await getUserSettings(session.username);
  await saveUserSettings(session.username, { ...current, profileLayout: clean });
  return clean;
}

/** Back to the default layout. */
export async function resetProfileLayoutAction(): Promise<ProfilePlacement[]> {
  const session = await getSession();
  if (!session) throw new Error('Log in to edit your profile.');
  const current = await getUserSettings(session.username);
  await saveUserSettings(session.username, { ...current, profileLayout: null });
  return sanitizeProfileLayout(null);
}

/** Saves the signed-in viewer's own binder (look and, if they placed cards by hand, the pages). Returns what was stored. */
export async function saveBinderAction(config: unknown): Promise<BinderConfig> {
  const session = await getSession();
  if (!session) throw new Error('Log in to customise your binder.');
  const clean = sanitizeBinder(config);
  const current = await getUserSettings(session.username);
  await saveUserSettings(session.username, { ...current, binder: clean });
  return clean ?? DEFAULT_BINDER;
}
