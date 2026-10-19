'use server';
import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/session';
import { getUserSettings, saveUserSettings } from '@/lib/user-settings-store';
import { sanitizeProfileLayout, type ProfilePlacement } from '@/lib/profile-widgets';
import { sanitizeUserSettings, type CollectionView } from '@/lib/user-settings';
import { getActiveSeasonWithPacks } from '@/lib/kv';
import { getOwnerCopies } from '@/lib/serials';
import type { Pronouns } from '@/lib/pronouns';
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
export async function saveProfileBasics(input: { bio: unknown; accent: unknown; pronouns?: unknown }): Promise<{ bio: string; accent: string; pronouns: Pronouns }> {
  const session = await getSession();
  if (!session) throw new Error('Log in to edit your profile.');
  const current = await getUserSettings(session.username);
  const clean = sanitizeUserSettings({ ...current, bio: input?.bio, accent: input?.accent, pronouns: input?.pronouns === undefined ? current.pronouns : input.pronouns });
  await saveUserSettings(session.username, { ...current, bio: clean.bio, accent: clean.accent, pronouns: clean.pronouns });
  revalidatePath(`/u/${session.username}`);
  revalidatePath('/settings');
  return { bio: clean.bio, accent: clean.accent, pronouns: clean.pronouns };
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

/** The signed-in viewer picks up to 3 of their own prints for the Showcase widget. Empty goes back to the three most valuable. */
export async function saveShowcaseAction(uids: unknown): Promise<{ ok: true; uids: number[] } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'Log in to edit your showcase.' };
  if (!Array.isArray(uids)) return { ok: false, error: 'Pick up to 3 prints.' };
  const active = await getActiveSeasonWithPacks();
  if (!active) return { ok: false, error: 'There is no season running right now.' };
  const copies = await getOwnerCopies(active.season.collectionName, session.username);
  const owned = new Set(copies.flatMap(c => c.uid ? [c.uid] : []));
  const current = await getUserSettings(session.username);
  const clean = sanitizeUserSettings({ ...current, showcaseUids: uids }, owned);
  await saveUserSettings(session.username, clean);
  revalidatePath(`/u/${session.username}`);
  return { ok: true, uids: clean.showcaseUids };
}
