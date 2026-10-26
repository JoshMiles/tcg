'use server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin-guard';
import { requireStaff } from '@/lib/staff-guard';
import { checkModerate } from '@/lib/staff';
import { recordAudit } from '@/lib/audit';
import { recordActivity } from '@/lib/activity';
import { addCollectionEntryWithSerial, ensureUserProfile, getActiveSeasonWithPacks, patchUserProfile } from '@/lib/kv';
import { cancelTrade } from '@/lib/trades';
import { cleanTags, mergeUsers, restoreUserSnapshot, saveFlags, saveTags } from '@/lib/user-admin';
import { VARIANTS, VARIANT_LABELS, encodeEntry } from '@/lib/variants';
import type { Variant } from '@/lib/types';
import { quickAction } from './actions/users';
import { addUserPullBuff, removeUserPullBuff, setUserBaseLimit } from '@/lib/pull-limit';

export interface UserActionResult { ok: boolean; message: string }

const revalidate = (username?: string) => {
  revalidatePath('/admin/users');
  revalidatePath('/mod/users');
  if (username) { revalidatePath(`/admin/users/${username.toLowerCase()}`); revalidatePath(`/mod/users/${username.toLowerCase()}`); }
};

// Mods may use the three moderation actions (tags, restrictions, cancelling an offer); everything else here is admin only.
// Each one asks canModerate (lib/staff-core.ts) first: nobody moderates themselves, mods can't act on staff or the streamer.
export async function saveTagsAction(username: string, tags: string[]): Promise<{ ok: true; tags: string[] } | { ok: false; message: string }> {
  const staff = await requireStaff('mod');
  const allowed = await checkModerate(staff, [username], 'tags');
  if (!allowed.ok) return { ok: false, message: allowed.error };
  const res = await saveTags(username, tags);
  if (!res.ok) return { ok: false, message: res.error };
  revalidate(username);
  return res;
}

export async function saveFlagsAction(username: string, flags: { noTrading: boolean; hideFromBoard: boolean; reason: string }): Promise<UserActionResult> {
  const staff = await requireStaff('mod');
  const allowed = await checkModerate(staff, [username], 'flags');
  if (!allowed.ok) return { ok: false, message: allowed.error };
  const res = await saveFlags(username, flags);
  if (!res.ok) return { ok: false, message: res.error };
  revalidate(username);
  revalidatePath('/leaderboard', 'layout');
  return { ok: true, message: flags.noTrading || flags.hideFromBoard ? 'Restrictions saved.' : 'Restrictions cleared.' };
}

/** Grants several cards at once, a number of copies of each, in one variant. Cards come from the ACTIVE season. */
export async function grantManyAction(username: string, cardNumbers: number[], variant: string, copies: number): Promise<UserActionResult> {
  await requireAdmin();
  const lower = username.toLowerCase();
  const v: Variant = (VARIANTS as readonly string[]).includes(variant) ? (variant as Variant) : 'regular';
  const n = Math.max(1, Math.min(20, Math.floor(copies) || 1));
  const active = await getActiveSeasonWithPacks();
  if (!active) return { ok: false, message: 'There is no active season to grant cards in.' };
  const known = new Map(active.packs.flatMap(p => p.cards).map(c => [c.number, c]));
  const picks = [...new Set(cardNumbers)].filter(c => known.has(c)).slice(0, 25);
  if (picks.length === 0) return { ok: false, message: 'Pick at least one card.' };
  const collectionName = active.season.collectionName;
  for (const cardNumber of picks) {
    let made: Awaited<ReturnType<typeof addCollectionEntryWithSerial>> | null = null;
    for (let i = 0; i < n; i++) made = await addCollectionEntryWithSerial(collectionName, lower, encodeEntry(cardNumber, v), 'grant');
    await recordActivity({ type: 'grant', source: 'admin', username: lower, cardNumber, variant: v, collectionName, ...(made?.copyId ? { copyId: made.copyId } : {}), ...(made?.uid ? { uid: made.uid } : {}) });
  }
  await ensureUserProfile(lower);
  const label = `${picks.length} card${picks.length === 1 ? '' : 's'} × ${n}${v === 'regular' ? '' : ` (${VARIANT_LABELS[v]})`}`;
  await recordAudit(lower, 'Cards granted', label);
  revalidate(lower);
  return { ok: true, message: `Granted ${label} to ${lower}.` };
}

export async function giftPacksAction(username: string, count: number, force = false): Promise<UserActionResult> {
  await requireAdmin();
  const fd = new FormData();
  fd.set('intent', 'gift');
  fd.set('username', username);
  fd.set('count', String(count));
  if (force) fd.set('force', 'on');
  const res = await quickAction(null, fd);
  if (res.ok) await recordAudit(username, 'Packs gifted', `${count} pack${count === 1 ? '' : 's'}`);
  return { ok: res.ok, message: res.message };
}

