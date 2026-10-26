'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { kv } from '@/lib/db';
import { IDS } from '@/lib/account-id';
import { findEarlierAccount } from '@/lib/account-restore';
import { cardsOf, declineAside, moveAccount } from '@/lib/account-move';
import { profileHref } from '@/lib/profile-url';
import { siteClosedResponse } from '@/lib/access';
import { getUserSettings, saveUserSettings } from '@/lib/user-settings-store';
import { sanitizeProfileLayout, type ProfilePlacement } from '@/lib/profile-widgets';
import { sanitizeUserSettings, type CollectionView } from '@/lib/user-settings';
import { getActiveSeasonWithPacks } from '@/lib/kv';
import { getOwnerCopies } from '@/lib/serials';
import type { Pronouns } from '@/lib/pronouns';
import { DEFAULT_BINDER, sanitizeBinder, type BinderConfig } from '@/lib/binder-config';
import { useTrainerCard } from '@/lib/buffs';

const CLOSED = 'The site is not open to you right now.';
/** Server actions skip the middleware, so each one re-checks the closed site itself, like the account APIs. */
const siteClosed = async () => !!(await siteClosedResponse());

/** Saves the signed-in viewer's own Overview layout. The viewer comes from the session, never the arguments. */
export async function saveProfileLayoutAction(layout: unknown): Promise<ProfilePlacement[]> {
  const session = await getSession();
  if (!session) throw new Error('Log in to edit your profile.');
  if (await siteClosed()) throw new Error(CLOSED);
  const clean = sanitizeProfileLayout(layout);
  const current = await getUserSettings(session.username);
  await saveUserSettings(session.username, { ...current, profileLayout: clean });
  return clean;
}

/** Back to the default layout. */
export async function resetProfileLayoutAction(): Promise<ProfilePlacement[]> {
  const session = await getSession();
  if (!session) throw new Error('Log in to edit your profile.');
  if (await siteClosed()) throw new Error(CLOSED);
  const current = await getUserSettings(session.username);
  await saveUserSettings(session.username, { ...current, profileLayout: null });
  return sanitizeProfileLayout(null);
}

/** Saves the signed-in viewer's own binder (look and, if they placed cards by hand, the pages). Returns what was stored. */
export async function saveBinderAction(config: unknown): Promise<BinderConfig> {
  const session = await getSession();
  if (!session) throw new Error('Log in to customise your binder.');
  if (await siteClosed()) throw new Error(CLOSED);
  const clean = sanitizeBinder(config);
  const current = await getUserSettings(session.username);
  await saveUserSettings(session.username, { ...current, binder: clean });
  return clean ?? DEFAULT_BINDER;
}

/** Saves the bio and accent colour from the owner's inline profile editor. The viewer comes from the session, never the arguments; everything goes through sanitizeUserSettings. */
export async function saveProfileBasics(input: { bio: unknown; accent: unknown; pronouns?: unknown }): Promise<{ bio: string; accent: string; pronouns: Pronouns }> {
  const session = await getSession();
  if (!session) throw new Error('Log in to edit your profile.');
  if (await siteClosed()) throw new Error(CLOSED);
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
  if (await siteClosed()) throw new Error(CLOSED);
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
  if (await siteClosed()) return { ok: false, error: CLOSED };
  if (!Array.isArray(uids)) return { ok: false, error: 'Pick up to 3 editions.' };
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

/**
 * Uses a trainer card: consumes 1 Regular copy and activates its buff.
 * Viewer identity is strictly from the active session.
 */
export async function useTrainerCardAction(cardNumber: number, seasonId?: string): Promise<{ ok: boolean; error?: string; message?: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'Log in to use trainer cards.' };
  if (await siteClosed()) return { ok: false, error: CLOSED };
  if (!Number.isInteger(cardNumber) || cardNumber <= 0) return { ok: false, error: 'Invalid card number.' };
  const res = await useTrainerCard(session.username, cardNumber, seasonId);
  if (!res.ok) {
    return { ok: false, error: res.error };
  }
  revalidatePath(`/u/${session.username}`);
  return { ok: true, message: res.message };
}

// The two actions behind the "earlier collection" notice (EarlierCollection.tsx, on the owner's Stats tab). Both take the viewer from the
// session and check every condition again: the notice may be stale or forged.

/** Moves the earlier collection onto the login the viewer is signed in as, but only into a blank account. */
export async function restoreEarlierAction() {
  const session = await getSession();
  if (!session) redirect('/auth/twitch?returnTo=/account');
  const found = await findEarlierAccount(session.username, session.twitchId);
  let outcome = 'failed';
  if (found && (await cardsOf(session.username)) === 0) {
    const res = await moveAccount(found.owner, session.username, { mode: 'rename', replaceBlank: true, reason: 'Restored by its owner' });
    if (res.ok) outcome = 'ok';
    else console.error(`[account] restore of ${found.owner} to ${session.username} failed: ${res.error}`);
  }
  revalidatePath(`/u/${session.username}`);
  redirect(`${profileHref(session.username, 'stats')}&restored=${outcome}`);
}

/** Stops the Stats tab offering the earlier collection: this login is the account's home from now on. */
export async function keepSeparateAction() {
  const session = await getSession();
  if (!session) redirect('/auth/twitch?returnTo=/account');
  const found = await findEarlierAccount(session.username, session.twitchId);
  if (found) {
    if (found.owner.includes('~')) await declineAside(found.owner);
    await kv.hset(IDS, { [session.twitchId]: session.username });
  }
  revalidatePath(`/u/${session.username}`);
  redirect(profileHref(session.username, 'stats'));
}
