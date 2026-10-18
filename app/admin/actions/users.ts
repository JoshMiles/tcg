'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/admin-guard';
import { recordAudit } from '@/lib/audit';
import { takeUserSnapshot } from '@/lib/user-admin';
import { deleteViewerAccount } from '@/lib/account-deletion';
import {
  listSeasons, getCollection, saveCollection, deleteCollection, removeUserFromCollection, addCollectionEntryWithSerial, withCollectionLock,
  getUserProfile, saveUserProfile, getActiveSeasonWithPacks, ensureUserProfile,
} from '@/lib/kv';
import type { UserProfile } from '@/lib/types';
import { VARIANT_LABELS, encodeEntry, decodeEntry } from '@/lib/variants';
import { recordActivity } from '@/lib/activity';
import { getOverlayStatus } from '@/lib/overlay';
import { enqueueEvent, clearQueue } from '@/lib/webhooks';
import { issueDraw } from '@/lib/draw';
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
    twitchId: String(formData.get('twitchId') ?? '').trim().slice(0, 60) || existing?.twitchId,
    notes: String(formData.get('notes') ?? '').trim().slice(0, 2000),
    createdAt: existing?.createdAt ?? Date.now(),
  };
  await saveUserProfile(profile);
  await recordAudit(username, 'Profile edited', [profile.displayName !== existing?.displayName && `name: ${profile.displayName}`, profile.twitchId !== existing?.twitchId && 'Twitch username changed', profile.notes !== (existing?.notes ?? '') && 'notes updated'].filter(Boolean).join(' · ') || undefined);
  revalidatePath(`/admin/users/${username.toLowerCase()}`);
  revalidatePath('/admin/users');
}

// Remove one instance of a card from a user's collection. `entry` is the encoded card + variant (see lib/variants.ts).
export async function removeUserCard(username: string, collectionName: string, entry: number) {
  await requireAdmin();
  await requireSeasonCollection(collectionName);
  const lower = username.toLowerCase();
  const { cardNumber, variant } = decodeEntry(entry);
  const removed = await withCollectionLock(collectionName, async () => {
    const data = await getCollection(collectionName);
    const idx = data[lower]?.indexOf(entry) ?? -1;
    if (idx === -1) return false;
    data[lower] = [...data[lower].slice(0, idx), ...data[lower].slice(idx + 1)];
    if (data[lower].length === 0) delete data[lower];
    await saveCollection(collectionName, data);
    return true;
  });
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

  const status = await getOverlayStatus();
  const force = formData.get('force') === 'on';
  if (status.connected === 0 && !force) {
    return {
      ok: false,
      needsForce: true,
      message: 'No overlay is connected, so nothing would play on stream. Open the overlay in OBS first, or queue it anyway to play when one connects.',
    };
  }

  for (let i = 0; i < count; i++) {
    const id = crypto.randomUUID();
    // A pull is rolled here (lib/draw.ts) so the overlay can only save what was rolled. Gifts are never charged.
    const draw = kind === 'pull' ? await issueDraw(id, username) : undefined;
    if (kind === 'pull' && !draw) return { ok: false, message: 'The active season has no packs with cards to open.' };
    await enqueueEvent({ id, type: kind, username, queuedAt: Date.now(), ...(draw ? { draw } : {}) });
  }
  await recordActivity({ type: 'trigger', kind, username, source: 'admin', count });
  revalidatePath('/admin');
  revalidatePath('/admin/activity');

  const waiting = status.connected === 0 ? ' It will play when an overlay connects.' : '';
  return kind === 'pull'
    ? { ok: true, message: `Queued ${count} pack${count !== 1 ? 's' : ''} for ${username}.${waiting}` }
    : { ok: true, message: `Showing ${username}'s collection on stream.${waiting}` };
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

  const cardNumber = parseInt(String(formData.get('cardNumber') ?? ''), 10);
  const active = await getActiveSeasonWithPacks();
  if (!active) return { ok: false, message: 'There is no active season to grant a card in.' };
  const card = active.packs.flatMap(p => p.cards).find(c => c.number === cardNumber);
  if (!card) return { ok: false, message: 'Pick a card from the list.' };

  const collectionName = active.season.collectionName;
  const variant = parseVariant(formData.get('variant'));
  const made = await addCollectionEntryWithSerial(collectionName, username, encodeEntry(card.number, variant), 'grant');
  await ensureUserProfile(username);
  await recordActivity({ type: 'grant', source: 'admin', username, cardNumber: card.number, variant, collectionName, ...(made.copyId ? { copyId: made.copyId } : {}), ...(made.uid ? { uid: made.uid } : {}) });
  revalidatePath('/admin');
  revalidatePath('/admin/users');
  return { ok: true, message: `Granted ${variant === 'regular' ? '' : VARIANT_LABELS[variant] + ' '}${card.name} (#${card.number}) to ${username}.` };
}

export async function clearQueueAction(): Promise<ActionResult> {
  await requireAdmin();
  const n = await clearQueue();
  revalidatePath('/admin');
  return { ok: true, message: n > 0 ? `Cleared ${n} waiting event${n !== 1 ? 's' : ''}.` : 'The queue was already empty.' };
}
