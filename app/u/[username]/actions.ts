'use server';
import { getSession } from '@/lib/session';
import { getUserSettings, saveUserSettings } from '@/lib/user-settings-store';
import { sanitizeProfileLayout, type ProfilePlacement } from '@/lib/profile-widgets';

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
