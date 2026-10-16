'use server';

import { getSession } from '@/lib/session';
import { getUserSettings, saveUserSettings } from '@/lib/user-settings-store';
import { withPinnedWidget } from '@/lib/profile-widgets';
import { loadCopyByUid } from '@/lib/copy-view';

/** Pins one of the signed-in viewer's copies as their profile's Showcase copy, or unpins it (null). The viewer comes from the session, and the copy must really be theirs. */
export async function pinCopyAction(uid: number | null): Promise<{ ok: true; pinned: number | null } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'Log in to pin a print.' };
  const s = await getUserSettings(session.username);
  if (uid === null) {
    const saved = await saveUserSettings(session.username, { ...s, pinned: null });
    return { ok: true, pinned: saved.pinned };
  }
  if (!Number.isInteger(uid)) return { ok: false, error: 'Unknown print.' };
  const found = await loadCopyByUid(uid);
  if (!found || found.copy.owner !== session.username) return { ok: false, error: 'You can only pin a print you hold.' };
  const saved = await saveUserSettings(session.username, { ...s, pinned: uid, profileLayout: withPinnedWidget(s.profileLayout) });
  return { ok: true, pinned: saved.pinned };
}
