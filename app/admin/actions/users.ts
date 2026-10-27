'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/admin-guard';
import { recordAudit } from '@/lib/audit';
import { takeUserSnapshot } from '@/lib/user-admin';
import { deleteViewerAccount } from '@/lib/account-deletion';
import {
  listSeasons, updateCollection, deleteCollection, removeUserFromCollection, withCollectionLock,
  getUserProfile, saveUserProfile,
} from '@/lib/kv';
import type { UserProfile } from '@/lib/types';
import { VARIANT_LABELS, decodeEntry } from '@/lib/variants';
import { recordActivity } from '@/lib/activity';
import { clearQueueRefunding } from '@/lib/queue-control';
import { grantCardTo, queueOverlayEvents } from '@/lib/staff-actions';
import type { ActionResult } from '../action-types';
import { parseVariant, requireSeasonCollection, cleanUsername, BAD_USERNAME } from './form-helpers';

// ── Users ─────────────────────────────────────────────────

export async function updateUserProfile(username: string, formData: FormData) {
  await requireAdmin();
  const existing = await getUserProfile(username);
  const profile: UserProfile = {
    ...existing,
    username: username.toLowerCase(),
    displayName: String(formData.get('displayName') ?? '').trim().slice(0, 60) || username,
    notes: String(formData.get('notes') ?? '').trim().slice(0, 2000),
    createdAt: existing?.createdAt ?? Date.now(),
  };
  await saveUserProfile(profile);
  await recordAudit(username, 'Profile edited', [profile.displayName !== existing?.displayName && `name: ${profile.displayName}`, profile.notes !== (existing?.notes ?? '') && 'notes updated'].filter(Boolean).join(' · ') || undefined);
  revalidatePath(`/admin/users/${username.toLowerCase()}`);
  revalidatePath('/admin/users');
}

// Remove one instance of a card from a user's collection. `entry` is the encoded card + variant (see lib/variants.ts).
export async function removeUserCard(username: string, collectionName: string, entry: number) {
  await requireAdmin();
  await requireSeasonCollection(collectionName);
  const lower = username.toLowerCase();
  const { cardNumber, variant } = decodeEntry(entry);
  const removed = await withCollectionLock(collectionName, () => updateCollection(collectionName, [lower], cards => {
    const idx = cards[lower].indexOf(entry);
    if (idx === -1) return { result: false };
    return { result: true, cards: { [lower]: [...cards[lower].slice(0, idx), ...cards[lower].slice(idx + 1)] } };
  }));
  if (removed) {
    await recordActivity({ type: 'remove', username: lower, cardNumber, variant, collectionName });
    await recordAudit(lower, 'Card removed', `#${cardNumber}${variant === 'regular' ? '' : ` (${VARIANT_LABELS[variant]})`}`);
  }
  revalidatePath(`/admin/users/${lower}`);
  revalidatePath('/admin/users');
}

// Remove a user from a single season's collection
export async function resetUserSeason(username: string, collectionName: string) {
  await requireAdmin();
  await requireSeasonCollection(collectionName);
  const lower = username.toLowerCase();
  await takeUserSnapshot(lower, `Before resetting ${collectionName}`);
  if (await removeUserFromCollection(collectionName, lower)) {
    await recordActivity({ type: 'reset', scope: 'season', username: lower, collectionName });
    await recordAudit(lower, 'Season reset', collectionName);
  }
  revalidatePath(`/admin/users/${lower}`);
  revalidatePath('/admin/users');
}

// Fully delete a user, removes all cards and their profile, then redirects
export async function deleteUser(username: string) {
  await requireAdmin();
  const lower = username.toLowerCase();
  await deleteViewerAccount(lower); // snapshot, cancel open offers, cards, profile, settings, notices, devices, feedback (lib/account-deletion.ts)
  revalidatePath('/admin/users');
  redirect('/admin/users');
}

// Reset a user across ALL seasons
export async function resetUser(rawUsername: string) {
  await requireAdmin();
  const username = rawUsername.toLowerCase();
  await takeUserSnapshot(username, 'Before resetting every season');
  await recordAudit(username, 'All seasons reset');
  const seasons = await listSeasons();
  await Promise.all(seasons.map(s => removeUserFromCollection(s.collectionName, username)));
  await recordActivity({ type: 'reset', scope: 'all', username });
  revalidatePath(`/admin/users/${username}`);
  revalidatePath('/admin/users');
}

// Reset all users across ALL seasons
export async function resetAllUsers() {
  await requireAdmin();
  const seasons = await listSeasons();
  await Promise.all(seasons.map(s => deleteCollection(s.collectionName)));
  await recordActivity({ type: 'reset', scope: 'everyone', username: '' });
  revalidatePath('/admin/users');
}

// ── Dashboard quick actions ───────────────────────────────
// Each returns a result message for the UI (via useActionState) instead of redirecting.


// Queue overlay events (the overlay polls the queue every 2s and plays them on stream).
async function queueForOverlay(kind: 'pull' | 'collection', formData: FormData, count: number): Promise<ActionResult> {
  const username = cleanUsername(formData.get('username'));
  if (!username) return BAD_USERNAME;
  return queueOverlayEvents(kind, username, count, formData.get('force') === 'on');
}

async function giftPack(formData: FormData): Promise<ActionResult> {
  const count = Math.min(10, Math.max(1, parseInt(String(formData.get('count') ?? '1'), 10) || 1));
  return queueForOverlay('pull', formData, count);
}

async function showCollection(formData: FormData): Promise<ActionResult> {
  return queueForOverlay('collection', formData, 1);
}

// One form, several submit buttons: the clicked button's name="intent" value picks the action.
export async function quickAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  switch (formData.get('intent')) {
    case 'gift': return giftPack(formData);
    case 'show': return showCollection(formData);
    case 'grant': return grantCard(formData);
    default: return { ok: false, message: 'Unknown action.' };
  }
}

async function grantCard(formData: FormData): Promise<ActionResult> {
  const username = cleanUsername(formData.get('username'));
  if (!username) return BAD_USERNAME;

  return grantCardTo(username, parseInt(String(formData.get('cardNumber') ?? ''), 10), parseVariant(formData.get('variant')));
}

export async function clearQueueAction(): Promise<ActionResult> {
  await requireAdmin();
  const n = await clearQueueRefunding();
  revalidatePath('/admin');
  return { ok: true, message: n > 0 ? `Cleared ${n} waiting event${n !== 1 ? 's' : ''}.` : 'The queue was already empty.' };
}
