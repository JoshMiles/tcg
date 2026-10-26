'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { kv } from '@/lib/db';
import { IDS } from '@/lib/account-id';
import { findEarlierAccount } from '@/lib/account-restore';
import { cardsOf, declineAside, moveAccount } from '@/lib/account-move';

// Both actions take the viewer from the session and check every condition again: the notice on /account may be stale or forged.

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
  revalidatePath('/account');
  redirect(`/account?restored=${outcome}`);
}

/** Stops /account offering the earlier collection: this login is the account's home from now on. */
export async function keepSeparateAction() {
  const session = await getSession();
  if (!session) redirect('/auth/twitch?returnTo=/account');
  const found = await findEarlierAccount(session.username, session.twitchId);
  if (found) {
    if (found.owner.includes('~')) await declineAside(found.owner);
    await kv.hset(IDS, { [session.twitchId]: session.username });
  }
  revalidatePath('/account');
  redirect('/account');
}
