'use server';
import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/session';
import { getUserSettings, saveUserSettings } from '@/lib/user-settings-store';
import { sanitizeProfileLayout, type ProfilePlacement } from '@/lib/profile-widgets';
import { sanitizeUserSettings, type CollectionView } from '@/lib/user-settings';
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

/** Saves the bio and accent colour from the owner's inline profile editor. The viewer comes from the session, never the arguments; everything goes through sanitizeUserSettings. */
export async function saveProfileBasics(input: { bio: unknown; accent: unknown }): Promise<{ bio: string; accent: string }> {
  const session = await getSession();
  if (!session) throw new Error('Log in to edit your profile.');
  const current = await getUserSettings(session.username);
  const clean = sanitizeUserSettings({ ...current, bio: input?.bio, accent: input?.accent });
  await saveUserSettings(session.username, { ...current, bio: clean.bio, accent: clean.accent });
  revalidatePath(`/u/${session.username}`);
  revalidatePath('/settings');
  return { bio: clean.bio, accent: clean.accent };
}

/** Which view (grid or binder) their collection opens in for visitors; a visitor's own choice still wins. */
export async function saveCollectionViewAction(view: unknown): Promise<CollectionView> {
  const session = await getSession();
  if (!session) throw new Error('Log in to change your profile.');
  const current = await getUserSettings(session.username);
  const clean = sanitizeUserSettings({ ...current, collectionView: view }).collectionView;
  await saveUserSettings(session.username, { ...current, collectionView: clean });
  revalidatePath(`/u/${session.username}`);
  return clean;
}
