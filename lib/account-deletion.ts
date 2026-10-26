import { deleteTesterRecord } from './access';
import { deleteUserPullLimit } from './pull-limit';
import { kv } from './db';
import { listSeasons, getUserProfile, deleteUserProfile, removeUserFromCollection } from './kv';
import { setHidden, takeUserSnapshot } from './user-admin';
import { cancelOpenTrades } from './trades';
import { deleteUserSettings } from './user-settings-store';
import { deleteAllDevices } from './push';
import { unlinkDiscord } from './discord-user';
import { recordAudit } from './audit';
import { recordActivity } from './activity';
import { deleteFeedbackOf } from './feedback';

// Deleting a viewer completely (admin "Delete this viewer", and the Users page delete). Order matters: open offers are cancelled first so
// escrowed prints go back to the viewer, then every collection is emptied (the print ledger retires what they held), then the rest.

export interface DeletionReport { snapshot: boolean; tradesCancelled: number; feedbackDeleted: number; opaqueRemoved: number }

/** Removes the Twitch extension's opaque-ID links that point at this viewer. Needs a key scan, so it is skipped where one is not possible (a sandbox). */
async function removeOpaqueLinks(user: string): Promise<number> {
  let removed = 0;
  try {
    let cursor: string | number = 0;
    for (let i = 0; i < 100; i++) {
      const [next, keys] = (await kv.scan(cursor, { match: 'twitch_opaque:*', count: 500 })) as [string | number, string[]];
      for (const k of keys) if (String(await kv.get(k)).toLowerCase() === user) { await kv.del(k); removed++; }
      cursor = next;
      if (String(cursor) === '0') break;
    }
  } catch { /* best effort */ }
  return removed;
}

export async function deleteViewerAccount(username: string): Promise<DeletionReport> {
  const user = username.toLowerCase();
  // Open offers first, so escrowed prints are back in the collection before the restore point is taken and before anything is retired.
  const tradesCancelled = await cancelOpenTrades({ username: user }, 'The account was deleted');
  const snapshot = !!(await takeUserSnapshot(user, 'Before deleting the account'));
  const seasons = await listSeasons();
  for (const s of seasons) await removeUserFromCollection(s.collectionName, user);
  const profile = await getUserProfile(user);
  await deleteUserProfile(user);
  await deleteUserPullLimit(user);
  await deleteUserSettings(user); // settings, pinned / favourites, watches and the watch index
  await deleteTesterRecord(user);
  await deleteAllDevices(user);
  await unlinkDiscord(user);
  await kv.del(`notif:${user}`, `notif:${user}:seen`, `notif:${user}:v`, `user:${user}:ach`, ...seasons.map(s => `user:${user}:scorehist:${s.id}`));
  await setHidden(user, false);
  const feedbackDeleted = await deleteFeedbackOf(user);
  const opaqueRemoved = await removeOpaqueLinks(user);
  await recordAudit(user, 'Account deleted', `cards, profile, settings, notices, alert devices and Discord links removed${profile ? '' : ' (there was no profile)'}; a restore point is kept for 14 days`);
  await recordActivity({ type: 'delete', username: user });
  return { snapshot, tradesCancelled, feedbackDeleted, opaqueRemoved };
}