export async function restoreSnapshotAction(username: string, id: string): Promise<UserActionResult> {
  await requireAdmin();
  const res = await restoreUserSnapshot(username, id);
  revalidate(username);
  return res.ok ? { ok: true, message: `Restored ${res.cards} cards.` } : { ok: false, message: res.error };
}

export async function mergeUserAction(from: string, into: string): Promise<UserActionResult> {
  await requireAdmin();
  const res = await mergeUsers(from, into);
  revalidate(from);
  revalidate(into);
  return res.ok ? { ok: true, message: `Merged ${res.cards} cards into ${into.toLowerCase().replace(/^@/, '')}.` } : { ok: false, message: res.error };
}

/** Admin-cancels one of a viewer's open trade offers (the escrowed cards go back to their owner). */
export async function cancelUserTradeAction(username: string, tradeId: string): Promise<UserActionResult> {
  const staff = await requireStaff('mod');
  const res = await cancelTrade(tradeId, 'admin', { admin: true, reason: 'Cancelled by staff', actor: staff });
  revalidate(username);
  revalidatePath('/admin/trades');
  revalidatePath('/mod/trades');
  return res.ok ? { ok: true, message: 'Offer cancelled and the cards returned.' } : { ok: false, message: res.error };
}

// ── Bulk actions from the users list ──

export async function bulkGiftAction(usernames: string[], count: number): Promise<UserActionResult> {
  await requireAdmin();
  const names = [...new Set(usernames.map(u => u.toLowerCase()))].slice(0, 50);
  if (names.length === 0) return { ok: false, message: 'Select at least one viewer.' };
  let sent = 0;
  let refused = '';
  for (const u of names) {
    const r = await giftPacksAction(u, count, true);
    if (r.ok) sent++; else refused = r.message;
  }
  revalidate();
  return sent === names.length
    ? { ok: true, message: `Gifted ${count} pack${count === 1 ? '' : 's'} to ${sent} viewer${sent === 1 ? '' : 's'}.` }
    : { ok: sent > 0, message: `Gifted ${sent} of ${names.length}. ${refused}` };
}

/** Adds (or removes) a tag on several viewers. */
export async function bulkTagAction(usernames: string[], tag: string, mode: 'add' | 'remove'): Promise<UserActionResult> {
  await requireAdmin();
  const [clean] = cleanTags([tag]);
  if (!clean) return { ok: false, message: 'Enter a tag.' };
  const names = [...new Set(usernames.map(u => u.toLowerCase()))].slice(0, 200);
  for (const u of names) {
    await patchUserProfile(u, p => {
      const profile = p ?? { username: u, displayName: u, createdAt: Date.now() };
      return { ...profile, tags: cleanTags(mode === 'add' ? [...(profile.tags ?? []), clean] : (profile.tags ?? []).filter(t => t !== clean)) };
    });
    await recordAudit(u, mode === 'add' ? 'Tag added' : 'Tag removed', clean);
  }
  revalidate();
  return { ok: true, message: `${mode === 'add' ? 'Tagged' : 'Untagged'} ${names.length} viewer${names.length === 1 ? '' : 's'} “${clean}”.` };
}

// ── Pull limits per stream (ROADMAP 12.4) ──

/** Sets this viewer's own paid pulls per stream (empty = follow the default in Settings, 0 = no limit). */
export async function setPullLimitAction(username: string, value: string): Promise<UserActionResult> {
  await requireAdmin();
  const rec = await setUserBaseLimit(username, value.trim() === '' ? null : value);
  await recordAudit(username, 'Pull limit changed', rec.limit === null ? 'back to the default' : rec.limit === 0 ? 'no limit' : `${rec.limit} per stream`);
  revalidate(username);
  return { ok: true, message: rec.limit === null ? 'Using the default from Settings.' : rec.limit === 0 ? 'No limit for this viewer.' : `Limit set to ${rec.limit} per stream.` };
}

/** Adds a temporary bonus: +amount pulls per stream for some hours (empty = until removed). */
export async function addPullBuffAction(username: string, amount: string, hours: string, note: string): Promise<UserActionResult> {
  await requireAdmin();
  const rec = await addUserPullBuff(username, { amount, hours, source: 'admin', note });
  if (!rec) return { ok: false, message: 'Enter a bonus of 1 or more (and hours as a whole number). A viewer can hold up to 20 bonuses.' };
  await recordAudit(username, 'Pull bonus added', `+${Math.floor(Number(amount))} per stream${hours.trim() ? ` for ${Math.floor(Number(hours))} h` : ' until removed'}${note.trim() ? ` (${note.trim().slice(0, 60)})` : ''}`);
  revalidate(username);
  return { ok: true, message: 'Bonus added.' };
}

export async function removePullBuffAction(username: string, id: string): Promise<UserActionResult> {
  await requireAdmin();
  await removeUserPullBuff(username, id);
  await recordAudit(username, 'Pull bonus removed');
  revalidate(username);
  return { ok: true, message: 'Bonus removed.' };
}
