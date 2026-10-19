'use server';

import { getSession } from '@/lib/session';
import { getUserSettings, saveUserSettings } from '@/lib/user-settings-store';
import { FAVOURITES_MAX } from '@/lib/user-settings';
import { withPinnedWidget } from '@/lib/profile-widgets';
import { loadCopyByUid } from '@/lib/copy-view';
import { isEscrow } from '@/lib/serials-core';

/** Pins one of the signed-in viewer's copies as their profile's Showcase copy, or unpins it (null). The viewer comes from the session, and the copy must really be theirs. */
export async function pinCopyAction(uid: number | null): Promise<{ ok: true; pinned: number | null } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'Log in to pin an edition.' };
  const s = await getUserSettings(session.username);
  if (uid === null) {
    const saved = await saveUserSettings(session.username, { ...s, pinned: null });
    return { ok: true, pinned: saved.pinned };
  }
  if (!Number.isInteger(uid)) return { ok: false, error: 'Unknown print.' };
  const found = await loadCopyByUid(uid);
  if (!found || found.copy.owner !== session.username) return { ok: false, error: 'You can only pin an edition you hold.' };
  const saved = await saveUserSettings(session.username, { ...s, pinned: uid, profileLayout: withPinnedWidget(s.profileLayout) });
  return { ok: true, pinned: saved.pinned };
}

/** Marks one of the signed-in viewer's prints as a favourite (it then can't be traded or spent in an upgrade), or removes the mark. */
export async function favouriteCopyAction(uid: number, on: boolean): Promise<{ ok: true; favourite: boolean } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'Log in to favourite an edition.' };
  if (!Number.isInteger(uid)) return { ok: false, error: 'Unknown print.' };
  const s = await getUserSettings(session.username);
  const rest = s.favourites.filter(n => n !== uid);
  if (!on) {
    const saved = await saveUserSettings(session.username, { ...s, favourites: rest });
    return { ok: true, favourite: saved.favourites.includes(uid) };
  }
  const found = await loadCopyByUid(uid);
  if (!found || found.copy.owner !== session.username) {
    return { ok: false, error: found && isEscrow(found.copy.owner) ? 'It is in an open offer.' : 'You can only favourite an edition you hold.' };
  }
  if (rest.length >= FAVOURITES_MAX) return { ok: false, error: `You can favourite up to ${FAVOURITES_MAX} prints. Unfavourite one first.` };
  const saved = await saveUserSettings(session.username, { ...s, favourites: [...rest, uid] });
  return { ok: true, favourite: saved.favourites.includes(uid) };
}
